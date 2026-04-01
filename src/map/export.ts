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
  unit: UnitSystem = 'metric',
): string {
  const count = walks.length
  const distance = formatDistance(walks.reduce((s, w) => s + w.stats.distance, 0), unit)

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

const EXPORT_LINE_WIDTH = 4
const EXPORT_LINE_OPACITY = 1.0

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

export function generateKeepsakeImage(
  map: mapboxgl.Map,
  statsText: string,
  walks: Walk[],
  unit: UnitSystem,
  theme: BorderTheme,
  isGold = false,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const saved = boostRoutes(map)
    map.triggerRepaint()

    map.once('render', async () => {
      try {
        const mapCanvas = map.getCanvas()
        const width = mapCanvas.width
        const height = mapCanvas.height
        const dpr = window.devicePixelRatio || 1
        const bw = BORDER_WIDTH * dpr

        const canvas = document.createElement('canvas')
        canvas.width = width + bw * 2
        canvas.height = height + bw * 2

        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('No canvas context')); return }

        const palette = BORDER_THEMES[theme]
        ctx.fillStyle = palette.background
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        if (walks.length > 0) {
          const combined = buildCombinedWalk(walks)
          const allRoutePoints = walks.flatMap(extractRoutePoints)
          const hashHex = await computeWalkHash(combined, allRoutePoints)

          const borderSvg = generateBorderSvg(
            walks, canvas.width / dpr, canvas.height / dpr,
            unit, hashHex, statsText, theme,
          )
          const borderImg = await svgToImage(borderSvg)
          ctx.drawImage(borderImg, 0, 0, canvas.width, canvas.height)

          ctx.drawImage(mapCanvas, bw, bw)

          ctx.save()
          ctx.strokeStyle = palette.primary
          ctx.globalAlpha = 0.7
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          for (const walk of walks) {
            for (const feature of walk.route.features) {
              if (feature.geometry.type !== 'LineString') continue
              const coords = feature.geometry.coordinates as number[][]
              for (let i = 1; i < coords.length; i++) {
                const prev = map.project([coords[i - 1][0], coords[i - 1][1]] as [number, number])
                const cur = map.project([coords[i][0], coords[i][1]] as [number, number])
                const dx = cur.x - prev.x
                const dy = cur.y - prev.y
                const dist = Math.sqrt(dx * dx + dy * dy)
                ctx.lineWidth = Math.max(1, Math.min(3, 3 - dist * 0.02)) * dpr
                ctx.beginPath()
                ctx.moveTo(bw + prev.x * dpr, bw + prev.y * dpr)
                ctx.lineTo(bw + cur.x * dpr, bw + cur.y * dpr)
                ctx.stroke()
              }
            }
          }
          ctx.restore()

          const sealSize = Math.round(150 * dpr)
          const sealSvg = await generateCombinedSealSVG(walks, sealSize, unit, hashHex, isGold)
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

          // Waypoint pixel positions: map.project returns CSS pixels, canvas is in device pixels
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
        } else {
          ctx.drawImage(mapCanvas, bw, bw)
        }

        resolve(canvas.toDataURL('image/png'))
      } catch (err) {
        reject(err)
      } finally {
        restoreRoutes(map, saved)
      }
    })
  })
}

async function shareOrOpen(blob: Blob, filename: string): Promise<boolean> {
  if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
    const file = new File([blob], filename, { type: blob.type })
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] })
        return true
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return true
        return false
      }
    }
  }
  return false
}

export async function triggerDownload(dataUrl: string, filename: string): Promise<void> {
  if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
    const res = await fetch(dataUrl)
    const blob = await res.blob()
    if (await shareOrOpen(blob, filename)) return
  }

  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export async function triggerBlobDownload(blob: Blob, filename: string): Promise<void> {
  if (await shareOrOpen(blob, filename)) return

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function generateVideoFilename(
  selectedYear: number | null,
  walks: Walk[] = [],
  mimeType: string = 'video/webm',
): string {
  const year = selectedYear ?? new Date().getFullYear()
  const count = walks.length
  const suffix = Math.random().toString(36).slice(2, 6)
  const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'
  return `pilgrim-moment-${year}-${count}w-${suffix}.${ext}`
}

export function svgToImage(svgString: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const encoded = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)))
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to render SVG to image'))
    img.src = encoded
  })
}
