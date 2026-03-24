import type { Activity, Walk } from '../parsers/types'

const ACTIVITY_COLORS: Record<Activity['type'], string> = {
  walk: 'var(--moss)',
  talk: 'var(--dawn)',
  meditate: 'var(--rust)',
}

const ACTIVITY_LABELS: Record<Activity['type'], string> = {
  walk: 'Walk',
  talk: 'Talk',
  meditate: 'Meditate',
}

function formatHHMM(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function createTimelineBar(walk: Walk, totalDuration: number): HTMLElement {
  const bar = document.createElement('div')
  bar.className = 'timeline-bar'

  for (const activity of walk.activities) {
    const offset = (activity.startDate.getTime() - walk.startDate.getTime()) / totalDuration
    const width = (activity.endDate.getTime() - activity.startDate.getTime()) / totalDuration

    const segment = document.createElement('div')
    segment.className = 'timeline-segment'
    segment.style.left = `${offset * 100}%`
    segment.style.width = `${width * 100}%`
    segment.style.background = ACTIVITY_COLORS[activity.type]

    bar.appendChild(segment)
  }

  return bar
}

function createTimeLabels(walk: Walk): HTMLElement {
  const times = document.createElement('div')
  times.className = 'timeline-times'

  const startLabel = document.createElement('span')
  startLabel.className = 'timeline-time'
  startLabel.textContent = formatHHMM(walk.startDate)

  const endLabel = document.createElement('span')
  endLabel.className = 'timeline-time'
  endLabel.textContent = formatHHMM(walk.endDate)

  times.appendChild(startLabel)
  times.appendChild(endLabel)
  return times
}

function createLegend(presentTypes: Set<Activity['type']>): HTMLElement {
  const legend = document.createElement('div')
  legend.className = 'timeline-legend'

  const orderedTypes: Activity['type'][] = ['walk', 'talk', 'meditate']

  for (const type of orderedTypes) {
    if (!presentTypes.has(type)) continue

    const item = document.createElement('span')
    item.className = 'timeline-legend-item'

    const dot = document.createElement('span')
    dot.className = 'breakdown-dot'
    dot.style.background = ACTIVITY_COLORS[type]

    const label = document.createElement('span')
    label.textContent = ACTIVITY_LABELS[type]

    item.appendChild(dot)
    item.appendChild(label)
    legend.appendChild(item)
  }

  return legend
}

export function renderTimelinePanel(container: HTMLElement, walk: Walk): void {
  if (walk.activities.length === 0) return

  const totalDuration = walk.endDate.getTime() - walk.startDate.getTime()

  const panel = document.createElement('div')
  panel.className = 'panel'

  const heading = document.createElement('h2')
  heading.className = 'panel-heading'
  heading.textContent = 'Timeline'
  panel.appendChild(heading)

  panel.appendChild(createTimelineBar(walk, totalDuration))
  panel.appendChild(createTimeLabels(walk))

  const presentTypes = new Set(walk.activities.map((a) => a.type))
  panel.appendChild(createLegend(presentTypes))

  container.appendChild(panel)
}
