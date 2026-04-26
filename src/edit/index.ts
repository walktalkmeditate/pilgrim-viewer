import './edit.css'
import { createStaging } from './staging'
import { createTendToggle } from './tend-toggle'
import { createStagingDrawer } from './drawer'
import { serializeTendedPilgrim, serializeTendedGpx, triggerDownload } from './save'
import {
  attachSectionDeletes, attachPhotoDeletes, attachVoiceRecordingDeletes,
  attachPauseDeletes, attachActivityDeletes, attachInlineEditors,
  attachWalkListDeletes,
} from './affordances'
import { attachTrimHandles, getLiveTrim } from './trim-handles'
import type { Walk, PilgrimManifest } from '../parsers/types'
import type mapboxgl from 'mapbox-gl'

export interface EditApi {
  staging: ReturnType<typeof createStaging>
  toggle: ReturnType<typeof createTendToggle>
  attachToWalkUI(opts: {
    walk: Walk
    rawWalk?: unknown
    sidebar: HTMLElement
    map?: mapboxgl.Map
    refreshPreview: () => void
  }): () => void
  attachToWalkListUI(opts: { walks: Walk[]; sidebar: HTMLElement }): void
  saveAll(opts: SaveOptions): Promise<void>
  getIncludeHistory(): boolean
}

export interface SaveOptions {
  source: 'pilgrim' | 'gpx'
  originalBuffer?: ArrayBuffer
  originalXml?: string
  manifest?: PilgrimManifest
  rawWalks?: unknown[]
  originalFilename: string
}

export function mountEditLayer(headerControls: HTMLElement, app: HTMLElement): EditApi {
  const staging = createStaging()
  const toggle = createTendToggle(false)
  headerControls.appendChild(toggle.element)

  const drawerHost = document.createElement('div')
  app.appendChild(drawerHost)

  let pendingHistoryToggle = true

  const drawer = createStagingDrawer(staging, {
    onSave: includeHistory => {
      pendingHistoryToggle = includeHistory
      window.dispatchEvent(new CustomEvent('pilgrim-edit-save-requested'))
    },
  })
  drawerHost.appendChild(drawer.element)

  const api: EditApi = {
    staging,
    toggle,
    attachToWalkUI({ walk, sidebar, map, refreshPreview }) {
      const cleanups: (() => void)[] = []
      attachSectionDeletes({ staging, walk, sidebar })
      attachPhotoDeletes({ staging, walk, sidebar })
      attachVoiceRecordingDeletes({ staging, walk, sidebar })
      attachPauseDeletes({ staging, walk, sidebar })
      attachActivityDeletes({ staging, walk, sidebar })
      attachInlineEditors({ staging, walk, sidebar })
      if (map) {
        const handles = attachTrimHandles({ map, walk, staging, refreshPreview })
        cleanups.push(() => handles.destroy())
      }
      return () => { for (const c of cleanups) c() }
    },
    attachToWalkListUI({ walks, sidebar }) {
      attachWalkListDeletes({ staging, walks, sidebar })
    },
    async saveAll(opts) {
      let result: { blob: Blob; filename: string }
      if (opts.source === 'pilgrim') {
        if (!opts.originalBuffer || !opts.manifest || !opts.rawWalks) {
          throw new Error('pilgrim save requires buffer + manifest + rawWalks')
        }
        result = await serializeTendedPilgrim({
          originalBuffer: opts.originalBuffer,
          manifest: opts.manifest,
          rawWalks: opts.rawWalks,
          modifications: staging.list(),
          includeHistory: pendingHistoryToggle,
          originalFilename: opts.originalFilename,
        })
      } else {
        if (!opts.originalXml) throw new Error('gpx save requires originalXml')
        result = await serializeTendedGpx({
          originalXml: opts.originalXml,
          modifications: staging.list(),
          originalFilename: opts.originalFilename,
        })
      }
      triggerDownload(result.blob, result.filename)
      staging.clear()
    },
    getIncludeHistory: () => pendingHistoryToggle,
  }

  return api
}

export { getLiveTrim }
