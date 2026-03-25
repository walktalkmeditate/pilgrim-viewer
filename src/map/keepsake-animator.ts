import type mapboxgl from 'mapbox-gl'
import type { Walk, GeoJSONFeature } from '../parsers/types'
import type { UnitSystem } from '../parsers/units'
import type { BorderTheme, BorderPalette } from './border'
import { BORDER_WIDTH, BORDER_THEMES } from './border'
import { hexToBytes, extractRoutePoints, getSeason, COLORS, computeWalkHash, buildCombinedWalk } from '../panels/seal'
import type { RoutePoint } from '../panels/seal'
import { generateCombinedSealSVG } from '../panels/seal'
import { svgToImage } from './export'
import { resolveWaypointIcon, getWaypointIconSvg } from './waypoint-icons'

const TOTAL_FRAMES = 120
const FPS = 30

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

function overshoot(t: number): number {
  if (t < 0.7) return (t / 0.7) * 1.15
  return 1.15 - 0.15 * ((t - 0.7) / 0.3)
}

interface AnimationConfig {
  width: number
  height: number
  dpr: number
  bw: number
  palette: BorderPalette
  bytes: Uint8Array
  mapSnapshot: HTMLImageElement | HTMLCanvasElement
  sealImage: HTMLImageElement | null
  sealSize: number
  walks: Walk[]
  statsText: string
  routeProjections: Array<Array<{ x: number; y: number }>>
  waypointPositions: Array<{ x: number; y: number; icon: string; progress: number; image: HTMLImageElement | null }>
  seasonData: Array<{ season: string; count: number }>
  seasonColors: Record<string, string>
  allRoutePoints: RoutePoint[]
  dateRangeText: string
  compassCx: number
  compassCy: number
  compassSize: number
  signatureCx: number
  signatureCy: number
  signatureSize: number
  signaturePoints: Array<{ x: number; y: number }>
  elevationPoints: Array<Array<{ x: number; y: number }>>
  elevXStart: number
  elevXEnd: number
  elevYBaseline: number
  elevMaxAmplitude: number
}

function drawOuterFrame(ctx: CanvasRenderingContext2D, config: AnimationConfig, progress: number): void {
  if (progress <= 0) return

  const { width, height, palette } = config
  const margin = 10
  const rx = 3
  const w = width - margin * 2
  const h = height - margin * 2
  const perimeter = 2 * (w + h - 4 * rx) + 2 * Math.PI * rx

  ctx.save()
  ctx.strokeStyle = palette.primary
  ctx.lineWidth = 1
  ctx.globalAlpha = 0.4

  ctx.beginPath()
  ctx.roundRect(margin, margin, w, h, rx)

  const drawLength = perimeter * progress
  ctx.setLineDash([drawLength, perimeter])
  ctx.lineDashOffset = 0
  ctx.stroke()

  ctx.restore()
}

function drawDepthLayers(ctx: CanvasRenderingContext2D, config: AnimationConfig, opacity: number): void {
  if (opacity <= 0) return

  const { width, height, bw, palette } = config
  const ix = bw
  const iy = bw
  const iw = width - bw * 2
  const ih = height - bw * 2

  ctx.save()
  ctx.strokeStyle = palette.primary
  ctx.lineWidth = 0.5

  for (let d = 3; d >= 1; d--) {
    const off = d * 2
    const layerOpacity = 0.04 * (4 - d)
    ctx.globalAlpha = layerOpacity * opacity
    ctx.beginPath()
    ctx.roundRect(ix - off, iy - off, iw + off * 2, ih + off * 2, 2 + d)
    ctx.stroke()
  }

  ctx.restore()
}

