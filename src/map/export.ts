import type { Walk } from '../parsers/types'
import type { ColorMode } from './overlay'
import { formatDistance } from '../parsers/units'
import { getDominantTimeBucket } from './overlay'

export function generateFilename(
  variant: 'stats' | 'clean',
  selectedYear: number | null,
): string {
  const base = selectedYear ? `pilgrim-${selectedYear}` : 'pilgrim-overlay'
  return variant === 'clean' ? `${base}-clean.png` : `${base}.png`
}

export function generateStatsText(
  walks: Walk[],
  colorMode: ColorMode,
  selectedYear: number | null,
): string {
  const count = walks.length
  const distance = formatDistance(walks.reduce((s, w) => s + w.stats.distance, 0))

  let detail: string
  if (colorMode === 'timeOfDay') {
    detail = getDominantTimeBucket(walks)
  } else {
    const seasons = new Set(walks.map((w) => {
      const m = w.startDate.getMonth()
      if (m >= 2 && m <= 4) return 'spring'
      if (m >= 5 && m <= 7) return 'summer'
      if (m >= 8 && m <= 10) return 'autumn'
      return 'winter'
    }))
    detail = `${seasons.size} season${seasons.size !== 1 ? 's' : ''}`
  }

  const prefix = selectedYear ? `Your ${selectedYear} \u00B7 ` : ''
  return `${prefix}${count} walk${count !== 1 ? 's' : ''} \u00B7 ${distance} \u00B7 ${detail}`
}

const FOOTER_HEIGHT = 60
const FOOTER_BG = '#1C1914'
const FOOTER_TEXT_COLOR = '#F0EBE1'
const FOOTER_FONT_SIZE = 14
const FOOTER_FONT = 'Lato, Helvetica Neue, sans-serif'

export function exportWithStats(
  mapCanvas: HTMLCanvasElement,
  statsText: string,
  filename: string,
): void {
  const width = mapCanvas.width
  const height = mapCanvas.height
  const dpr = window.devicePixelRatio || 1
  const footerH = FOOTER_HEIGHT * dpr

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height + footerH

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.drawImage(mapCanvas, 0, 0)

  ctx.fillStyle = FOOTER_BG
  ctx.fillRect(0, height, width, footerH)

  ctx.fillStyle = FOOTER_TEXT_COLOR
  ctx.font = `${FOOTER_FONT_SIZE * dpr}px ${FOOTER_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(statsText, width / 2, height + footerH / 2)

  triggerDownload(canvas.toDataURL('image/png'), filename)
}

export function exportClean(
  mapCanvas: HTMLCanvasElement,
  container: HTMLElement,
  filename: string,
): void {
  const statsBar = container.querySelector<HTMLElement>('.overlay-stats')
  const controls = container.querySelector<HTMLElement>('.mapboxgl-control-container')

  if (statsBar) statsBar.style.display = 'none'
  if (controls) controls.style.display = 'none'

  const dataUrl = mapCanvas.toDataURL('image/png')

  if (statsBar) statsBar.style.display = ''
  if (controls) controls.style.display = ''

  triggerDownload(dataUrl, filename)
}

function triggerDownload(dataUrl: string, filename: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
