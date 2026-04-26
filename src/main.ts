import { initTheme, createMoonToggle } from './ui/moon-toggle'

initTheme()

import './style.css'
import { createDropZone } from './ui/dropzone'
import { parsePilgrim } from './parsers/pilgrim'
import { parseGPX } from './parsers/gpx'
import { createMapRenderer } from './map/renderer'
import { createOverlayRenderer } from './map/overlay'
import type { OverlayRenderer } from './map/overlay'
import { getMapboxToken, renderTokenPrompt } from './map/token'
import { createLayout, renderPanels, renderModeToggle, renderOverlaySidebar, renderColorSwitcher, renderExportButtons, renderYearPicker } from './ui/layout'
import type { ModeToggleResult } from './ui/layout'
import type { ColorMode } from './map/overlay'
import { showKeepsakeModal } from './ui/keepsake-modal'
import { createWalkList } from './ui/walk-list'
import { createUnitToggle, resolveInitialUnit } from './ui/unit-toggle'
import type { UnitSystem } from './parsers/units'
import { parsePilgrimWalkJSON } from './parsers/pilgrim'
import type { Walk, WalkPhoto, PilgrimManifest, PilgrimPreferences } from './parsers/types'
import { createPrivacyZone } from './ui/privacy-zone'
import { trimRouteEnds } from './parsers/route-trim'

const app = document.getElementById('app')!

const isEditHost = location.hostname.startsWith('edit.')
const isLocalDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
const enableEdit = isEditHost || (isLocalDev && new URLSearchParams(location.search).has('edit'))

let editApi: import('./edit').EditApi | null = null
let detachEdit: (() => void) | null = null
let detachStagingSub: (() => void) | null = null

// Per-render cleanup: drops the trim-handle markers (and any other
// DOM hooks `attachToWalkUI` returned). Called inside rerender BEFORE
// reattaching so handles don't accumulate across privacy/unit toggles.
function detachWalkUI(): void {
  if (detachEdit) {
    detachEdit()
    detachEdit = null
  }
}

// Per-app-mount cleanup: also drops the staging subscription so we
// don't leak listeners across renderApp() invocations. Called at the
// top of renderApp (before mounting a fresh layout) and on goHome.
// MUST NOT be called from rerender — that would orphan the subscription
// after a single rerender, breaking live preview on subsequent mods.
function detachAllEdit(): void {
  detachWalkUI()
  if (detachStagingSub) {
    detachStagingSub()
    detachStagingSub = null
  }
}
async function ensureEditMounted(headerControls: HTMLElement): Promise<void> {
  if (!enableEdit || editApi) return
  const { mountEditLayer } = await import('./edit')
  editApi = mountEditLayer(headerControls, app)
}

let currentWalks: Walk[] = []
let currentRawWalks: unknown[] = []
let currentManifest: PilgrimManifest | undefined
let originalPilgrimBuffer: ArrayBuffer | undefined
let originalGpxXml: string | undefined
let currentLoadedFilename: string | undefined
// Monotonic counter bumped on every handleFile entry AND on goHome.
// Each in-flight handleFile captures a local snapshot at entry; after
// the async parse resolves, it compares the captured value to the live
// counter. A mismatch means a newer handleFile call (or a goHome)
// superseded it, so the pending parse releases its own photo URLs and
// bails without touching global state. Prevents rapid successive drops
// from leaking blob URLs and from overwriting each other's state.
let handleFileGeneration = 0
let activeMapRenderer: ReturnType<typeof createMapRenderer> | null = null
let activeOverlayRenderer: ReturnType<typeof createOverlayRenderer> | null = null
let currentUnit: UnitSystem = resolveInitialUnit()
let currentIsGold = false
let activeDropZone: { stop: () => void } | null = null
const privacyZone = createPrivacyZone()

activeDropZone = createDropZone(app, handleFile)

window.addEventListener('pilgrimdatarequest', () => {
  if (currentWalks.length > 0 && currentWalks[0].source === 'pilgrim') {
    window.dispatchEvent(new CustomEvent('pilgrimdataresponse', {
      detail: { walks: currentWalks, rawWalks: currentRawWalks, manifest: currentManifest, trimMeters: privacyZone.getMeters() },
    }))
  }
})

