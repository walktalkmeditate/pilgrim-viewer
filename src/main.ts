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
import type { Walk, PilgrimManifest, PilgrimPreferences } from './parsers/types'
import { createPrivacyZone } from './ui/privacy-zone'
import { trimRouteEnds } from './parsers/route-trim'

const app = document.getElementById('app')!

let currentWalks: Walk[] = []
let currentRawWalks: unknown[] = []
let currentManifest: PilgrimManifest | undefined
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

      renderApp()
    } catch (err) {
      console.error('pilgrimViewer.loadData failed:', err)
    }
  },
}

;(window as unknown as { pilgrimViewer: PilgrimViewerAPI }).pilgrimViewer = pilgrimViewer

function goHome(): void {
  if (activeDropZone) { activeDropZone.stop(); activeDropZone = null }
  if (activeMapRenderer) { activeMapRenderer.remove(); activeMapRenderer = null }
  if (activeOverlayRenderer) { activeOverlayRenderer.remove(); activeOverlayRenderer = null }
  currentWalks = []
  currentRawWalks = []
  currentManifest = undefined
  window.dispatchEvent(new CustomEvent('pilgrimdataclear'))
  app.textContent = ''
  activeDropZone = createDropZone(app, handleFile)
}

async function handleFile(name: string, buffer: ArrayBuffer): Promise<void> {
  try {
    if (name.endsWith('.pilgrim')) {
      const result = await parsePilgrim(buffer)
      currentWalks = result.walks
      currentRawWalks = result.rawWalks
      currentManifest = result.manifest
    } else {
      const text = new TextDecoder().decode(buffer)
      currentWalks = parseGPX(text)
      currentRawWalks = []
      currentManifest = undefined
    }

    if (currentWalks.length === 0) {
      throw new Error('No walks found in file')
    }

    if (currentWalks[0].source === 'pilgrim') {
      window.dispatchEvent(new CustomEvent('pilgrimdata', {
        detail: { source: 'pilgrim', walkCount: currentWalks.length, trimMeters: privacyZone.getMeters() },
      }))
    }

    currentUnit = resolveInitialUnit(currentManifest?.preferences)

    const token = getMapboxToken()
    if (!token) {
      app.textContent = ''
      renderTokenPrompt(app, () => renderApp())
      return
    }

    renderApp()
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

function renderApp(): void {
  const token = getMapboxToken()
  if (!token || currentWalks.length === 0) return

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

  function applyPrivacy(walk: Walk): Walk {
    const meters = privacyZone.getMeters()
    if (meters <= 0) return walk
    return { ...walk, route: trimRouteEnds(walk.route, meters) }
  }


  privacyZone.onChange(() => rerender())

  const mapRenderer = createMapRenderer(layout.mapContainer, token)
  activeMapRenderer = mapRenderer

  if (currentWalks.length > 1) {
    rerender = renderMultiWalk(layout, mapRenderer, token, applyPrivacy)
  } else {
    const walk = currentWalks[0]
    const pf = privacyZone.getMeters() > 0
    mapRenderer.showWalk(applyPrivacy(walk), { privacyFade: pf })
    renderPanels(layout.sidebar, walk, currentManifest, currentUnit)

    rerender = () => {
      const pf = privacyZone.getMeters() > 0
      mapRenderer.showWalk(applyPrivacy(walk), { privacyFade: pf })
      renderPanels(layout.sidebar, walk, currentManifest, currentUnit)
    }
  }
}

function renderMultiWalk(
  layout: { sidebar: HTMLElement; mapContainer: HTMLElement; overlayMapContainer: HTMLElement; headerControls: HTMLElement },
  mapRenderer: ReturnType<typeof createMapRenderer>,
  token: string,
  applyPrivacy: (walk: Walk) => Walk,
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
      const pf = privacyZone.getMeters() > 0
      mapRenderer.showWalk(applyPrivacy(walk), { privacyFade: pf })
      renderPanels(layout.sidebar, walk, currentManifest, currentUnit)
    }, currentUnit)

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