function drawInnerFrame(ctx: CanvasRenderingContext2D, config: AnimationConfig, progress: number): void {
  if (progress <= 0) return

  const { width, height, bw, palette, elevationPoints, elevXStart, elevXEnd, elevYBaseline, elevMaxAmplitude } = config
  const ix = bw
  const iy = bw
  const iw = width - bw * 2
  const ih = height - bw * 2

  const hasElevation = elevationPoints.length > 0 && elevationPoints.some(pts => pts.length >= 4)
  const allElevPts = hasElevation ? elevationPoints.flat() : []

  ctx.save()

  ctx.strokeStyle = palette.primary
  ctx.lineWidth = 1.5
  ctx.globalAlpha = 0.7 * progress
  ctx.lineJoin = 'round'

  ctx.beginPath()
  if (hasElevation && allElevPts.length >= 4) {
    ctx.moveTo(ix, iy + 2)
    ctx.lineTo(ix + iw, iy + 2)
    ctx.lineTo(ix + iw, iy + ih)

    const bottomPtsCount = Math.floor(allElevPts.length * progress)
    for (let i = allElevPts.length - 1; i >= allElevPts.length - bottomPtsCount && i >= 0; i--) {
      ctx.lineTo(allElevPts[i].x, allElevPts[i].y)
    }
    if (bottomPtsCount < allElevPts.length) {
      ctx.lineTo(ix, iy + ih)
    }

    ctx.lineTo(ix, iy + ih)
    ctx.closePath()
  } else {
    ctx.roundRect(ix, iy, iw, ih, 2)
  }
  ctx.stroke()

  ctx.strokeStyle = palette.glow
  ctx.lineWidth = 0.5
  ctx.globalAlpha = 0.08 * progress

  ctx.beginPath()
  if (hasElevation && allElevPts.length >= 4) {
    ctx.moveTo(ix, iy + 2)
    ctx.lineTo(ix + iw, iy + 2)
    ctx.lineTo(ix + iw, iy + ih)
    for (let i = allElevPts.length - 1; i >= 0; i--) {
      ctx.lineTo(allElevPts[i].x, allElevPts[i].y)
    }
    ctx.lineTo(ix, iy + ih)
    ctx.closePath()
  } else {
    ctx.roundRect(ix, iy, iw, ih, 2)
  }
  ctx.stroke()

  ctx.restore()
}