window.addEventListener('pilgrim-edit-save-requested', async () => {
  if (!editApi) return
  if (currentWalks.length === 0) return
  const source = currentWalks[0].source
  const originalFilename = currentLoadedFilename ?? (source === 'pilgrim' ? 'walk.pilgrim' : 'walk.gpx')
  if (source === 'pilgrim') {
    if (!currentManifest || !originalPilgrimBuffer) return
    await editApi.saveAll({
      source: 'pilgrim',
      originalBuffer: originalPilgrimBuffer,
      manifest: currentManifest,
      rawWalks: currentRawWalks,
      originalFilename,
    })
  } else {
    if (!originalGpxXml) return
    await editApi.saveAll({ source: 'gpx', originalXml: originalGpxXml, originalFilename })
  }
})

interface PilgrimViewerAPI {
  loadData(data: {
    walks: unknown[]
    manifest?: { preferences?: PilgrimPreferences; [key: string]: unknown }
    isGold?: boolean
  }): void
}

const pilgrimViewer: PilgrimViewerAPI = {
  loadData(data) {
    try {
      if (!data || typeof data !== 'object' || !Array.isArray(data.walks)) {
        console.error('pilgrimViewer.loadData: invalid data — expected { walks: [...] }')
        return
      }
      const walks = data.walks.map((raw) => parsePilgrimWalkJSON(raw))
      if (walks.length === 0) return

      // loadData replaces state synchronously. Bump the generation
      // counter so any in-flight handleFile sees a mismatch on its
      // post-await commit check and bails out instead of overwriting
      // the JS bridge data.
      handleFileGeneration += 1
      releaseWalkPhotoURLs(currentWalks)
      currentWalks = walks
      currentIsGold = !!data.isGold
      currentManifest = data.manifest
        ? {
            schemaVersion: String(data.manifest.schemaVersion ?? '1.0'),
            exportDate: Number(data.manifest.exportDate ?? Date.now() / 1000),
            appVersion: String(data.manifest.appVersion ?? '1.0.0'),
            walkCount: walks.length,
            preferences: data.manifest.preferences ?? {
              distanceUnit: 'km',
              altitudeUnit: 'm',
              speedUnit: 'min/km',
              energyUnit: 'kcal',
            },
          }
        : undefined

      void renderApp()
    } catch (err) {
      console.error('pilgrimViewer.loadData failed:', err)
    }
  },
}

;(window as unknown as { pilgrimViewer: PilgrimViewerAPI }).pilgrimViewer = pilgrimViewer

// Revoke every blob URL attached to `walks`' reliquary photos.
// parsePilgrim mints these via URL.createObjectURL and they stay alive
// for the lifetime of the document unless we explicitly release them —
// loading several .pilgrim files in one session would otherwise leak
// ~80KB per photo indefinitely.
function releaseWalkPhotoURLs(walks: Walk[]): void {
  for (const walk of walks) {
    if (!walk.photos) continue
    for (const photo of walk.photos) {
      URL.revokeObjectURL(photo.url)
    }
  }
}

function goHome(): void {
  // Invalidate any in-flight handleFile so its post-await commit is
  // skipped — otherwise a slow parse that resolves after the user
  // went home would swap the app back into walk view.
  handleFileGeneration += 1
  detachAllEdit()
  editApi = null
  if (activeDropZone) { activeDropZone.stop(); activeDropZone = null }
  if (activeMapRenderer) { activeMapRenderer.remove(); activeMapRenderer = null }
  if (activeOverlayRenderer) { activeOverlayRenderer.remove(); activeOverlayRenderer = null }
  releaseWalkPhotoURLs(currentWalks)
  currentWalks = []
  currentRawWalks = []
  currentManifest = undefined
  window.dispatchEvent(new CustomEvent('pilgrimdataclear'))
  app.textContent = ''
  activeDropZone = createDropZone(app, handleFile)
}

