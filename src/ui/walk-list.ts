import type { Walk } from '../parsers/types'
import type { UnitSystem } from '../parsers/units'
import { formatDistance, formatDuration } from '../parsers/units'

function formatWalkDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function createWalkList(
  container: HTMLElement,
  walks: Walk[],
  onSelect: (walk: Walk, index: number) => void,
  unit: UnitSystem = 'metric',
): { select: (index: number) => void } {
  const list = document.createElement('div')
  list.className = 'walk-list'

  let selectedIndex = -1

  const items = walks.map((walk, index) => {
    const item = document.createElement('div')
    item.className = 'walk-list-item'

    const dateEl = document.createElement('div')
    dateEl.className = 'walk-list-date'
    dateEl.textContent = formatWalkDate(walk.startDate)

    const statsEl = document.createElement('div')
    statsEl.className = 'walk-list-stats'
    statsEl.textContent = `${formatDistance(walk.stats.distance, unit)} · ${formatDuration(walk.stats.activeDuration)}`

    item.appendChild(dateEl)
    item.appendChild(statsEl)

    item.addEventListener('click', () => select(index))

    list.appendChild(item)
    return item
  })

  container.appendChild(list)

  function select(index: number): void {
    if (selectedIndex >= 0 && selectedIndex < items.length) {
      items[selectedIndex].classList.remove('selected')
    }
    selectedIndex = index
    items[index].classList.add('selected')
    onSelect(walks[index], index)
  }

  if (items.length > 0) {
    selectedIndex = 0
    items[0].classList.add('selected')
  }

  return { select }
}
