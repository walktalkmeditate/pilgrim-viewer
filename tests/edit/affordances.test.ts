// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { attachPhotoDeletes, attachVoiceRecordingDeletes, attachInlineEditors } from '../../src/edit/affordances'
import { createStaging } from '../../src/edit/staging'
import type { Walk, WalkPhoto, VoiceRecording } from '../../src/parsers/types'

function makeWalk(overrides: Partial<Walk> = {}): Walk {
  return {
    id: 'w1',
    startDate: new Date(1_000_000),
    endDate: new Date(2_000_000),
    stats: {
      distance: 0, activeDuration: 0, pauseDuration: 0,
      ascent: 0, descent: 0, talkDuration: 0, meditateDuration: 0,
    },
    route: { type: 'FeatureCollection', features: [] },
    voiceRecordings: [],
    activities: [],
    pauses: [],
    source: 'pilgrim',
    ...overrides,
  }
}

// Mirrors the actual photos panel rendering shape — `.photos-grid-item`
// buttons wrapped by `.photos-grid` (see src/panels/photos.ts).
function renderPhotosGrid(sidebar: HTMLElement, photos: WalkPhoto[]): void {
  const grid = document.createElement('div')
  grid.className = 'photos-grid'
  for (const _ of photos) {
    const btn = document.createElement('button')
    btn.className = 'photos-grid-item'
    grid.appendChild(btn)
  }
  sidebar.appendChild(grid)
}

// Mirrors the transcriptions panel — `.transcription-entry` rows with
// `.transcription-text` children, ONLY for recordings that have a
// transcription (see src/panels/transcriptions.ts).
function renderTranscriptions(sidebar: HTMLElement, recs: VoiceRecording[]): void {
  const list = document.createElement('div')
  list.className = 'transcriptions-list'
  for (const r of recs) {
    if (!r.transcription) continue
    const entry = document.createElement('div')
    entry.className = 'transcription-entry'
    const text = document.createElement('div')
    text.className = 'transcription-text'
    text.textContent = r.transcription
    entry.appendChild(text)
    list.appendChild(entry)
  }
  sidebar.appendChild(list)
}

describe('attachPhotoDeletes', () => {
  let sidebar: HTMLElement
  beforeEach(() => {
    sidebar = document.createElement('div')
    document.body.appendChild(sidebar)
  })

  it('stamps a × button onto each .photos-grid-item and stages delete_photo with the right localIdentifier', () => {
    const staging = createStaging()
    const photos: WalkPhoto[] = [
      { localIdentifier: 'p1', capturedAt: new Date(1), lat: 0, lng: 0, url: 'blob:1' },
      { localIdentifier: 'p2', capturedAt: new Date(2), lat: 0, lng: 0, url: 'blob:2' },
    ]
    const walk = makeWalk({ photos })
    renderPhotosGrid(sidebar, photos)

    attachPhotoDeletes({ staging, walk, sidebar })

    const xs = sidebar.querySelectorAll<HTMLButtonElement>('.photo-x')
    expect(xs.length).toBe(2)

    xs[1].click()
    expect(staging.list()).toHaveLength(1)
    expect(staging.list()[0].op).toBe('delete_photo')
    expect((staging.list()[0].payload as { localIdentifier: string }).localIdentifier).toBe('p2')
  })
})

describe('attachVoiceRecordingDeletes', () => {
  let sidebar: HTMLElement
  beforeEach(() => {
    sidebar = document.createElement('div')
    document.body.appendChild(sidebar)
  })

  it('skips recordings without a transcription so DOM index aligns with the filtered visible list', () => {
    const staging = createStaging()
    const recs: VoiceRecording[] = [
      { startDate: new Date(1_000_000), endDate: new Date(1_010_000), duration: 10 }, // NO transcription — panel hides it
      { startDate: new Date(2_000_000), endDate: new Date(2_010_000), duration: 10, transcription: 'visible-1' },
      { startDate: new Date(3_000_000), endDate: new Date(3_010_000), duration: 10, transcription: 'visible-2' },
    ]
    const walk = makeWalk({ voiceRecordings: recs })
    renderTranscriptions(sidebar, recs)  // Renders only recs[1] and recs[2]

    attachVoiceRecordingDeletes({ staging, walk, sidebar })

    const xs = sidebar.querySelectorAll<HTMLButtonElement>('.voice-x')
    expect(xs.length).toBe(2)

    // Click the FIRST × in the rendered list — should target the
    // first VISIBLE recording (recs[1]), not recs[0] (which has no
    // transcription and isn't rendered).
    xs[0].click()
    const list = staging.list()
    expect(list).toHaveLength(1)
    expect(list[0].op).toBe('delete_voice_recording')
    const targetedStartDate = (list[0].payload as { startDate: number }).startDate
    expect(targetedStartDate).toBe(Math.floor(2_000_000 / 1000))
  })
})

describe('attachInlineEditors — transcription filter alignment', () => {
  let sidebar: HTMLElement
  beforeEach(() => {
    sidebar = document.createElement('div')
    document.body.appendChild(sidebar)
    document.body.classList.add('tend-on')
  })

  it('attaches the inline editor to the FIRST visible transcription, not the underlying voiceRecordings[0]', () => {
    const staging = createStaging()
    const recs: VoiceRecording[] = [
      { startDate: new Date(1_000_000), endDate: new Date(1_010_000), duration: 10 }, // hidden
      { startDate: new Date(2_000_000), endDate: new Date(2_010_000), duration: 10, transcription: 'first visible' },
    ]
    const walk = makeWalk({ voiceRecordings: recs })
    renderTranscriptions(sidebar, recs)

    attachInlineEditors({ staging, walk, sidebar })

    // Simulate user clicking into the first rendered transcription text.
    const textEl = sidebar.querySelector<HTMLElement>('.transcription-text')!
    textEl.click()

    const input = textEl.querySelector<HTMLTextAreaElement>('.editable-input')!
    expect(input).not.toBeNull()
    input.value = 'corrected'
    input.dispatchEvent(new Event('blur'))

    const list = staging.list()
    expect(list).toHaveLength(1)
    expect(list[0].op).toBe('edit_transcription')
    const payload = list[0].payload as { recordingStartDate: number; text: string }
    expect(payload.recordingStartDate).toBe(Math.floor(2_000_000 / 1000)) // not 1000
    expect(payload.text).toBe('corrected')
  })
})