async function handleFile(name: string, buffer: ArrayBuffer): Promise<void> {
  handleFileGeneration += 1
  const generation = handleFileGeneration
  const previousWalks = currentWalks
  try {
    let newWalks: Walk[]
    let newRawWalks: unknown[] = []
    let newManifest: PilgrimManifest | undefined
    let pendingPilgrimBuffer: ArrayBuffer | undefined
    let pendingGpxXml: string | undefined

    if (name.endsWith('.pilgrim')) {
      pendingPilgrimBuffer = buffer
      const result = await parsePilgrim(buffer)
      newWalks = result.walks
      newRawWalks = result.rawWalks
      newManifest = result.manifest
    } else {
      const text = new TextDecoder().decode(buffer)
      pendingGpxXml = text
      newWalks = parseGPX(text)
    }

    if (generation !== handleFileGeneration) {
      // A newer handleFile (or goHome) superseded this call while we
      // were awaiting the parse. Release any photo URLs we just
      // created and bail without touching global state — previousWalks
      // is still whatever is currently in currentWalks (managed by
      // the caller that bumped the counter).
      releaseWalkPhotoURLs(newWalks)
      return
    }

    if (newWalks.length === 0) {
      throw new Error('No walks found in file')
    }

    // Commit the new walks first, THEN release the previous walks' blob
    // URLs — if the parse had thrown, `previousWalks` would still be in
    // `currentWalks` with live URLs, avoiding broken thumbnails.
    currentWalks = newWalks
    currentRawWalks = newRawWalks
    currentManifest = newManifest
    originalPilgrimBuffer = pendingPilgrimBuffer
    originalGpxXml = pendingGpxXml
    currentLoadedFilename = name
    releaseWalkPhotoURLs(previousWalks)

    if (currentWalks[0].source === 'pilgrim') {
      window.dispatchEvent(new CustomEvent('pilgrimdata', {
        detail: { source: 'pilgrim', walkCount: currentWalks.length, trimMeters: privacyZone.getMeters() },
      }))
    }

    currentUnit = resolveInitialUnit(currentManifest?.preferences)

    const token = getMapboxToken()
    if (!token) {
      app.textContent = ''
      renderTokenPrompt(app, () => { void renderApp() })
      return
    }

    void renderApp()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to parse file'
    console.error('Parse error:', err)
    showError(msg)
  }
}

function showError(message: string): void {
  app.textContent = ''
  const errorZone = document.createElement('div')
  errorZone.className = 'dropzone'

  const heading = document.createElement('h1')
  heading.className = 'dropzone-title'
  heading.textContent = 'Pilgrim Viewer'

  const errorMsg = document.createElement('p')
  errorMsg.className = 'dropzone-error visible'
  errorMsg.textContent = message

  const retryBtn = document.createElement('button')
  retryBtn.className = 'dropzone-button'
  retryBtn.textContent = 'Try Another File'
  retryBtn.addEventListener('click', () => {
    app.textContent = ''
    createDropZone(app, handleFile)
  })

  errorZone.appendChild(heading)
  errorZone.appendChild(errorMsg)
  errorZone.appendChild(retryBtn)
  app.appendChild(errorZone)
}

