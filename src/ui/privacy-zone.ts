const STORAGE_KEY = 'pilgrim-viewer-privacy-meters'
const DEFAULT_METERS = 200
const PRESETS = [0, 200, 500, 800]

export interface PrivacyZoneResult {
  container: HTMLElement
  getMeters: () => number
  onChange: (cb: (meters: number) => void) => void
}

function loadMeters(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return parseInt(stored, 10)
  } catch {}
  return DEFAULT_METERS
}

function saveMeters(meters: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(meters))
  } catch {}
}

export function createPrivacyZone(): PrivacyZoneResult {
  let currentMeters = loadMeters()
  const listeners: ((meters: number) => void)[] = []

  const container = document.createElement('div')
  container.className = 'privacy-zone'

  const toggle = document.createElement('button')
  toggle.className = 'privacy-toggle'
  toggle.title = 'Privacy zone'

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('width', '14')
  svg.setAttribute('height', '14')
  svg.style.display = 'block'
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', 'M8 1L2 4v4c0 3.5 2.6 6.4 6 7 3.4-.6 6-3.5 6-7V4L8 1z')
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', 'currentColor')
  path.setAttribute('stroke-width', '1.2')
  path.setAttribute('stroke-linejoin', 'round')
  svg.appendChild(path)
  toggle.appendChild(svg)

  const panel = document.createElement('div')
  panel.className = 'privacy-panel'

  const label = document.createElement('div')
  label.className = 'privacy-label'
  label.textContent = 'Privacy zone'

  const desc = document.createElement('div')
  desc.className = 'privacy-desc'
  desc.textContent = 'Hide the start and end of each walk to protect your location when sharing publicly.'

  const sliderRow = document.createElement('div')
  sliderRow.className = 'privacy-slider-row'

  const slider = document.createElement('input')
  slider.type = 'range'
  slider.min = '0'
  slider.max = '800'
  slider.step = '50'
  slider.value = String(currentMeters)
  slider.className = 'privacy-slider'

  const valueLabel = document.createElement('span')
  valueLabel.className = 'privacy-value'
  valueLabel.textContent = formatMeters(currentMeters)

  const presetRow = document.createElement('div')
  presetRow.className = 'privacy-presets'

  function updateValue(meters: number): void {
    currentMeters = meters
    slider.value = String(meters)
    valueLabel.textContent = formatMeters(meters)
    toggle.classList.toggle('active', meters > 0)
    path.setAttribute('fill', meters > 0 ? 'currentColor' : 'none')
    saveMeters(meters)
    listeners.forEach(cb => cb(meters))

    presetRow.querySelectorAll('.privacy-preset').forEach((btn) => {
      const el = btn as HTMLElement
      el.classList.toggle('selected', parseInt(el.dataset.meters ?? '0', 10) === meters)
    })
  }

  PRESETS.forEach(m => {
    const btn = document.createElement('button')
    btn.className = 'privacy-preset'
    btn.dataset.meters = String(m)
    btn.textContent = m === 0 ? 'Off' : m + 'm'
    btn.addEventListener('click', (e) => { e.stopPropagation(); updateValue(m) })
    presetRow.appendChild(btn)
  })

  slider.addEventListener('input', () => {
    updateValue(parseInt(slider.value, 10))
  })

  toggle.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? '' : 'none'
  })

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target as Node)) {
      panel.style.display = 'none'
    }
  })

  sliderRow.appendChild(slider)
  sliderRow.appendChild(valueLabel)
  panel.appendChild(label)
  panel.appendChild(desc)
  panel.appendChild(sliderRow)
  panel.appendChild(presetRow)

  container.appendChild(toggle)
  container.appendChild(panel)

  panel.style.display = 'none'
  updateValue(currentMeters)

  return {
    container,
    getMeters: () => currentMeters,
    onChange: (cb) => { listeners.push(cb) },
  }
}

function formatMeters(m: number): string {
  if (m === 0) return 'Off'
  if (m < 1000) return m + 'm'
  return (m / 1000).toFixed(1) + 'km'
}
