const SYNODIC_MONTH = 29.53059
const KNOWN_NEW_MOON = new Date(2000, 0, 6, 18, 14)
const STORAGE_KEY = 'pilgrim-viewer-theme'
const CANVAS_SIZE = 32

type Theme = 'light' | 'dark'

function getMoonPhase(date: Date): number {
  const diffMs = date.getTime() - KNOWN_NEW_MOON.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return ((diffDays % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH / SYNODIC_MONTH
}

function getMoonPhaseName(phase: number): string {
  if (phase < 0.0625) return 'New Moon'
  if (phase < 0.1875) return 'Waxing Crescent'
  if (phase < 0.3125) return 'First Quarter'
  if (phase < 0.4375) return 'Waxing Gibbous'
  if (phase < 0.5625) return 'Full Moon'
  if (phase < 0.6875) return 'Waning Gibbous'
  if (phase < 0.8125) return 'Last Quarter'
  if (phase < 0.9375) return 'Waning Crescent'
  return 'New Moon'
}

function getStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch { /* localStorage unavailable */ }
  return null
}

function getPreferredTheme(): Theme {
  const stored = getStoredTheme()
  if (stored) return stored

  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }

  return 'light'
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
  try { localStorage.setItem(STORAGE_KEY, theme) } catch { /* unavailable */ }
}

export function initTheme(): void {
  applyTheme(getPreferredTheme())
}

function renderMoonCanvas(container: HTMLElement): void {
  const phase = getMoonPhase(new Date())
  const name = getMoonPhaseName(phase)

  container.setAttribute('aria-label', name)
  container.setAttribute('title', name)

  const half = CANVAS_SIZE / 2

  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_SIZE * 2
  canvas.height = CANVAS_SIZE * 2
  canvas.style.width = CANVAS_SIZE + 'px'
  canvas.style.height = CANVAS_SIZE + 'px'
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const lit = isDark ? '#F0EBE1' : '#B8AFA2'
  const shadow = isDark ? '#1C1914' : '#F5F0E8'

  ctx.scale(2, 2)

  ctx.beginPath()
  ctx.arc(half, half, half, 0, Math.PI * 2)
  ctx.fillStyle = lit
  ctx.fill()

  ctx.beginPath()
  if (phase < 0.5) {
    const sweep = 1 - phase * 4
    ctx.arc(half, half, half, -Math.PI / 2, Math.PI / 2, false)
    ctx.bezierCurveTo(
      half + half * sweep, half + half * 0.55,
      half + half * sweep, half - half * 0.55,
      half, half - half,
    )
  } else {
    const sweep = (phase - 0.5) * 4 - 1
    ctx.arc(half, half, half, Math.PI / 2, -Math.PI / 2, false)
    ctx.bezierCurveTo(
      half - half * sweep, half - half * 0.55,
      half - half * sweep, half + half * 0.55,
      half, half + half,
    )
  }
  ctx.fillStyle = shadow
  ctx.fill()

  container.textContent = ''
  container.appendChild(canvas)
}

export function createMoonToggle(container: HTMLElement): void {
  const wrapper = document.createElement('div')
  wrapper.className = 'moon-toggle'

  renderMoonCanvas(wrapper)

  wrapper.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme')
    const next: Theme = current === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    renderMoonCanvas(wrapper)
  })

  container.appendChild(wrapper)
}
