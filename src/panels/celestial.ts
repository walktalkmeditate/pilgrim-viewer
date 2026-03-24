import type { Walk } from '../parsers/types'

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function splitCamelCase(str: string): string {
  return str
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim()
}

function createSection(): HTMLElement {
  const section = document.createElement('div')
  section.className = 'celestial-section'
  return section
}

function createLabel(text: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'celestial-label'
  el.textContent = text
  return el
}

function createValue(text: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'celestial-value'
  el.textContent = text
  return el
}

function createDetail(text: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'celestial-detail'
  el.textContent = text
  return el
}

export function renderCelestialPanel(container: HTMLElement, walk: Walk): void {
  if (!walk.celestial) return

  const { celestial } = walk

  const panel = document.createElement('div')
  panel.className = 'panel'

  const heading = document.createElement('h2')
  heading.className = 'panel-heading'
  heading.textContent = 'Celestial'
  panel.appendChild(heading)

  // Lunar Phase
  const lunarSection = createSection()
  lunarSection.appendChild(createLabel('Lunar Phase'))
  lunarSection.appendChild(createValue(celestial.lunarPhase.name))
  lunarSection.appendChild(
    createDetail(`${Math.round(celestial.lunarPhase.illumination * 100)}% illuminated`)
  )
  lunarSection.appendChild(
    createDetail(celestial.lunarPhase.isWaxing ? 'Waxing' : 'Waning')
  )
  panel.appendChild(lunarSection)

  // Planetary Hour
  const hourSection = createSection()
  hourSection.appendChild(createLabel('Planetary Hour'))
  hourSection.appendChild(createValue(`Hour of ${capitalize(celestial.planetaryHour.planet)}`))
  hourSection.appendChild(
    createDetail(`Day of ${capitalize(celestial.planetaryHour.planetaryDay)}`)
  )
  panel.appendChild(hourSection)

  // Element Balance
  const { elementBalance } = celestial
  const elements: Array<{ key: keyof typeof elementBalance; label: string }> = [
    { key: 'fire', label: 'Fire' },
    { key: 'earth', label: 'Earth' },
    { key: 'air', label: 'Air' },
    { key: 'water', label: 'Water' },
  ]

  const elementsLabel = createLabel('Element Balance')
  panel.appendChild(elementsLabel)

  const elementsContainer = document.createElement('div')
  elementsContainer.className = 'celestial-elements'

  for (const { key, label } of elements) {
    const badge = document.createElement('span')
    badge.className = 'element-badge'
    if (elementBalance.dominant && key === elementBalance.dominant.toLowerCase()) {
      badge.className += ' element-dominant'
    }
    badge.textContent = `${label}: ${elementBalance[key]}`
    elementsContainer.appendChild(badge)
  }

  panel.appendChild(elementsContainer)

  // Planetary Positions
  const positionsLabel = createLabel('Planetary Positions')
  panel.appendChild(positionsLabel)

  const positionsContainer = document.createElement('div')
  positionsContainer.className = 'celestial-positions'

  for (const pos of celestial.planetaryPositions) {
    const row = document.createElement('div')
    row.className = 'position-row'
    if (pos.isRetrograde) {
      row.className += ' position-retrograde'
    }
    const retrograde = pos.isRetrograde ? ' ℞' : ''
    row.textContent = `${capitalize(pos.planet)} in ${pos.sign} ${pos.degree}°${retrograde}`
    positionsContainer.appendChild(row)
  }

  panel.appendChild(positionsContainer)

  // Seasonal Marker
  if (celestial.seasonalMarker) {
    const markerSection = createSection()
    markerSection.appendChild(createLabel('Seasonal Marker'))
    markerSection.appendChild(createValue(splitCamelCase(celestial.seasonalMarker)))
    panel.appendChild(markerSection)
  }

  container.appendChild(panel)
}
