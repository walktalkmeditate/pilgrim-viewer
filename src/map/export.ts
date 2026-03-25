import mapboxgl from 'mapbox-gl'
import type { Walk, GeoJSONFeature } from '../parsers/types'
import type { ColorMode } from './overlay'
import type { UnitSystem } from '../parsers/units'
import { formatDistance } from '../parsers/units'
import { getDominantTimeBucket } from './overlay'
import { generateCombinedSealSVG, buildCombinedWalk, computeWalkHash, extractRoutePoints } from '../panels/seal'
import { generateBorderSvg, BORDER_WIDTH, BORDER_THEMES } from './border'
import type { BorderTheme } from './border'
import { resolveWaypointIcon, getWaypointIconSvg } from './waypoint-icons'

export function generateFilename(
  selectedYear: number | null,
  walks: Walk[] = [],
): string {
  const year = selectedYear ?? new Date().getFullYear()
  const count = walks.length
  const suffix = Math.random().toString(36).slice(2, 6)
  return `pilgrim-keepsake-${year}-${count}w-${suffix}.png`
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

const EXPORT_LINE_WIDTH = 3
const EXPORT_LINE_OPACITY = 0.85

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

export function exportKeepsake(
  map: mapboxgl.Map,
  statsText: string,
  filename: string,
  walks: Walk[] = [],
  unit: UnitSystem = 'metric',
  theme: BorderTheme = 'gold',
): void {
  const saved = boostRoutes(map)
  map.triggerRepaint()

  requestAnimationFrame(async () => {
    const mapCanvas = map.getCanvas()
    const width = mapCanvas.width
    const height = mapCanvas.height
    const dpr = window.devicePixelRatio || 1
    const bw = BORDER_WIDTH * dpr

    const canvas = document.createElement('canvas')
    canvas.width = width + bw * 2
    canvas.height = height + bw * 2

    const ctx = canvas.getContext('2d')
    if (!ctx) { restoreRoutes(map, saved); return }

    const palette = BORDER_THEMES[theme]
    ctx.fillStyle = palette.background
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    if (walks.length > 0) {
      try {
        const combined = buildCombinedWalk(walks)
        const allRoutePoints = walks.flatMap(extractRoutePoints)
        const hashHex = await computeWalkHash(combined, allRoutePoints)

        const borderSvg = await generateBorderSvg(
          walks, canvas.width / dpr, canvas.height / dpr,
          unit, hashHex, statsText, theme,
        )
        const borderImg = await svgToImage(borderSvg)
        ctx.drawImage(borderImg, 0, 0, canvas.width, canvas.height)

        ctx.drawImage(mapCanvas, bw, bw)

        const sealSize = Math.round(150 * dpr)
        const sealSvg = await generateCombinedSealSVG(walks, sealSize, unit, hashHex)
        if (sealSvg) {
          const sealImg = await svgToImage(sealSvg)
          ctx.globalAlpha = 0.8
          ctx.drawImage(
            sealImg,
            bw - sealSize / 2,
            canvas.height - bw - sealSize / 2,
            sealSize, sealSize,
          )
          ctx.globalAlpha = 1.0
        }

        const allWaypoints = walks.flatMap(w =>
          w.route.features.filter(
            (f): f is GeoJSONFeature => f.geometry.type === 'Point' && f.properties.markerType === 'waypoint',
          ),
        )

        for (const wp of allWaypoints) {
          const coords = wp.geometry.coordinates as [number, number]
          const pixel = map.project(coords)
          const icon = resolveWaypointIcon(wp.properties.icon)
          const svgStr = getWaypointIconSvg(icon).replace(/currentColor/g, palette.primary)
          try {
            const iconImg = await svgToImage(svgStr)
            const iconSize = Math.round(20 * dpr)
            const x = bw + pixel.x * dpr - iconSize / 2
            const y = bw + pixel.y * dpr - iconSize / 2
            ctx.globalAlpha = 0.85
            ctx.drawImage(iconImg, x, y, iconSize, iconSize)
            ctx.globalAlpha = 1.0
          } catch {
            // skip failed icon
          }
        }
      } catch (err) {
        console.warn('Border/seal compositing failed:', err)
        ctx.drawImage(mapCanvas, bw, bw)
      }
    } else {
      ctx.drawImage(mapCanvas, bw, bw)
    }

    restoreRoutes(map, saved)
    triggerDownload(canvas.toDataURL('image/png'), filename)
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
