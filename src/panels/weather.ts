import type { Walk } from '../parsers/types'

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

export function renderWeatherPanel(container: HTMLElement, walk: Walk): void {
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
  tempEl.textContent = `${weather.temperature}°C`
  panel.appendChild(tempEl)

  const conditionEl = document.createElement('div')
  conditionEl.className = 'weather-condition'
  conditionEl.textContent = formatCondition(weather.condition)
  panel.appendChild(conditionEl)

  if (weather.humidity != null) {
    panel.appendChild(createStatRow('Humidity', `${weather.humidity}%`))
  }

  if (weather.windSpeed != null) {
    panel.appendChild(createStatRow('Wind', `${weather.windSpeed} m/s`))
  }

  container.appendChild(panel)
}