function drawRouteGhost(ctx: CanvasRenderingContext2D, config: AnimationConfig, opacity: number): void {
  if (opacity <= 0) return

  const { width, height, palette, walks } = config
  const allPoints: Array<{ lon: number; lat: number }> = []
  for (const walk of walks) {
    for (const p of extractRoutePoints(walk)) {
      allPoints.push({ lon: p.lon, lat: p.lat })
    }
  }
  if (allPoints.length < 4) return

  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity
  for (const p of allPoints) {
    if (p.lon < minLon) minLon = p.lon
    if (p.lon > maxLon) maxLon = p.lon
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
  }
  const lonRange = Math.max(maxLon - minLon, 0.001)
  const latRange = Math.max(maxLat - minLat, 0.001)

  const margin = 6
  const bx = margin
  const by = margin
  const bw = width - margin * 2
  const bh = height - margin * 2

  ctx.save()
  ctx.strokeStyle = palette.primary
  ctx.lineWidth = 0.5
  ctx.globalAlpha = 0.04 * opacity
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (const walk of walks) {
    const rp = extractRoutePoints(walk)
    if (rp.length < 2) continue

    const step = Math.max(1, Math.floor(rp.length / 80))
    const sampled = rp.filter((_, i) => i % step === 0 || i === rp.length - 1)

    ctx.beginPath()
    for (let i = 0; i < sampled.length; i++) {
      const nx = (sampled[i].lon - minLon) / lonRange
      const ny = 1 - (sampled[i].lat - minLat) / latRange
      const x = bx + nx * bw
      const y = by + ny * bh
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  ctx.restore()
}

function drawSeasonBars(ctx: CanvasRenderingContext2D, config: AnimationConfig, progress: number): void {
  if (progress <= 0) return

  const { bw, height, seasonData, seasonColors } = config
  if (seasonData.length === 0) return

  const seasonBarX = bw / 2
  const yStart = bw + 15
  const yEnd = height - bw - 15
  const totalHeight = yEnd - yStart
  const total = seasonData.reduce((s, d) => s + d.count, 0)

  ctx.save()
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.globalAlpha = 0.6

  let currentY = yStart
  for (const { season, count } of seasonData) {
    const segmentHeight = (count / total) * totalHeight
    const color = seasonColors[season] ?? COLORS.dawn
    const drawHeight = segmentHeight * progress

    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.moveTo(seasonBarX, currentY)
    ctx.lineTo(seasonBarX, currentY + drawHeight)
    ctx.stroke()

    currentY += segmentHeight + 8
  }

  ctx.restore()
}

function drawCornerOrnaments(ctx: CanvasRenderingContext2D, config: AnimationConfig, progress: number): void {
  if (progress <= 0) return

  const { width, height, bw, palette, bytes } = config
  const count = 2 + (bytes[24] % 3)
  const corners = [
    { cx: bw, cy: bw, reduced: false },
    { cx: width - bw, cy: bw, reduced: false },
    { cx: width - bw, cy: height - bw, reduced: false },
    { cx: bw, cy: height - bw, reduced: true },
  ]

  ctx.save()
  ctx.strokeStyle = palette.primary
  ctx.lineWidth = 1
  ctx.lineCap = 'round'

  for (let c = 0; c < corners.length; c++) {
    const { cx, cy, reduced } = corners[c]
    const arcCount = reduced ? Math.max(count - 1, 1) : count

    for (let i = 0; i < arcCount; i++) {
      const byteIdx = (32 + c * 4 + i) % 32
      const sweep = 20 + (bytes[byteIdx] / 255) * 60
      const radius = 8 + (bytes[(byteIdx + 1) % 32] / 255) * (bw * 0.6)
      const startAngle = (bytes[(byteIdx + 2) % 32] / 255) * 360
      const opacity = 0.3 + (bytes[(byteIdx + 3) % 32] / 255) * 0.25

      const startRad = (startAngle * Math.PI) / 180
      const endRad = ((startAngle + sweep) * Math.PI) / 180

      const x1 = cx + Math.cos(startRad) * radius
      const y1 = cy + Math.sin(startRad) * radius
      const cpx = cx + Math.cos((startRad + endRad) / 2) * radius * 1.3
      const cpy = cy + Math.sin((startRad + endRad) / 2) * radius * 1.3
      const x2 = cx + Math.cos(endRad) * radius
      const y2 = cy + Math.sin(endRad) * radius

      ctx.globalAlpha = opacity * progress
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.quadraticCurveTo(cpx, cpy, x2, y2)
      ctx.stroke()
    }
  }

  ctx.restore()
}

function drawEdgeDots(ctx: CanvasRenderingContext2D, config: AnimationConfig, progress: number): void {
  if (progress <= 0) return

  const { width, height, bw, palette, bytes, walks } = config
  const outerMargin = 10
  const count = Math.min(5 + Math.floor(walks.length / 10), 30)
  const topCount = Math.ceil(count * 0.6)
  const rightCount = count - topCount

  ctx.save()
  ctx.fillStyle = palette.primary

  for (let i = 0; i < topCount; i++) {
    const byteIdx = (i * 3) % 32
    const t = i / Math.max(topCount - 1, 1)
    const xJitter = ((bytes[(byteIdx + 1) % 32] / 255) - 0.5) * 15
    const x = outerMargin + t * (width - outerMargin * 2) + xJitter
    const y = outerMargin + (bytes[byteIdx] / 255) * (bw - outerMargin)
    const r = 1 + (bytes[(byteIdx + 2) % 32] / 255) * 1.5
    const opacity = 0.3 + (bytes[byteIdx] / 255) * 0.25

    ctx.globalAlpha = opacity * progress
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < rightCount; i++) {
    const byteIdx = (topCount * 3 + i * 3) % 32
    const t = i / Math.max(rightCount - 1, 1)
    const yJitter = ((bytes[(byteIdx + 1) % 32] / 255) - 0.5) * 15
    const y = outerMargin + t * (height - outerMargin * 2) + yJitter
    const x = width - bw + (bytes[byteIdx] / 255) * (bw - outerMargin)
    const r = 1 + (bytes[(byteIdx + 2) % 32] / 255) * 1.5
    const opacity = 0.3 + (bytes[byteIdx] / 255) * 0.25

    ctx.globalAlpha = opacity * progress
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

function drawSealRadials(ctx: CanvasRenderingContext2D, config: AnimationConfig, progress: number): void {
  if (progress <= 0) return

  const { bw, height, palette, bytes, sealSize } = config
  const sealX = bw
  const sealY = height - bw
  const count = 4 + (bytes[8] % 5)

  ctx.save()
  ctx.strokeStyle = palette.primary
  ctx.lineWidth = 0.8
  ctx.lineCap = 'round'

  for (let i = 0; i < count; i++) {
    const byteIdx = (8 + i) % 32
    const angleOffset = (bytes[byteIdx] / 255) * 180
    const angle = 180 + angleOffset
    const rad = (angle * Math.PI) / 180
    const length = 30 + (bytes[(byteIdx + 1) % 32] / 255) * 30
    const opacity = 0.2 + (bytes[(byteIdx + 2) % 32] / 255) * 0.2

    const drawLength = length * progress
    const x2 = sealX + Math.cos(rad) * drawLength
    const y2 = sealY + Math.sin(rad) * drawLength

    ctx.globalAlpha = opacity
    ctx.beginPath()
    ctx.moveTo(sealX, sealY)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  ctx.restore()
}

function drawTallyMarks(ctx: CanvasRenderingContext2D, config: AnimationConfig, progress: number): void {
  if (progress <= 0) return

  const { width, height, bw, walks, seasonColors } = config
  const count = walks.length
  if (count === 0) return

  const x = width - bw / 2
  const yStart = bw + 15
  const yEnd = height - bw - 15
  const available = yEnd - yStart
  const spacing = Math.min(available / count, 8)
  const visibleCount = Math.floor(count * progress)

  ctx.save()
  ctx.lineWidth = 1.2
  ctx.lineCap = 'round'
  ctx.globalAlpha = 0.5

  for (let i = 0; i < visibleCount; i++) {
    const y = yStart + i * spacing
    if (y > yEnd) break
    const routePoints = extractRoutePoints(walks[i])
    const lat = routePoints[0]?.lat ?? 0
    const season = getSeason(walks[i].startDate, lat)
    const color = seasonColors[season] ?? COLORS.dawn

    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.moveTo(x - 4, y)
    ctx.lineTo(x + 4, y)
    ctx.stroke()
  }

  ctx.restore()
}

function drawStatsText(ctx: CanvasRenderingContext2D, config: AnimationConfig, opacity: number): void {
  if (opacity <= 0) return

  const { width, height, bw, palette, statsText } = config
  if (!statsText) return

  const parts = statsText.split(' \u00B7 ')
  const x = width - bw - 8
  const baseY = height - bw / 2

  ctx.save()
  ctx.textAlign = 'end'
  ctx.fillStyle = palette.primary

  if (parts.length >= 2) {
    const distancePart = parts.find(p => /\d.*(?:km|mi)/.test(p)) ?? parts[1]
    const rest = parts.filter(p => p !== distancePart).join(' \u00B7 ')

    ctx.globalAlpha = 0.75 * opacity
    ctx.font = '300 18px "Cormorant Garamond", Georgia, serif'
    ctx.fillText(distancePart, x, baseY - 2)

    ctx.globalAlpha = 0.5 * opacity
    ctx.font = '10px "Lato", -apple-system, sans-serif'
    ctx.letterSpacing = '1px'
    ctx.fillText(rest, x, baseY + 12)
  } else {
    ctx.globalAlpha = 0.65 * opacity
    ctx.font = '11px "Lato", -apple-system, sans-serif'
    ctx.letterSpacing = '1px'
    ctx.fillText(statsText, x, baseY)
  }

  ctx.restore()
}

function drawDateRange(ctx: CanvasRenderingContext2D, config: AnimationConfig, opacity: number): void {
  if (opacity <= 0) return

  const { width, bw, palette, dateRangeText } = config
  if (!dateRangeText) return

  const y = bw / 2 + 4

  ctx.save()
  ctx.textAlign = 'center'
  ctx.fillStyle = palette.primary
  ctx.globalAlpha = 0.45 * opacity
  ctx.font = '10px "Lato", -apple-system, sans-serif'
  ctx.letterSpacing = '3px'
  ctx.fillText(dateRangeText.toUpperCase(), width / 2, y)
  ctx.restore()
}

function drawCompassRose(ctx: CanvasRenderingContext2D, config: AnimationConfig, progress: number): void {
  if (progress <= 0) return

  const { palette, bytes, compassCx, compassCy, compassSize } = config
  const r = compassSize / 2

  ctx.save()

  const rotation = (-90 * (1 - progress) * Math.PI) / 180
  ctx.translate(compassCx, compassCy)
  ctx.rotate(rotation)
  ctx.translate(-compassCx, -compassCy)
  ctx.globalAlpha = progress

  const cardinals = [
    { angle: -90, label: 'N', bold: true },
    { angle: 0, label: 'E', bold: false },
    { angle: 90, label: 'S', bold: false },
    { angle: 180, label: 'W', bold: false },
  ]

  for (const { angle, label, bold } of cardinals) {
    const rad = (angle * Math.PI) / 180
    const x1 = compassCx + Math.cos(rad) * (r * 0.3)
    const y1 = compassCy + Math.sin(rad) * (r * 0.3)
    const x2 = compassCx + Math.cos(rad) * r
    const y2 = compassCy + Math.sin(rad) * r
    const lx = compassCx + Math.cos(rad) * (r * 1.3)
    const ly = compassCy + Math.sin(rad) * (r * 1.3)

    ctx.strokeStyle = palette.primary
    ctx.lineWidth = bold ? 1.2 : 0.6
    ctx.globalAlpha = (bold ? 0.6 : 0.35) * progress
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()

    ctx.fillStyle = palette.primary
    ctx.globalAlpha = (bold ? 0.55 : 0.3) * progress
    ctx.font = `${bold ? '7' : '5'}px "Lato", -apple-system, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(label, lx, ly + 3)
  }

  const interCount = 2 + (bytes[0] % 3)
  for (let i = 0; i < interCount; i++) {
    const byteIdx = (i * 3 + 5) % 32
    const angle = (bytes[byteIdx] / 255) * 360
    const rad = (angle * Math.PI) / 180
    const len = r * (0.4 + (bytes[(byteIdx + 1) % 32] / 255) * 0.4)
    const x2 = compassCx + Math.cos(rad) * len
    const y2 = compassCy + Math.sin(rad) * len

    ctx.strokeStyle = palette.primary
    ctx.lineWidth = 0.4
    ctx.globalAlpha = 0.25 * progress
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(compassCx, compassCy)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  ctx.fillStyle = palette.primary
  ctx.globalAlpha = 0.4 * progress
  ctx.beginPath()
  ctx.arc(compassCx, compassCy, r * 0.15, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = palette.primary
  ctx.lineWidth = 0.5
  ctx.globalAlpha = 0.3 * progress
  ctx.beginPath()
  ctx.arc(compassCx, compassCy, r, 0, Math.PI * 2)
  ctx.stroke()

  ctx.restore()
}

function drawWalkSignature(ctx: CanvasRenderingContext2D, config: AnimationConfig, progress: number): void {
  if (progress <= 0) return

  const { palette, signaturePoints } = config
  if (signaturePoints.length < 4) return

  const drawCount = Math.floor(signaturePoints.length * progress)
  if (drawCount < 2) return

  ctx.save()
  ctx.strokeStyle = palette.primary
  ctx.lineWidth = 1.5
  ctx.globalAlpha = 0.5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.beginPath()
  for (let i = 0; i < drawCount; i++) {
    if (i === 0) ctx.moveTo(signaturePoints[i].x, signaturePoints[i].y)
    else ctx.lineTo(signaturePoints[i].x, signaturePoints[i].y)
  }
  ctx.stroke()

  const start = signaturePoints[0]
  ctx.fillStyle = palette.primary
  ctx.globalAlpha = 0.6
  ctx.beginPath()
  ctx.arc(start.x, start.y, 2, 0, Math.PI * 2)
  ctx.fill()

  if (drawCount >= signaturePoints.length) {
    const end = signaturePoints[signaturePoints.length - 1]
    ctx.strokeStyle = palette.primary
    ctx.lineWidth = 0.8
    ctx.globalAlpha = 0.5
    ctx.beginPath()
    ctx.arc(end.x, end.y, 1.2, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.restore()
}

function drawElevationTraces(ctx: CanvasRenderingContext2D, config: AnimationConfig, progress: number): void {
  if (progress <= 0) return

  const { palette, elevationPoints, walks } = config

  ctx.save()
  ctx.strokeStyle = palette.primary
  ctx.lineWidth = 1.8
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (let w = 0; w < elevationPoints.length; w++) {
    const pts = elevationPoints[w]
    if (pts.length < 2) continue

    const drawCount = Math.floor(pts.length * progress)
    if (drawCount < 2) continue

    const opacity = walks.length === 1 ? 0.5 : Math.max(0.15, 0.5 - w * (0.35 / walks.length))
    ctx.globalAlpha = opacity

    ctx.beginPath()
    for (let i = 0; i < drawCount; i++) {
      if (i === 0) ctx.moveTo(pts[i].x, pts[i].y)
      else ctx.lineTo(pts[i].x, pts[i].y)
    }
    ctx.stroke()
  }

  ctx.restore()
}

function drawRouteCalligraphy(ctx: CanvasRenderingContext2D, config: AnimationConfig, progress: number): void {
  if (progress <= 0) return

  const { bw, dpr, palette, routeProjections } = config

  ctx.save()
  ctx.strokeStyle = palette.primary
  ctx.globalAlpha = 0.7
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const totalSegments = routeProjections.reduce((s, pts) => s + Math.max(0, pts.length - 1), 0)
  let segmentsSoFar = 0

  for (const pts of routeProjections) {
    if (pts.length < 2) continue

    for (let i = 1; i < pts.length; i++) {
      const segmentProgress = segmentsSoFar / totalSegments
      if (segmentProgress > progress) break

      const prev = pts[i - 1]
      const cur = pts[i]
      const dx = cur.x - prev.x
      const dy = cur.y - prev.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const width = Math.max(1, Math.min(3, 3 - dist * 0.02))

      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(bw + prev.x * dpr, bw + prev.y * dpr)
      ctx.lineTo(bw + cur.x * dpr, bw + cur.y * dpr)
      ctx.stroke()

      segmentsSoFar++
    }
  }

  ctx.restore()
}

function drawWaypointIcons(ctx: CanvasRenderingContext2D, config: AnimationConfig, routeProgress: number): void {
  const { bw, dpr, waypointPositions } = config

  ctx.save()

  for (const wp of waypointPositions) {
    if (routeProgress < wp.progress) continue
    if (!wp.image) continue

    const fadeIn = Math.min((routeProgress - wp.progress) * 10, 1)
    const iconSize = Math.round(20 * dpr)
    const x = bw + wp.x * dpr - iconSize / 2
    const y = bw + wp.y * dpr - iconSize / 2

    ctx.globalAlpha = 0.85 * fadeIn
    ctx.drawImage(wp.image, x, y, iconSize, iconSize)
  }

  ctx.restore()
}

function drawAnimationFrame(ctx: CanvasRenderingContext2D, frame: number, config: AnimationConfig): void {
  const { width, height, palette, bw } = config

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = palette.background
  ctx.fillRect(0, 0, width, height)

  function progress(start: number, end: number): number {
    if (frame < start) return 0
    if (frame >= end) return 1
    return (frame - start) / (end - start)
  }

  drawRouteGhost(ctx, config, easeOut(progress(5, 15)))

  drawOuterFrame(ctx, config, easeOut(progress(0, 15)))
  drawDepthLayers(ctx, config, easeOut(progress(15, 25)))
  drawInnerFrame(ctx, config, easeOut(progress(15, 30)))

  const mapOpacity = easeOut(progress(20, 35))
  if (mapOpacity > 0) {
    ctx.globalAlpha = mapOpacity
    ctx.drawImage(config.mapSnapshot, bw, bw)
    ctx.globalAlpha = 1
  }

  const routeProgress = easeOut(progress(30, 50))
  if (routeProgress > 0) {
    drawRouteCalligraphy(ctx, config, routeProgress)
    drawWaypointIcons(ctx, config, routeProgress)
  }

  drawSeasonBars(ctx, config, easeOut(progress(40, 55)))
  drawCornerOrnaments(ctx, config, easeOut(progress(45, 60)))
  drawEdgeDots(ctx, config, easeOut(progress(45, 60)))

  const sealProgress = progress(55, 70)
  if (sealProgress > 0 && config.sealImage) {
    const scale = overshoot(sealProgress)
    const cx = bw
    const cy = height - bw
    ctx.save()
    ctx.globalAlpha = Math.min(sealProgress * 1.5, 0.8)
    ctx.translate(cx, cy)
    ctx.scale(scale, scale)
    ctx.drawImage(
      config.sealImage,
      -config.sealSize / 2,
      -config.sealSize / 2,
      config.sealSize,
      config.sealSize,
    )
    ctx.restore()
  }

  drawSealRadials(ctx, config, easeOut(progress(60, 75)))
  drawTallyMarks(ctx, config, easeOut(progress(60, 75)))

  drawStatsText(ctx, config, easeOut(progress(70, 85)))
  drawDateRange(ctx, config, easeOut(progress(70, 85)))
  drawElevationTraces(ctx, config, easeOut(progress(85, 90)))

  drawCompassRose(ctx, config, easeOut(progress(75, 90)))
  drawWalkSignature(ctx, config, easeOut(progress(75, 90)))
}

function computeDateRangeText(walks: Walk[]): string {
  if (walks.length === 0) return ''

  const sorted = [...walks].sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
  const first = sorted[0].startDate
  const last = sorted[sorted.length - 1].startDate

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const firstYear = first.getUTCFullYear()
  const lastYear = last.getUTCFullYear()

  if (firstYear === lastYear && first.getUTCMonth() === last.getUTCMonth()) {
    return `${months[first.getUTCMonth()]} ${firstYear}`
  }
  if (firstYear === lastYear) {
    return `${months[first.getUTCMonth()]} \u2013 ${months[last.getUTCMonth()]} ${firstYear}`
  }
  return `${months[first.getUTCMonth()]} ${firstYear} \u2013 ${months[last.getUTCMonth()]} ${lastYear}`
}

function computeSeasonData(walks: Walk[]): Array<{ season: string; count: number }> {
  const counts: Record<string, number> = {}
  for (const walk of walks) {
    const routePoints = extractRoutePoints(walk)
    const lat = routePoints[0]?.lat ?? 0
    const season = getSeason(walk.startDate, lat)
    counts[season] = (counts[season] ?? 0) + 1
  }
  return Object.entries(counts).map(([season, count]) => ({ season, count }))
}

function computeSignaturePoints(walks: Walk[], cx: number, cy: number, size: number): Array<{ x: number; y: number }> {
  const longest = walks.reduce<Walk | undefined>(
    (best, w) => (!best || w.stats.distance > best.stats.distance) ? w : best,
    undefined,
  )
  if (!longest) return []

  const rp = extractRoutePoints(longest)
  if (rp.length < 4) return []

  const step = Math.max(1, Math.floor(rp.length / 20))
  const sampled = rp.filter((_, i) => i % step === 0 || i === rp.length - 1)

  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity
  for (const p of sampled) {
    if (p.lon < minLon) minLon = p.lon
    if (p.lon > maxLon) maxLon = p.lon
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
  }
  const lonRange = Math.max(maxLon - minLon, 0.0001)
  const latRange = Math.max(maxLat - minLat, 0.0001)

  const aspect = lonRange / latRange
  const half = size / 2
  let sx: number, sy: number, sw: number, sh: number
  if (aspect > 1) {
    sw = half * 2
    sh = sw / aspect
    sx = cx - half
    sy = cy - sh / 2
  } else {
    sh = half * 2
    sw = sh * aspect
    sx = cx - sw / 2
    sy = cy - half
  }

  return sampled.map(p => {
    const nx = (p.lon - minLon) / lonRange
    const ny = 1 - (p.lat - minLat) / latRange
    return { x: sx + nx * sw, y: sy + ny * sh }
  })
}

function computeElevationPolylines(
  walks: Walk[],
  xStart: number,
  xEnd: number,
  yBaseline: number,
  maxAmplitude: number,
): Array<Array<{ x: number; y: number }>> {
  return walks.map(walk => {
    const routePoints = extractRoutePoints(walk)
    if (routePoints.length < 2) return []

    const alts = routePoints.map(p => p.alt)
    let minAlt = Infinity, maxAlt = -Infinity
    for (const a of alts) {
      if (a < minAlt) minAlt = a
      if (a > maxAlt) maxAlt = a
    }
    const altRange = Math.max(maxAlt - minAlt, 1)

    const totalWidth = xEnd - xStart
    const step = totalWidth / (routePoints.length - 1)

    return routePoints.map((_, i) => {
      const x = xStart + i * step
      const normalized = (alts[i] - minAlt) / altRange
      const y = yBaseline - normalized * maxAmplitude
      return { x, y }
    })
  })
}

function chooseMimeType(): string {
  const candidates = [
    'video/webm; codecs=vp9',
    'video/webm; codecs=vp8',
    'video/webm',
  ]
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime
  }
  return 'video/webm'
}

export function generateKeepsakeVideo(
  map: mapboxgl.Map,
  statsText: string,
  walks: Walk[],
  unit: UnitSystem,
  theme: BorderTheme,
  signal?: AbortSignal,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    const mapCanvas = map.getCanvas()
    const mapWidth = mapCanvas.width
    const mapHeight = mapCanvas.height
    const dpr = window.devicePixelRatio || 1
    const bw = BORDER_WIDTH * dpr
    const canvasWidth = mapWidth + bw * 2
    const canvasHeight = mapHeight + bw * 2
    const palette = BORDER_THEMES[theme]

    const snapshotCanvas = document.createElement('canvas')
    snapshotCanvas.width = mapWidth
    snapshotCanvas.height = mapHeight
    const snapshotCtx = snapshotCanvas.getContext('2d')
    if (!snapshotCtx) {
      reject(new Error('Failed to create snapshot canvas context'))
      return
    }
    snapshotCtx.drawImage(mapCanvas, 0, 0)

    const allRoutePoints = walks.flatMap(extractRoutePoints)
    const combined = buildCombinedWalk(walks)

    computeWalkHash(combined, allRoutePoints)
      .then(async (hashHex) => {
        const bytes = hexToBytes(hashHex)

        const sealSize = Math.round(150 * dpr)
        let sealImage: HTMLImageElement | null = null
        try {
          const sealSvg = await generateCombinedSealSVG(walks, sealSize, unit, hashHex)
          if (sealSvg) {
            sealImage = await svgToImage(sealSvg)
          }
        } catch {
          // seal rendering is non-critical
        }

        const routeProjections: Array<Array<{ x: number; y: number }>> = walks.map(walk => {
          const coords: Array<{ x: number; y: number }> = []
          for (const feature of walk.route.features) {
            if (feature.geometry.type === 'LineString') {
              const lineCoords = feature.geometry.coordinates as number[][]
              for (const coord of lineCoords) {
                const pixel = map.project([coord[0], coord[1]] as [number, number])
                coords.push({ x: pixel.x, y: pixel.y })
              }
            }
          }
          return coords
        })

        const totalRouteSegments = routeProjections.reduce((s, pts) => s + Math.max(0, pts.length - 1), 0)

        const allWaypoints = walks.flatMap(w =>
          w.route.features.filter(
            (f): f is GeoJSONFeature => f.geometry.type === 'Point' && f.properties.markerType === 'waypoint',
          ),
        )

        const waypointPositions: AnimationConfig['waypointPositions'] = []
        for (const wp of allWaypoints) {
          const coords = wp.geometry.coordinates as [number, number]
          const pixel = map.project(coords)
          const icon = resolveWaypointIcon(wp.properties.icon)

          let nearestProgress = 1
          let minDist = Infinity
          let segIdx = 0
          for (const pts of routeProjections) {
            for (let i = 0; i < pts.length; i++) {
              const dx = pts[i].x - pixel.x
              const dy = pts[i].y - pixel.y
              const dist = dx * dx + dy * dy
              if (dist < minDist) {
                minDist = dist
                nearestProgress = totalRouteSegments > 0 ? segIdx / totalRouteSegments : 0
              }
              segIdx++
            }
          }

          let image: HTMLImageElement | null = null
          try {
            const svgStr = getWaypointIconSvg(icon).replace(/currentColor/g, palette.primary)
            image = await svgToImage(svgStr)
          } catch {
            // non-critical
          }

          waypointPositions.push({
            x: pixel.x,
            y: pixel.y,
            icon,
            progress: nearestProgress,
            image,
          })
        }

        const bwCss = BORDER_WIDTH
        const cssWidth = canvasWidth / dpr
        const cssHeight = canvasHeight / dpr

        const ix = bwCss
        const iy = bwCss
        const iw = cssWidth - bwCss * 2
        const ih = cssHeight - bwCss * 2
        const sealX = bwCss
        const elevXStart = sealX + 80
        const elevXEnd = cssWidth - bwCss
        const elevYBaseline = iy + ih
        const elevMaxAmplitude = bwCss * 0.45

        const elevationPoints = computeElevationPolylines(
          walks, elevXStart, elevXEnd, elevYBaseline, elevMaxAmplitude,
        )

        const seasonData = computeSeasonData(walks)
        const seasonColors = palette.seasons

        const compassCx = cssWidth - bwCss / 2
        const compassCy = bwCss / 2
        const compassSize = bwCss * 0.45
        const signatureCx = bwCss / 2
        const signatureCy = bwCss / 2
        const signatureSize = bwCss * 0.7
        const signaturePoints = computeSignaturePoints(walks, signatureCx, signatureCy, signatureSize)

        const dateRangeText = computeDateRangeText(walks)

        const config: AnimationConfig = {
          width: canvasWidth,
          height: canvasHeight,
          dpr,
          bw,
          palette,
          bytes,
          mapSnapshot: snapshotCanvas,
          sealImage,
          sealSize,
          walks,
          statsText,
          routeProjections,
          waypointPositions,
          seasonData,
          seasonColors,
          allRoutePoints,
          dateRangeText,
          compassCx,
          compassCy,
          compassSize,
          signatureCx,
          signatureCy,
          signatureSize,
          signaturePoints,
          elevationPoints,
          elevXStart,
          elevXEnd,
          elevYBaseline,
          elevMaxAmplitude,
        }

        await document.fonts.ready

        const canvas = document.createElement('canvas')
        canvas.width = canvasWidth
        canvas.height = canvasHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Failed to create animation canvas context'))
          return
        }

        const mimeType = chooseMimeType()
        const stream = canvas.captureStream(0)
        const track = stream.getVideoTracks()[0]
        if (!track) {
          reject(new Error('Failed to capture video track from canvas'))
          return
        }

        const recorder = new MediaRecorder(stream, { mimeType })
        const chunks: Blob[] = []

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data)
        }

        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType })
          resolve(blob)
        }

        recorder.onerror = () => {
          reject(new Error('MediaRecorder encountered an error'))
        }

        recorder.start()

        let currentFrame = 0
        let lastFrameTime = 0
        const frameDuration = 1000 / FPS

        const onAbort = (): void => {
          recorder.stop()
          reject(new DOMException('Aborted', 'AbortError'))
        }
        signal?.addEventListener('abort', onAbort, { once: true })

        function tick(timestamp: number): void {
          if (signal?.aborted) return

          if (lastFrameTime === 0) lastFrameTime = timestamp

          const elapsed = timestamp - lastFrameTime
          if (elapsed < frameDuration) {
            requestAnimationFrame(tick)
            return
          }

          lastFrameTime = timestamp - (elapsed % frameDuration)

          drawAnimationFrame(ctx!, currentFrame, config)

          // requestFrame exists on CanvasCapture tracks but is not in all TS lib defs
          if ('requestFrame' in track) {
            (track as unknown as { requestFrame: () => void }).requestFrame()
          }

          currentFrame++

          if (currentFrame >= TOTAL_FRAMES) {
            signal?.removeEventListener('abort', onAbort)
            recorder.stop()
            return
          }

          requestAnimationFrame(tick)
        }

        requestAnimationFrame(tick)
      })
      .catch(reject)
  })
}
