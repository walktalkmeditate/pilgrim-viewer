import type { Walk } from '../parsers/types'
import { formatDistance, formatDuration, formatElevation, type UnitSystem } from '../parsers/units'

function createStatRow(label: string): { row: HTMLElement; valueEl: HTMLElement } {
  const row = document.createElement('div')
  row.className = 'stat-row'

  const labelEl = document.createElement('span')
  labelEl.className = 'stat-label'
  labelEl.textContent = label

  const valueEl = document.createElement('span')
  valueEl.className = 'stat-value'

  row.appendChild(labelEl)
  row.appendChild(valueEl)
  return { row, valueEl }
}

function createBreakdownBar(
  walk: Walk,
  activeDuration: number,
  talkDuration: number,
  meditateDuration: number,
): HTMLElement {
  const walkTime = Math.max(0, activeDuration - talkDuration - meditateDuration)
  const total = activeDuration

  const bar = document.createElement('div')
  bar.className = 'breakdown-bar'

  const walkSegment = document.createElement('div')
  walkSegment.className = 'breakdown-segment'
  walkSegment.style.background = 'var(--moss)'
  walkSegment.style.width = `${(walkTime / total) * 100}%`

  const talkSegment = document.createElement('div')
  talkSegment.className = 'breakdown-segment'
  talkSegment.style.background = 'var(--dawn)'
  talkSegment.style.width = `${(talkDuration / total) * 100}%`

  const meditateSegment = document.createElement('div')
  meditateSegment.className = 'breakdown-segment'
  meditateSegment.style.background = 'var(--rust)'
  meditateSegment.style.width = `${(meditateDuration / total) * 100}%`

  bar.appendChild(walkSegment)
  bar.appendChild(talkSegment)
  bar.appendChild(meditateSegment)

  const labels = document.createElement('div')
  labels.className = 'breakdown-labels'

  const segments: Array<{ color: string; name: string; seconds: number }> = [
    { color: 'var(--moss)', name: 'Walk', seconds: walkTime },
    { color: 'var(--dawn)', name: 'Talk', seconds: talkDuration },
    { color: 'var(--rust)', name: 'Meditate', seconds: meditateDuration },
  ]

  for (const seg of segments) {
    const labelEl = document.createElement('span')
    labelEl.className = 'breakdown-label'

    const dot = document.createElement('span')
    dot.className = 'breakdown-dot'
    dot.style.background = seg.color

    const text = document.createElement('span')
    text.textContent = `${seg.name} ${formatDuration(seg.seconds)}`

    labelEl.appendChild(dot)
    labelEl.appendChild(text)
    labels.appendChild(labelEl)
  }

  const wrapper = document.createElement('div')
  wrapper.appendChild(bar)
  wrapper.appendChild(labels)
  return wrapper
}

export function renderStatsPanel(
  container: HTMLElement,
  walk: Walk,
  unit: UnitSystem = 'metric',
): void {
  const panel = document.createElement('div')
  panel.className = 'panel'

  const heading = document.createElement('h2')
  heading.className = 'panel-heading'
  heading.textContent = 'Stats'
  panel.appendChild(heading)

  const { stats } = walk

  const distanceRow = createStatRow('Distance')
  const durationRow = createStatRow('Duration')
  const elevationRow = createStatRow('Elevation')

  distanceRow.valueEl.textContent = formatDistance(stats.distance, unit)
  durationRow.valueEl.textContent = formatDuration(stats.activeDuration)
  elevationRow.valueEl.textContent =
    `↑ ${formatElevation(stats.ascent, unit)}  ↓ ${formatElevation(stats.descent, unit)}`

  panel.appendChild(distanceRow.row)
  panel.appendChild(durationRow.row)
  panel.appendChild(elevationRow.row)

  if (stats.steps != null) {
    const stepsRow = createStatRow('Steps')
    stepsRow.valueEl.textContent = stats.steps.toLocaleString()
    panel.appendChild(stepsRow.row)
  }

  if (stats.burnedEnergy != null) {
    const energyRow = createStatRow('Energy')
    energyRow.valueEl.textContent = `${Math.round(stats.burnedEnergy)} kcal`
    panel.appendChild(energyRow.row)
  }

  const hasPilgrimData = stats.talkDuration > 0 || stats.meditateDuration > 0
  if (hasPilgrimData) {
    const breakdownWrapper = createBreakdownBar(
      walk,
      stats.activeDuration,
      stats.talkDuration,
      stats.meditateDuration,
    )
    panel.appendChild(breakdownWrapper)
  }

  container.appendChild(panel)
}
