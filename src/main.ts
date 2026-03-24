import './style.css'
import { createDropZone } from './ui/dropzone'
import { parsePilgrim } from './parsers/pilgrim'
import { parseGPX } from './parsers/gpx'
import { createMapRenderer } from './map/renderer'
import { getMapboxToken, renderTokenPrompt } from './map/token'
import { createLayout, renderPanels } from './ui/layout'
import { createWalkList } from './ui/walk-list'
import type { Walk, PilgrimManifest } from './parsers/types'

const app = document.getElementById('app')!

let currentWalks: Walk[] = []
let currentManifest: PilgrimManifest | undefined

const dropzone = createDropZone(app, handleFile)

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
    console.error(msg)
  }
}

function renderApp(): void {
  const token = getMapboxToken()
  if (!token || currentWalks.length === 0) return

  const source = currentWalks[0].source
  const layout = createLayout(app)
  layout.showFileLoaded(source, dropzone.openFilePicker)

  const mapRenderer = createMapRenderer(layout.mapContainer, token)

  if (currentWalks.length > 1) {
    createWalkList(layout.sidebar, currentWalks, (walk) => {
      mapRenderer.showWalk(walk)
      renderPanels(layout.sidebar, walk, currentManifest)
    })
  } else {
    const walk = currentWalks[0]
    mapRenderer.showWalk(walk)
    renderPanels(layout.sidebar, walk, currentManifest)
  }
}
