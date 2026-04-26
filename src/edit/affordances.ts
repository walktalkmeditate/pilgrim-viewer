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
