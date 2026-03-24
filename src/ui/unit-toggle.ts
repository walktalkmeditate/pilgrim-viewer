import type { UnitSystem } from '../parsers/units'

const STORAGE_KEY = 'pilgrim-viewer-units'

function getStoredUnit(): UnitSystem | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'metric' || stored === 'imperial') return stored
  } catch { /* localStorage unavailable */ }
  return null
}

export function resolveInitialUnit(unitPrefs?: { distanceUnit?: string }): UnitSystem {
  const stored = getStoredUnit()
  if (stored) return stored
  if (unitPrefs?.distanceUnit === 'mi') return 'imperial'
  return 'metric'
}

export function createUnitToggle(
  container: HTMLElement,
  initialUnit: UnitSystem,
  onChange: (unit: UnitSystem) => void,
): { setUnit: (unit: UnitSystem) => void } {
  const wrapper = document.createElement('div')
  wrapper.className = 'unit-toggle'

  const kmBtn = document.createElement('button')
  kmBtn.className = 'unit-toggle-option'
  kmBtn.textContent = 'km'

  const miBtn = document.createElement('button')
  miBtn.className = 'unit-toggle-option'
  miBtn.textContent = 'mi'

  function setUnit(unit: UnitSystem): void {
    kmBtn.classList.toggle('active', unit === 'metric')
    miBtn.classList.toggle('active', unit === 'imperial')
    try { localStorage.setItem(STORAGE_KEY, unit) } catch { /* unavailable */ }
  }

  setUnit(initialUnit)

  kmBtn.addEventListener('click', () => {
    setUnit('metric')
    onChange('metric')
  })

  miBtn.addEventListener('click', () => {
    setUnit('imperial')
    onChange('imperial')
  })

  wrapper.appendChild(kmBtn)
  wrapper.appendChild(miBtn)
  container.appendChild(wrapper)

  return { setUnit }
}
