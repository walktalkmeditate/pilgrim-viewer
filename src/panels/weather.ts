import type { Walk } from '../parsers/types'
import type { UnitSystem } from '../parsers/units'

function formatCondition(condition: string): string {
  return condition
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function createStatRow(label: string, value: string): HTMLElement {
  const row = document.createElement('div')
  row.className = 'stat-row'

  const labelEl = document.createElement('span')
  labelEl.className = 'stat-label'
  labelEl.textContent = label

  const valueEl = document.createElement('span')
  valueEl.className = 'stat-value'
  valueEl.textContent = value

  row.appendChild(labelEl)
  row.appendChild(valueEl)
  return row
}

export function renderWeatherPanel(container: HTMLElement, walk: Walk, unit: UnitSystem = 'metric'): void {
  if (!walk.weather) return

  const { weather } = walk

  const panel = document.createElement('div')
  panel.className = 'panel'

  const heading = document.createElement('h2')
  heading.className = 'panel-heading'
  heading.textContent = 'Weather'
  panel.appendChild(heading)

  const tempEl = document.createElement('div')
  tempEl.className = 'weather-temp'
  if (unit === 'imperial') {
    tempEl.textContent = `${Math.round(weather.temperature * 9 / 5 + 32)}°F`
  } else {
    tempEl.textContent = `${Math.round(weather.temperature * 10) / 10}°C`
  }
  panel.appendChild(tempEl)

  const conditionEl = document.createElement('div')
  conditionEl.className = 'weather-condition'
  conditionEl.textContent = formatCondition(weather.condition)
  panel.appendChild(conditionEl)

  if (weather.humidity != null) {
    const pct = weather.humidity <= 1 ? Math.round(weather.humidity * 100) : Math.round(weather.humidity)
    panel.appendChild(createStatRow('Humidity', `${pct}%`))
  }

  if (weather.windSpeed != null) {
    if (unit === 'imperial') {
      panel.appendChild(createStatRow('Wind', `${Math.round(weather.windSpeed * 2.237)} mph`))
    } else {
      panel.appendChild(createStatRow('Wind', `${Math.round(weather.windSpeed * 10) / 10} m/s`))
    }
  }

  container.appendChild(panel)
}
