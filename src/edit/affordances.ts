import type { Walk, DeletableSection, GeoJSONFeature } from '../parsers/types'
import type { Staging } from './staging'
import { showArchiveModal } from './archive-modal'
import { distanceFromStart } from '../panels/waypoints'

export interface AffordanceContext {
  staging: Staging
  walk: Walk
  sidebar: HTMLElement
}

function makeXButton(className: string, title: string): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = className
  btn.title = title
  btn.textContent = '×'
  return btn
}

// Inject section × buttons into existing panel headers.
// Called after the viewer's renderPanels() has populated the sidebar.
export function attachSectionDeletes(ctx: AffordanceContext): void {
  const intentionEl = ctx.sidebar.querySelector('.intention-text')
  if (intentionEl && ctx.walk.intention) {
    const x = makeXButton('panel-x', 'Delete intention')
    x.addEventListener('click', e => {
      e.stopPropagation()
      ctx.staging.push({ op: 'delete_section', walkId: ctx.walk.id, payload: { section: 'intention' } })
    })
    intentionEl.appendChild(x)
  }
  const reflectionEl = ctx.sidebar.querySelector('.reflection-text')
  if (reflectionEl && ctx.walk.reflection) {
    const x = makeXButton('panel-x', 'Delete reflection')
    x.addEventListener('click', e => {
      e.stopPropagation()
      ctx.staging.push({ op: 'delete_section', walkId: ctx.walk.id, payload: { section: 'reflection' } })
    })
    reflectionEl.appendChild(x)
  }
  // Weather + celestial — by panel-section heading text (viewer doesn't
  // expose dedicated classes for these as of writing).
  const sections = ctx.sidebar.querySelectorAll('.panel')
  for (const section of Array.from(sections)) {
    const heading = section.querySelector('h2, h3, .panel-heading')?.textContent ?? ''
    let target: DeletableSection | null = null
    if (/weather/i.test(heading) && ctx.walk.weather) target = 'weather'
    else if (/celestial|moon|lunar/i.test(heading) && ctx.walk.celestial) target = 'celestial'
    if (!target) continue
    const t = target  // narrow for closure
    const x = makeXButton('panel-x', `Delete ${t}`)
    x.addEventListener('click', e => {
      e.stopPropagation()
      ctx.staging.push({ op: 'delete_section', walkId: ctx.walk.id, payload: { section: t } })
    })
    const headingEl = section.querySelector('h2, h3, .panel-heading')
    if (headingEl) headingEl.appendChild(x)
  }
}

export function attachPhotoDeletes(ctx: AffordanceContext): void {
  if (!ctx.walk.photos) return
  // Photos panel iterates walk.photos directly (`renderPhotosPanel`),
  // so DOM index aligns with the array.
  const items = ctx.sidebar.querySelectorAll('.photos-grid-item')
  Array.from(items).forEach((el, idx) => {
    const photo = ctx.walk.photos![idx]
    if (!photo) return
    const x = makeXButton('photo-x', 'Delete photo')
    x.addEventListener('click', e => {
      e.stopPropagation()
      ctx.staging.push({ op: 'delete_photo', walkId: ctx.walk.id, payload: { localIdentifier: photo.localIdentifier } })
    })
    el.appendChild(x)
  })
}

export function attachVoiceRecordingDeletes(ctx: AffordanceContext): void {
  // Transcriptions panel only renders entries that HAVE a transcription
  // (`renderTranscriptionsPanel` filters on `r.transcription`), so the
  // DOM list maps to the filtered subset, not `walk.voiceRecordings`.
  const visibleRecs = ctx.walk.voiceRecordings.filter(r => r.transcription)
  const items = ctx.sidebar.querySelectorAll('.transcription-entry')
  Array.from(items).forEach((el, idx) => {
    const rec = visibleRecs[idx]
    if (!rec) return
    const x = makeXButton('voice-x', 'Delete voice recording')
    x.addEventListener('click', e => {
      e.stopPropagation()
      const sd = Math.floor(rec.startDate.getTime() / 1000)
      ctx.staging.push({ op: 'delete_voice_recording', walkId: ctx.walk.id, payload: { startDate: sd } })
    })
    el.appendChild(x)
  })
}

export function attachWaypointDeletes(ctx: AffordanceContext): void {
  const waypoints = ctx.walk.route.features.filter(
    (f): f is GeoJSONFeature => f.geometry.type === 'Point' && f.properties.markerType === 'waypoint',
  )
  if (waypoints.length === 0) return

  // Same sort renderWaypointsPanel uses (distance from route start),
  // so DOM index lines up with this array.
  const sorted = waypoints
    .map(wp => ({ wp, dist: distanceFromStart(ctx.walk, wp.geometry.coordinates as number[]) }))
    .sort((a, b) => a.dist - b.dist)

  const items = ctx.sidebar.querySelectorAll<HTMLElement>('.waypoint-item')
  Array.from(items).forEach((el, idx) => {
    const wp = sorted[idx]?.wp
    if (!wp) return
    const [lng, lat] = wp.geometry.coordinates as number[]
    const x = makeXButton('panel-x', 'Delete waypoint')
    x.addEventListener('click', e => {
      e.stopPropagation()
      ctx.staging.push({ op: 'delete_waypoint', walkId: ctx.walk.id, payload: { lat, lng } })
    })
    el.appendChild(x)
  })
}