async function renderApp(): Promise<void> {
  const token = getMapboxToken()
  if (!token || currentWalks.length === 0) return

  detachAllEdit()
  if (activeDropZone) { activeDropZone.stop(); activeDropZone = null }
  if (activeMapRenderer) { activeMapRenderer.remove(); activeMapRenderer = null }
  if (activeOverlayRenderer) { activeOverlayRenderer.remove(); activeOverlayRenderer = null }

  const source = currentWalks[0].source
  const layout = createLayout(app, goHome)
  layout.showFileLoaded(source, handleFile)

  let rerender: () => void = () => {}

  createUnitToggle(layout.headerControls, currentUnit, (unit) => {
    currentUnit = unit
    if (activeOverlayRenderer) activeOverlayRenderer.setUnit(unit)
    rerender()
  })
  layout.headerControls.appendChild(privacyZone.container)
  createMoonToggle(layout.headerControls)
  if (enableEdit) {
    await ensureEditMounted(layout.headerControls)
  }

  function applyPrivacy(walk: Walk): Walk {
    const meters = privacyZone.getMeters()
    if (meters <= 0) return walk
    return { ...walk, route: trimRouteEnds(walk.route, meters) }
  }


  privacyZone.onChange(() => rerender())

  const mapRenderer = createMapRenderer(layout.mapContainer, token)
  activeMapRenderer = mapRenderer

  // Pans the map to a photo's coordinates when the user taps a
  // thumbnail in the Photos panel. Keeps the current zoom if it's
  // already close; otherwise zooms to 14 so the user can see the
  // marker and its neighbours.
  const onPhotoSelect = (photo: WalkPhoto): void => {
    const map = mapRenderer.getMap()
    map.flyTo({
      center: [photo.lng, photo.lat],
      zoom: Math.max(map.getZoom(), 14),
    })
  }

  if (currentWalks.length > 1) {
    rerender = renderMultiWalk(layout, mapRenderer, token, applyPrivacy, onPhotoSelect)
  } else {
    const walk = currentWalks[0]
    let displayWalk = walk
    if (editApi) {
      const tended = editApi.applyMods(walk, editApi.staging.list())
      if (tended) displayWalk = tended
    }
    const pf = privacyZone.getMeters() > 0
    mapRenderer.showWalk(applyPrivacy(displayWalk), { privacyFade: pf })
    renderPanels(layout.sidebar, displayWalk, currentManifest, currentUnit, onPhotoSelect)

    if (editApi && walk.source === 'pilgrim') {
      detachWalkUI()
      detachEdit = editApi.attachToWalkUI({
        walk,
        rawWalk: currentRawWalks[currentWalks.indexOf(walk)],
        sidebar: layout.sidebar,
        map: mapRenderer.getMap(),
        refreshPreview: () => mapRenderer.showWalk(applyPrivacy(walk), { privacyFade: privacyZone.getMeters() > 0 }),
      })
    }

    rerender = () => {
      let displayWalk = walk
      if (editApi) {
        const tended = editApi.applyMods(walk, editApi.staging.list())
        if (tended) displayWalk = tended
      }
      const pf = privacyZone.getMeters() > 0
      mapRenderer.showWalk(applyPrivacy(displayWalk), { privacyFade: pf })
      renderPanels(layout.sidebar, displayWalk, currentManifest, currentUnit, onPhotoSelect)
      if (editApi && walk.source === 'pilgrim') {
        detachWalkUI()
        detachEdit = editApi.attachToWalkUI({
          walk,
          rawWalk: currentRawWalks[currentWalks.indexOf(walk)],
          sidebar: layout.sidebar,
          map: mapRenderer.getMap(),
          refreshPreview: () => mapRenderer.showWalk(applyPrivacy(walk), { privacyFade: privacyZone.getMeters() > 0 }),
        })
      }
    }
  }

  if (editApi) {
    detachStagingSub = editApi.staging.subscribe(() => rerender())
  }
}

