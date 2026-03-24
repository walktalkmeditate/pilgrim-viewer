import './style.css'
import { createDropZone } from './ui/dropzone'
import { parsePilgrim } from './parsers/pilgrim'
import { parseGPX } from './parsers/gpx'
import type { Walk, PilgrimManifest } from './parsers/types'

const app = document.getElementById('app')!

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

    // TODO: render map + panels (next tasks)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to parse file'
    console.error('Parse error:', err)
    // Show error in dropzone (for now just log, will be improved in layout task)
  }
})
