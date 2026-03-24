import mapboxgl from 'mapbox-gl'
import type { Walk } from '../parsers/types'
import type { ColorMode } from './overlay'
import type { UnitSystem } from '../parsers/units'
import { formatDistance } from '../parsers/units'
import { getDominantTimeBucket } from './overlay'
import { generateCombinedSealSVG } from '../panels/seal'

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

const FOOTER_HEIGHT = 80
const FOOTER_BG = '#1C1914'
const FOOTER_TEXT_COLOR = '#F0EBE1'
const FOOTER_FONT_SIZE = 16
const FOOTER_FONT = 'Lato, Helvetica Neue, sans-serif'
const EXPORT_LINE_WIDTH = 3
const EXPORT_LINE_OPACITY = 0.85
const PADDING = 40

function boostRoutes(map: mapboxgl.Map): Array<{ id: string; width: number; opacity: number }> {
  const saved: Array<{ id: string; width: number; opacity: number }> = []
  const style = map.getStyle()
  if (!style?.layers) return saved

  for (const layer of style.layers) {
    if (layer.id.startsWith('overlay-layer-')) {
      const width = (map.getPaintProperty(layer.id, 'line-width') as number) ?? 1.5
      const opacity = (map.getPaintProperty(layer.id, 'line-opacity') as number) ?? 0.6
      saved.push({ id: layer.id, width, opacity })
      map.setPaintProperty(layer.id, 'line-width', EXPORT_LINE_WIDTH)
      map.setPaintProperty(layer.id, 'line-opacity', EXPORT_LINE_OPACITY)
    }
  }
  return saved
}

function restoreRoutes(map: mapboxgl.Map, saved: Array<{ id: string; width: number; opacity: number }>): void {
  for (const { id, width, opacity } of saved) {
    if (map.getLayer(id)) {
      map.setPaintProperty(id, 'line-width', width)
      map.setPaintProperty(id, 'line-opacity', opacity)
    }
  }
}

export function exportWithStats(
  map: mapboxgl.Map,
  statsText: string,
  filename: string,
  walks: Walk[] = [],
  unit: UnitSystem = 'metric',
): void {
  const saved = boostRoutes(map)
  map.triggerRepaint()

  requestAnimationFrame(() => {
    const mapCanvas = map.getCanvas()
    const width = mapCanvas.width
    const height = mapCanvas.height
    const dpr = window.devicePixelRatio || 1
    const footerH = FOOTER_HEIGHT * dpr
    const pad = PADDING * dpr

    const canvas = document.createElement('canvas')
    canvas.width = width + pad * 2
    canvas.height = height + pad * 2 + footerH

    const ctx = canvas.getContext('2d')
    if (!ctx) { restoreRoutes(map, saved); return }

    ctx.fillStyle = FOOTER_BG
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(mapCanvas, pad, pad)

    ctx.fillStyle = FOOTER_TEXT_COLOR
    ctx.font = `${FOOTER_FONT_SIZE * dpr}px ${FOOTER_FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(statsText, canvas.width / 2, height + pad * 2 + footerH / 2)

    restoreRoutes(map, saved)

    if (walks.length > 0) {
      compositeSeal(ctx, canvas.width, height + pad * 2, walks, unit, dpr).finally(() => {
        triggerDownload(canvas.toDataURL('image/png'), filename)
      })
    } else {
      triggerDownload(canvas.toDataURL('image/png'), filename)
    }
  })
}

export function exportClean(
  map: mapboxgl.Map,
  _container: HTMLElement,
  filename: string,
  walks: Walk[] = [],
  unit: UnitSystem = 'metric',
): void {
  const saved = boostRoutes(map)
  map.triggerRepaint()

  requestAnimationFrame(() => {
    const mapCanvas = map.getCanvas()
    const width = mapCanvas.width
    const height = mapCanvas.height
    const dpr = window.devicePixelRatio || 1
    const pad = PADDING * dpr

    const canvas = document.createElement('canvas')
    canvas.width = width + pad * 2
    canvas.height = height + pad * 2

    const ctx = canvas.getContext('2d')
    if (!ctx) { restoreRoutes(map, saved); return }

    ctx.fillStyle = '#1C1914'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(mapCanvas, pad, pad)

    restoreRoutes(map, saved)

    if (walks.length > 0) {
      compositeSeal(ctx, canvas.width, canvas.height, walks, unit, dpr).finally(() => {
        triggerDownload(canvas.toDataURL('image/png'), filename)
      })
    } else {
      triggerDownload(canvas.toDataURL('image/png'), filename)
    }
  })
}

function triggerDownload(dataUrl: string, filename: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

function svgToImage(svgString: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const encoded = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)))
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to render seal SVG'))
    img.src = encoded
  })
}

async function compositeSeal(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  walks: Walk[],
  unit: UnitSystem,
  dpr: number,
): Promise<void> {
  try {
    const sealSize = Math.round(150 * dpr)
    const svg = await generateCombinedSealSVG(walks, sealSize, unit)
    if (!svg) return
    const img = await svgToImage(svg)
    const margin = Math.round(24 * dpr)
    ctx.globalAlpha = 0.5
    ctx.drawImage(img, margin, canvasHeight - sealSize - margin, sealSize, sealSize)
    ctx.globalAlpha = 1.0
  } catch (err) {
    console.warn('Seal compositing failed:', err)
  }
}