function renderMultiWalk(
  layout: { sidebar: HTMLElement; mapContainer: HTMLElement; overlayMapContainer: HTMLElement; headerControls: HTMLElement },
  mapRenderer: ReturnType<typeof createMapRenderer>,
  token: string,
  applyPrivacy: (walk: Walk) => Walk,
  onPhotoSelect: (photo: WalkPhoto) => void,
): () => void {
  let mode: 'list' | 'overlay' = 'list'
  let selectedWalk: Walk | null = null
  let overlayRenderer: OverlayRenderer | null = null
  let walkList: { select: (index: number) => void } | null = null
  let modeToggle: ModeToggleResult | null = null
  let colorMode: ColorMode = 'season'
  let selectedYear: number | null = null

  function showListMode(): void {
    layout.mapContainer.style.display = ''
    layout.overlayMapContainer.style.display = 'none'
    layout.sidebar.textContent = ''

    modeToggle = renderModeToggle(layout.sidebar, handleModeToggle)
    modeToggle.setMode('list')

    walkList = createWalkList(layout.sidebar, currentWalks, (walk) => {
      selectedWalk = walk
      let displayWalk = walk
      if (editApi) {
        const tended = editApi.applyMods(walk, editApi.staging.list())
        if (tended) displayWalk = tended
      }
      const pf = privacyZone.getMeters() > 0
      mapRenderer.showWalk(applyPrivacy(displayWalk), { privacyFade: pf })
      renderPanels(layout.sidebar, displayWalk, currentManifest, currentUnit, onPhotoSelect)
      if (editApi && walk.source === 'pilgrim') {
        detachWalkUI()
        detachEdit = editApi.attachToWalkUI({
          walk,
          rawWalk: currentRawWalks[currentWalks.indexOf(walk)],
          sidebar: layout.sidebar,
          map: mapRenderer.getMap(),
          refreshPreview: () => mapRenderer.showWalk(applyPrivacy(walk), { privacyFade: privacyZone.getMeters() > 0 }),
        })
      }
    }, currentUnit)

    if (editApi) {
      editApi.attachToWalkListUI({ walks: currentWalks, sidebar: layout.sidebar })
    }

    const selectIdx = selectedWalk ? currentWalks.indexOf(selectedWalk) : 0
    walkList.select(selectIdx >= 0 ? selectIdx : 0)
  }

  function showOverlayMode(): void {
    layout.mapContainer.style.display = 'none'
    layout.overlayMapContainer.style.display = ''

    if (!overlayRenderer) {
      overlayRenderer = createOverlayRenderer(layout.overlayMapContainer, token)
      activeOverlayRenderer = overlayRenderer
      overlayRenderer.setUnit(currentUnit)
      overlayRenderer.onWalkClick(handleOverlayWalkClick)
    }

    const filtered = selectedYear
      ? currentWalks.filter((w) => w.startDate.getFullYear() === selectedYear)
      : currentWalks
    overlayRenderer.showAllWalks(filtered.map(w => applyPrivacy(w)))
    renderOverlaySidebarContent(null)
  }

  function renderOverlaySidebarContent(walk: Walk | null): void {
    layout.sidebar.textContent = ''

    modeToggle = renderModeToggle(layout.sidebar, handleModeToggle)
    modeToggle.setMode('overlay')

    const walksForSidebar = selectedYear
      ? currentWalks.filter((w) => w.startDate.getFullYear() === selectedYear)
      : currentWalks

    renderOverlaySidebar(layout.sidebar, walksForSidebar, {
      selectedWalk: walk ?? undefined,
      manifest: currentManifest,
      colorMode,
      unit: currentUnit,
      onWalkClick: (w) => {
        handleOverlayWalkClick(w)
      },
      onBackToList: walk
        ? () => {
            selectedWalk = null
            if (overlayRenderer) overlayRenderer.clearSelection()
            renderOverlaySidebarContent(null)
          }
        : undefined,
      onClearSelection: walk
        ? () => {
            selectedWalk = null
            if (overlayRenderer) overlayRenderer.clearSelection()
            renderOverlaySidebarContent(null)
          }
        : undefined,
    })

    const panelsContent = layout.sidebar.querySelector<HTMLElement>('.panels-content')
    if (panelsContent) {
      const colorSwitcherContainer = document.createElement('div')
      panelsContent.insertBefore(colorSwitcherContainer, panelsContent.firstChild)
      const colorSwitcher = renderColorSwitcher(colorSwitcherContainer, (mode) => {
        colorMode = mode
        if (overlayRenderer) overlayRenderer.setColorMode(mode)
        renderOverlaySidebarContent(walk)
      })
      colorSwitcher.setMode(colorMode)

      const walksForExport = selectedYear
        ? currentWalks.filter((w) => w.startDate.getFullYear() === selectedYear)
        : currentWalks

      renderExportButtons(panelsContent,
        (theme) => {
          if (!overlayRenderer) return
          const text = overlayRenderer.getStatsText(currentUnit)
          showKeepsakeModal(
            overlayRenderer.getMap(), text, walksForExport,
            currentUnit, selectedYear, theme as 'gold' | 'silver' | 'sepia' | 'forest',
            currentIsGold,
          )
        },
      )

      renderYearPicker(panelsContent, currentWalks, (year) => {
        selectedYear = year
        if (!overlayRenderer) return
        overlayRenderer.setSelectedYear(year)
        const filtered = year
          ? currentWalks.filter((w) => w.startDate.getFullYear() === year)
          : currentWalks
        overlayRenderer.showAllWalks(filtered.map(w => applyPrivacy(w)))
        renderOverlaySidebarContent(null)
      })
    }
  }

  function handleOverlayWalkClick(walk: Walk): void {
    if (selectedWalk === walk) {
      selectedWalk = null
      if (overlayRenderer) overlayRenderer.clearSelection()
      renderOverlaySidebarContent(null)
    } else {
      selectedWalk = walk
      if (overlayRenderer) overlayRenderer.highlightWalk(walk)
      renderOverlaySidebarContent(walk)
    }
  }

  function handleModeToggle(newMode: 'list' | 'overlay'): void {
    if (newMode === mode) return
    mode = newMode

    if (mode === 'list') {
      if (overlayRenderer) {
        overlayRenderer.clear()
      }
      showListMode()
    } else {
      showOverlayMode()
    }
  }

  showListMode()

  return () => {
    if (mode === 'list') {
      showListMode()
    } else {
      showOverlayMode()
    }
  }
}
