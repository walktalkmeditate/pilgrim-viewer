import type { Walk } from '../parsers/types'

export function renderIntentionPanel(container: HTMLElement, walk: Walk): void {
  if (!walk.intention && !walk.reflection?.text) return

  const panel = document.createElement('div')
  panel.className = 'panel'

  if (walk.intention) {
    const intentionEl = document.createElement('p')
    intentionEl.className = 'intention-text'
    intentionEl.textContent = walk.intention
    panel.appendChild(intentionEl)
  }

  if (walk.reflection?.text) {
    const divider = document.createElement('hr')
    divider.className = 'panel-divider'
    panel.appendChild(divider)

    if (walk.reflection.style) {
      const styleLabel = document.createElement('p')
      styleLabel.className = 'reflection-style'
      styleLabel.textContent = walk.reflection.style
      panel.appendChild(styleLabel)
    }

    const reflectionEl = document.createElement('p')
    reflectionEl.className = 'reflection-text'
    reflectionEl.textContent = walk.reflection.text
    panel.appendChild(reflectionEl)
  }

  container.appendChild(panel)
}
