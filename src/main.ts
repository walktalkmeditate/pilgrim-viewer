import './style.css'
import { createDropZone } from './ui/dropzone'
import { parsePilgrim } from './parsers/pilgrim'
import { parseGPX } from './parsers/gpx'
import { createMapRenderer } from './map/renderer'
import { getMapboxToken, renderTokenPrompt } from './map/token'
import type { Walk, PilgrimManifest } from './parsers/types'

const app = document.getElementById('app')!

function renderMap(app: HTMLElement, walks: Walk[], token: string): void {
  app.textContent = ''

  const layout = document.createElement('div')
  layout.className = 'app-layout'

  const sidebar = document.createElement('div')
  sidebar.className = 'sidebar'
  sidebar.textContent = `${walks.length} walk(s) loaded`

  const mapContainer = document.createElement('div')
  mapContainer.className = 'map-container'

  layout.appendChild(sidebar)
  layout.appendChild(mapContainer)
  app.appendChild(layout)

  const mapRenderer = createMapRenderer(mapContainer, token)
  mapRenderer.showWalk(walks[0])
}

createDropZone(app, async (name, buffer) => {
  try {
    let walks: Walk[]
    let manifest: PilgrimManifest | undefined

    if (name.endsWith('.pilgrim')) {
      const result = await parsePilgrim(buffer)
      walks = result.walks
      manifest = result.manifest
    } else {
      const text = new TextDecoder().decode(buffer)
      walks = parseGPX(text)
    }

    console.log(`Parsed ${walks.length} walk(s)`, walks)
    if (manifest) console.log('Manifest:', manifest)

    const token = getMapboxToken()
    if (!token) {
      app.textContent = ''
      renderTokenPrompt(app, (newToken) => {
        renderMap(app, walks, newToken)
      })
      return
    }

    renderMap(app, walks, token)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to parse file'
    console.error('Parse error:', err)
    console.error(msg)
  }
})
