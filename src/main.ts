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
import { exportWithStats, exportClean, generateFilename } from './map/export'
import { createWalkList } from './ui/walk-list'
import type { Walk, PilgrimManifest } from './parsers/types'

const app = document.getElementById('app')!

let currentWalks: Walk[] = []
let currentManifest: PilgrimManifest | undefined
let activeMapRenderer: ReturnType<typeof createMapRenderer> | null = null
let activeOverlayRenderer: ReturnType<typeof createOverlayRenderer> | null = null

createDropZone(app, handleFile)

function goHome(): void {
  if (activeMapRenderer) { activeMapRenderer.remove(); activeMapRenderer = null }
  if (activeOverlayRenderer) { activeOverlayRenderer.remove(); activeOverlayRenderer = null }
  currentWalks = []
  currentManifest = undefined
  app.textContent = ''
  createDropZone(app, handleFile)
}

async function handleFile(name: string, buffer: ArrayBuffer): Promise<void> {
  try {
    if (name.endsWith('.pilgrim')) {
      const result = await parsePilgrim(buffer)
      currentWalks = result.walks
      currentManifest = result.manifest
    } else {
      const text = new TextDecoder().decode(buffer)
      currentWalks = parseGPX(text)
      currentManifest = undefined
    }

    if (currentWalks.length === 0) {
      throw new Error('No walks found in file')
    }

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

  if (activeMapRenderer) { activeMapRenderer.remove(); activeMapRenderer = null }
  if (activeOverlayRenderer) { activeOverlayRenderer.remove(); activeOverlayRenderer = null }

  const source = currentWalks[0].source
  const layout = createLayout(app, goHome)
  layout.showFileLoaded(source, handleFile)

  const mapRenderer = createMapRenderer(layout.mapContainer, token)
  activeMapRenderer = mapRenderer

  if (currentWalks.length > 1) {
    renderMultiWalk(layout, mapRenderer, token)
  } else {
    const walk = currentWalks[0]
    mapRenderer.showWalk(walk)
    renderPanels(layout.sidebar, walk, currentManifest)
  }
}

function renderMultiWalk(
  layout: { sidebar: HTMLElement; mapContainer: HTMLElement; overlayMapContainer: HTMLElement },
  mapRenderer: ReturnType<typeof createMapRenderer>,
  token: string,
): void {
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
      mapRenderer.showWalk(walk)
      renderPanels(layout.sidebar, walk, currentManifest)
    })

    const selectIdx = selectedWalk ? currentWalks.indexOf(selectedWalk) : 0
    walkList.select(selectIdx >= 0 ? selectIdx : 0)
  }

  function showOverlayMode(): void {
    layout.mapContainer.style.display = 'none'
    layout.overlayMapContainer.style.display = ''

    if (!overlayRenderer) {
      overlayRenderer = createOverlayRenderer(layout.overlayMapContainer, token)
      activeOverlayRenderer = overlayRenderer
      overlayRenderer.onWalkClick(handleOverlayWalkClick)
    }

    const filtered = selectedYear
      ? currentWalks.filter((w) => w.startDate.getFullYear() === selectedYear)
      : currentWalks
    overlayRenderer.showAllWalks(filtered)
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
      const colorSwitcher = renderColorSwitcher(panelsContent, (mode) => {
        colorMode = mode
        if (overlayRenderer) overlayRenderer.setColorMode(mode)
      })
      colorSwitcher.setMode(colorMode)

      const firstChild = panelsContent.firstChild
      const switcherEl = panelsContent.lastElementChild
      if (firstChild && switcherEl) {
        panelsContent.insertBefore(switcherEl, firstChild)
      }

      renderExportButtons(panelsContent,
        () => {
          if (!overlayRenderer) return
          const text = overlayRenderer.getStatsText()
          const filename = generateFilename('stats', selectedYear)
          exportWithStats(overlayRenderer.getMap().getCanvas(), text, filename)
        },
        () => {
          if (!overlayRenderer) return
          const filename = generateFilename('clean', selectedYear)
          exportClean(overlayRenderer.getMap().getCanvas(), layout.overlayMapContainer, filename)
        },
      )

      renderYearPicker(panelsContent, currentWalks, (year) => {
        selectedYear = year
        if (!overlayRenderer) return
        overlayRenderer.setSelectedYear(year)
        const filtered = year
          ? currentWalks.filter((w) => w.startDate.getFullYear() === year)
          : currentWalks
        overlayRenderer.showAllWalks(filtered)
        renderOverlaySidebarContent(null)
      })
    }
  }

  function handleOverlayWalkClick(walk: Walk): void {
    selectedWalk = walk
    if (overlayRenderer) overlayRenderer.highlightWalk(walk)
    renderOverlaySidebarContent(walk)
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
}
