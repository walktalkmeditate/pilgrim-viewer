import type { Walk, DeletableSection } from '../parsers/types'
import type { Staging } from './staging'

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
  const items = ctx.sidebar.querySelectorAll('.photo-thumbnail, .photo-item')
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
  const items = ctx.sidebar.querySelectorAll('.voice-recording, .transcription-item')
  Array.from(items).forEach((el, idx) => {
    const rec = ctx.walk.voiceRecordings[idx]
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

export function attachPauseDeletes(ctx: AffordanceContext): void {
  const items = ctx.sidebar.querySelectorAll('.pause-item, .timeline-pause')
  Array.from(items).forEach((el, idx) => {
    const pause = ctx.walk.pauses[idx]
    if (!pause) return
    const x = makeXButton('pause-x', 'Delete pause')
    x.addEventListener('click', e => {
      e.stopPropagation()
      const sd = Math.floor(pause.startDate.getTime() / 1000)
      ctx.staging.push({ op: 'delete_pause', walkId: ctx.walk.id, payload: { startDate: sd } })
    })
    el.appendChild(x)
  })
}

export function attachActivityDeletes(ctx: AffordanceContext): void {
  const items = ctx.sidebar.querySelectorAll('.activity-item, .timeline-activity')
  Array.from(items).forEach((el, idx) => {
    const activity = ctx.walk.activities[idx]
    if (!activity) return
    const x = makeXButton('activity-x', 'Delete activity segment')
    x.addEventListener('click', e => {
      e.stopPropagation()
      const sd = Math.floor(activity.startDate.getTime() / 1000)
      ctx.staging.push({ op: 'delete_activity', walkId: ctx.walk.id, payload: { startDate: sd } })
    })
    el.appendChild(x)
  })
}
