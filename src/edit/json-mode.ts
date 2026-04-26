import type { Walk } from '../parsers/types'
import type { Staging } from './staging'

export interface JsonModeContext {
  walk: Walk
  rawWalk: unknown
  staging: Staging
  panelArea: HTMLElement
  // Called when JSON mode exits, so the host can re-render the panels.
  // The host typically calls renderPanels() inside this callback.
  onExit: () => void
}

export function attachJsonMode(ctx: JsonModeContext): { toggleButton: HTMLButtonElement } {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = '{ }'
  button.title = 'Edit walk JSON directly'
  button.className = 'panel-x'
  button.style.fontFamily = 'monospace'

  let active = false

  button.addEventListener('click', () => {
    if (active) {
      // Leaving JSON mode — let the host re-render the panels.
      active = false
      ctx.onExit()
      return
    }
    active = true

    // Replace the panel area with a textarea + error label.
    while (ctx.panelArea.firstChild) ctx.panelArea.removeChild(ctx.panelArea.firstChild)

    const textarea = document.createElement('textarea')
    textarea.className = 'editable-input'
    textarea.style.minHeight = '60vh'
    textarea.style.fontFamily = 'monospace'
    textarea.value = JSON.stringify(ctx.rawWalk, null, 2)

    const errorEl = document.createElement('div')
    errorEl.style.color = 'var(--error, #c33)'
    errorEl.style.fontSize = '0.85rem'

    textarea.addEventListener('blur', () => {
      try {
        const parsed = JSON.parse(textarea.value)
        errorEl.textContent = ''
        ctx.staging.push({
          op: 'replace_walk',
          walkId: ctx.walk.id,
          payload: { walk: parsed },
        })
      } catch (err) {
        errorEl.textContent = `Invalid JSON: ${(err as Error).message}`
      }
    })

    ctx.panelArea.appendChild(textarea)
    ctx.panelArea.appendChild(errorEl)
  })

  return { toggleButton: button }
}