// Pauses are not rendered as discrete list items in the current viewer
// timeline panel, so the × affordance has no DOM target. The op still
// works via the staging API + JSON expert mode; surfacing it in the UI
// is a v2 concern (would need a dedicated pauses list panel).
export function attachPauseDeletes(_ctx: AffordanceContext): void {
  return
}

// Activities render as positioned bars inside `.timeline-bar` rather
// than as list items; per-segment × buttons would be a hostile UX given
// the visual scale. Same v1/v2 stance as pauses.
export function attachActivityDeletes(_ctx: AffordanceContext): void {
  return
}

export function attachInlineEditors(ctx: AffordanceContext): void {
  const intentionEl = ctx.sidebar.querySelector<HTMLElement>('.intention-text')
  if (intentionEl && ctx.walk.intention) attachSingleLineEditor(intentionEl, ctx.walk.intention, text => {
    ctx.staging.push({ op: 'edit_intention', walkId: ctx.walk.id, payload: { text } })
  })

  const reflectionEl = ctx.sidebar.querySelector<HTMLElement>('.reflection-text')
  if (reflectionEl && ctx.walk.reflection?.text) {
    attachMultiLineEditor(reflectionEl, ctx.walk.reflection.text, text => {
      ctx.staging.push({ op: 'edit_reflection_text', walkId: ctx.walk.id, payload: { text } })
    })
  }

  // Voice transcriptions — DOM list is the filtered subset
  // (recordings with `r.transcription` populated), matching
  // attachVoiceRecordingDeletes above.
  const visibleRecs = ctx.walk.voiceRecordings.filter(r => r.transcription)
  const transcriptionEls = ctx.sidebar.querySelectorAll<HTMLElement>('.transcription-text')
  Array.from(transcriptionEls).forEach((el, idx) => {
    const rec = visibleRecs[idx]
    if (!rec || !rec.transcription) return
    attachMultiLineEditor(el, rec.transcription, text => {
      const sd = Math.floor(rec.startDate.getTime() / 1000)
      ctx.staging.push({ op: 'edit_transcription', walkId: ctx.walk.id, payload: { recordingStartDate: sd, text } })
    })
  })
}

// `el` may contain a sibling `.panel-x` delete button injected earlier
// by attachSectionDeletes — using `el.textContent` for the input value
// would slurp the "×" glyph into the editable text, and wiping
// textContent erases the × button along with the original text. Both
// editors save the × reference before wiping and re-append it on
// commit so the delete affordance survives an edit cycle, and seed
// the input from `initial` (the source-of-truth text without the ×).
function attachSingleLineEditor(el: HTMLElement, initial: string, onCommit: (text: string) => void): void {
  el.classList.add('editable-text')
  el.addEventListener('click', () => {
    if (!document.body.classList.contains('tend-on')) return
    if (el.querySelector('.editable-input')) return
    const xButton = el.querySelector('.panel-x')
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'editable-input'
    input.value = initial
    el.textContent = ''
    el.appendChild(input)
    input.focus()
    input.select()
    function commit(): void {
      const text = input.value.trim()
      el.textContent = text || initial
      if (xButton) el.appendChild(xButton)
      if (text && text !== initial) onCommit(text)
    }
    input.addEventListener('blur', commit)
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur() }
      if (e.key === 'Escape') { input.value = initial; input.blur() }
    })
  })
}

function attachMultiLineEditor(el: HTMLElement, initial: string, onCommit: (text: string) => void): void {
  el.classList.add('editable-text')
  el.addEventListener('click', () => {
    if (!document.body.classList.contains('tend-on')) return
    if (el.querySelector('.editable-input')) return
    const xButton = el.querySelector('.panel-x')
    const input = document.createElement('textarea')
    input.className = 'editable-input'
    input.rows = Math.max(2, Math.ceil(initial.length / 60))
    input.value = initial
    el.textContent = ''
    el.appendChild(input)
    input.focus()
    function commit(): void {
      const text = input.value.trim()
      el.textContent = text || initial
      if (xButton) el.appendChild(xButton)
      if (text && text !== initial) onCommit(text)
    }
    input.addEventListener('blur', commit)
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); input.blur() }
      if (e.key === 'Escape') { input.value = initial; input.blur() }
    })
  })
}

export interface WalkListAffordanceContext {
  staging: Staging
  walks: Walk[]
  sidebar: HTMLElement
}

export function attachWalkListDeletes(ctx: WalkListAffordanceContext): void {
  const items = ctx.sidebar.querySelectorAll<HTMLElement>('.walk-list-item')
  Array.from(items).forEach((el, idx) => {
    const walk = ctx.walks[idx]
    if (!walk) return

    const isArchived = ctx.staging.list().some(m => m.op === 'archive_walk' && m.walkId === walk.id)
    if (isArchived) {
      el.classList.add('pending-archive')
      const tag = document.createElement('span')
      tag.className = 'pending-archive-tag'
      tag.textContent = 'Pending archive'
      el.appendChild(tag)
      return
    }

    const x = makeXButton('walk-list-x', 'Archive walk')
    x.addEventListener('click', async e => {
      e.stopPropagation()
      const label = walk.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      const ok = await showArchiveModal(label)
      if (!ok) return
      ctx.staging.push({ op: 'archive_walk', walkId: walk.id, payload: {} as Record<string, never> })
    })
    el.appendChild(x)
  })
}
