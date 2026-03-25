import type { Walk } from '../parsers/types'
import type { UnitSystem } from '../parsers/units'
import {
  hexToBytes, extractRoutePoints,
  getSeason, COLORS,
} from '../panels/seal'
import type { RoutePoint } from '../panels/seal'

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export const BORDER_WIDTH = 60

export type BorderTheme = 'gold' | 'silver' | 'sepia' | 'forest'

export interface BorderPalette {
  primary: string
  background: string
  glow: string
  seasons: Record<string, string>
}

export const BORDER_THEMES: Record<BorderTheme, BorderPalette> = {
  gold: {
    primary: '#C4956A',
    background: '#1C1914',
    glow: '#F0EBE1',
    seasons: { Spring: '#7A8B6F', Summer: '#C4956A', Autumn: '#A0634B', Winter: '#B8AFA2' },
  },
  silver: {
    primary: '#A8B4C0',
    background: '#141820',
    glow: '#D8E0E8',
    seasons: { Spring: '#7A9B8F', Summer: '#A8B4C0', Autumn: '#8A7B9B', Winter: '#C0C8D0' },
  },
  sepia: {
    primary: '#B89878',
    background: '#1E1810',
    glow: '#E8D8C0',
    seasons: { Spring: '#8B9B6F', Summer: '#B89878', Autumn: '#A07050', Winter: '#A8A090' },
  },
  forest: {
    primary: '#7A9B6F',
    background: '#141C14',
    glow: '#D0E0C8',
    seasons: { Spring: '#7A9B6F', Summer: '#A0B868', Autumn: '#B89050', Winter: '#809880' },
  },
}

const DEFAULT_THEME: BorderTheme = 'gold'

export function generateLinearElevation(
  routePoints: RoutePoint[],
  xStart: number,
  xEnd: number,
  yBaseline: number,
  maxAmplitude: number,
  color: string,
  opacity: number = 0.35,
): string {
  if (routePoints.length < 2) return ''

  const alts = routePoints.map(p => p.alt)
  let minAlt = Infinity
  let maxAlt = -Infinity
  for (const a of alts) {
    if (a < minAlt) minAlt = a
    if (a > maxAlt) maxAlt = a
  }
  const altRange = Math.max(maxAlt - minAlt, 1)

  const totalWidth = xEnd - xStart
  const step = totalWidth / (routePoints.length - 1)

  const points: string[] = []
  for (let i = 0; i < routePoints.length; i++) {
    const x = xStart + i * step
    const normalized = (alts[i] - minAlt) / altRange
    const y = yBaseline - normalized * maxAmplitude
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  }

  return `<polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="1.8" opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round"/>`
}

export function generateSeasonBars(
  walks: Walk[],
  x: number,
  yStart: number,
  yEnd: number,
  seasonColors: Record<string, string> = BORDER_THEMES[DEFAULT_THEME].seasons,
): string {
  if (walks.length === 0) return ''
  const totalHeight = yEnd - yStart
  const seasonCounts: Record<string, number> = {}

  for (const walk of walks) {
    const routePoints = extractRoutePoints(walk)
    const lat = routePoints[0]?.lat ?? 0
    const season = getSeason(walk.startDate, lat)
    seasonCounts[season] = (seasonCounts[season] ?? 0) + 1
  }

  const total = walks.length
  const bars: string[] = []
  let currentY = yStart

  for (const [season, count] of Object.entries(seasonCounts)) {
    const segmentHeight = (count / total) * totalHeight
    const color = seasonColors[season] ?? COLORS.dawn
    const y2 = currentY + segmentHeight

    bars.push(
      `<line x1="${x}" y1="${currentY.toFixed(1)}" x2="${x}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="3" opacity="0.6" stroke-linecap="round"/>`,
    )
    currentY = y2 + 8
  }

  return bars.join('\n')
}

export function generateCornerOrnaments(
  bytes: Uint8Array,
  width: number,
  height: number,
  borderWidth: number,
  color: string,
): string {
  const count = 2 + (bytes[24] % 3)
  const corners = [
    { cx: borderWidth, cy: borderWidth },
    { cx: width - borderWidth, cy: borderWidth },
    { cx: width - borderWidth, cy: height - borderWidth },
    { cx: borderWidth, cy: height - borderWidth, reduced: true },
  ]

  const paths: string[] = []

  for (let c = 0; c < corners.length; c++) {
    const { cx, cy, reduced } = corners[c] as { cx: number; cy: number; reduced?: boolean }
    const arcCount = reduced ? Math.max(count - 1, 1) : count

    for (let i = 0; i < arcCount; i++) {
      const byteIdx = (32 + c * 4 + i) % 32
      const sweep = 20 + (bytes[byteIdx] / 255) * 60
      const radius = 8 + (bytes[(byteIdx + 1) % 32] / 255) * (borderWidth * 0.6)
      const startAngle = (bytes[(byteIdx + 2) % 32] / 255) * 360
      const opacity = (0.3 + (bytes[(byteIdx + 3) % 32] / 255) * 0.25).toFixed(2)

      const startRad = (startAngle * Math.PI) / 180
      const endRad = ((startAngle + sweep) * Math.PI) / 180

      const x1 = cx + Math.cos(startRad) * radius
      const y1 = cy + Math.sin(startRad) * radius
      const cpx = cx + Math.cos((startRad + endRad) / 2) * radius * 1.3
      const cpy = cy + Math.sin((startRad + endRad) / 2) * radius * 1.3
      const x2 = cx + Math.cos(endRad) * radius
      const y2 = cy + Math.sin(endRad) * radius

      paths.push(
        `<path d="M${x1.toFixed(1)},${y1.toFixed(1)} Q${cpx.toFixed(1)},${cpy.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}" fill="none" stroke="${color}" stroke-width="1" opacity="${opacity}" stroke-linecap="round"/>`,
      )
    }
  }

  return paths.join('\n')
}

export function generateEdgeDots(
  bytes: Uint8Array,
  width: number,
  height: number,
  borderWidth: number,
  color: string,
  walkCount: number,
): string {
  const outerMargin = 10
  const count = Math.min(5 + Math.floor(walkCount / 10), 30)
  const topCount = Math.ceil(count * 0.6)
  const rightCount = count - topCount

  const circles: string[] = []

  for (let i = 0; i < topCount; i++) {
    const byteIdx = (i * 3) % 32
    const t = i / Math.max(topCount - 1, 1)
    const xJitter = ((bytes[(byteIdx + 1) % 32] / 255) - 0.5) * 15
    const x = outerMargin + t * (width - outerMargin * 2) + xJitter
    const y = outerMargin + (bytes[byteIdx] / 255) * (borderWidth - outerMargin)
    const r = (1 + (bytes[(byteIdx + 2) % 32] / 255) * 1.5).toFixed(1)
    const opacity = (0.3 + (bytes[byteIdx] / 255) * 0.25).toFixed(2)

    circles.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${color}" opacity="${opacity}"/>`,
    )
  }

  for (let i = 0; i < rightCount; i++) {
    const byteIdx = (topCount * 3 + i * 3) % 32
    const t = i / Math.max(rightCount - 1, 1)
    const yJitter = ((bytes[(byteIdx + 1) % 32] / 255) - 0.5) * 15
    const y = outerMargin + t * (height - outerMargin * 2) + yJitter
    const x = width - borderWidth + (bytes[byteIdx] / 255) * (borderWidth - outerMargin)
    const r = (1 + (bytes[(byteIdx + 2) % 32] / 255) * 1.5).toFixed(1)
    const opacity = (0.3 + (bytes[byteIdx] / 255) * 0.25).toFixed(2)

    circles.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${color}" opacity="${opacity}"/>`,
    )
  }

  return circles.join('\n')
}

export function generateSealRadials(
  bytes: Uint8Array,
  sealX: number,
  sealY: number,
  color: string,
): string {
  const count = 4 + (bytes[8] % 5)
  const lines: string[] = []

  for (let i = 0; i < count; i++) {
    const byteIdx = (8 + i) % 32
    const angleOffset = (bytes[byteIdx] / 255) * 180
    const angle = 180 + angleOffset
    const rad = (angle * Math.PI) / 180

    const length = 30 + (bytes[(byteIdx + 1) % 32] / 255) * 30
    const opacity = (0.2 + (bytes[(byteIdx + 2) % 32] / 255) * 0.2).toFixed(2)

    const x2 = sealX + Math.cos(rad) * length
    const y2 = sealY + Math.sin(rad) * length

    lines.push(
      `<line x1="${sealX.toFixed(1)}" y1="${sealY.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="0.8" opacity="${opacity}" stroke-linecap="round"/>`,
    )
  }

  return lines.join('\n')
}

export function generateBorderStatsText(
  statsText: string | undefined,
  width: number,
  borderWidth: number,
  height: number,
  color: string,
): string {
  if (!statsText) return ''

  const parts = statsText.split(' \u00B7 ')
  const x = width - borderWidth - 8
  const baseY = height - borderWidth / 2

  if (parts.length >= 2) {
    const distancePart = parts.find(p => /\d.*(?:km|mi)/.test(p)) ?? parts[1]
    const rest = parts.filter(p => p !== distancePart).join(' \u00B7 ')

    return [
      `<text x="${x}" y="${(baseY - 2).toFixed(1)}" text-anchor="end" font-family="'Cormorant Garamond', Georgia, serif" font-size="18" font-weight="300" fill="${color}" opacity="0.75">${escapeXml(distancePart)}</text>`,
      `<text x="${x}" y="${(baseY + 12).toFixed(1)}" text-anchor="end" font-family="'Lato', -apple-system, sans-serif" font-size="8" fill="${color}" opacity="0.5" letter-spacing="1">${escapeXml(rest)}</text>`,
    ].join('\n')
  }

  return `<text x="${x}" y="${baseY}" text-anchor="end" font-family="'Lato', -apple-system, sans-serif" font-size="11" fill="${color}" opacity="0.65" letter-spacing="1">${escapeXml(statsText)}</text>`
}

export function generateRouteGhost(
  walks: Walk[],
  width: number,
  height: number,
  borderWidth: number,
  color: string,
): string {
  const allPoints: Array<{ lon: number; lat: number }> = []
  for (const walk of walks) {
    for (const p of extractRoutePoints(walk)) {
      allPoints.push({ lon: p.lon, lat: p.lat })
    }
  }
  if (allPoints.length < 4) return ''

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

  const paths: string[] = []

  for (const walk of walks) {
    const rp = extractRoutePoints(walk)
    if (rp.length < 2) continue

    const step = Math.max(1, Math.floor(rp.length / 80))
    const sampled = rp.filter((_, i) => i % step === 0 || i === rp.length - 1)

    const pts = sampled.map(p => {
      const nx = (p.lon - minLon) / lonRange
      const ny = 1 - (p.lat - minLat) / latRange
      const x = bx + nx * bw
      const y = by + ny * bh
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })

    paths.push(
      `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="0.5" opacity="0.04" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
  }

  return paths.join('\n')
}

export function generateFrameLines(
  width: number,
  height: number,
  borderWidth: number,
  color: string,
  glowColor: string = '#F0EBE1',
  elevationPoints?: string,
): string {
  const outerMargin = 10
  const outerW = width - outerMargin * 2
  const outerH = height - outerMargin * 2
  const ix = borderWidth
  const iy = borderWidth
  const iw = width - borderWidth * 2
  const ih = height - borderWidth * 2

  const depthLayers: string[] = []
  for (let d = 3; d >= 1; d--) {
    const off = d * 2
    depthLayers.push(
      `<rect x="${ix - off}" y="${iy - off}" width="${iw + off * 2}" height="${ih + off * 2}" rx="${2 + d}" fill="none" stroke="${color}" stroke-width="0.5" opacity="${(0.04 * (4 - d)).toFixed(2)}"/>`,
    )
  }

  const innerFrame = elevationPoints
    ? `<path d="M${ix},${iy + 2} L${ix + iw},${iy + 2} L${ix + iw},${iy + ih} ${elevationPoints} L${ix},${iy + ih} Z" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.7" stroke-linejoin="round"/>`
    : `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="2" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.7"/>`

  const glowFrame = elevationPoints
    ? `<path d="M${ix},${iy + 2} L${ix + iw},${iy + 2} L${ix + iw},${iy + ih} ${elevationPoints} L${ix},${iy + ih} Z" fill="none" stroke="${glowColor}" stroke-width="0.5" opacity="0.08" stroke-linejoin="round"/>`
    : `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="2" fill="none" stroke="${glowColor}" stroke-width="0.5" opacity="0.08"/>`

  return [
    `<rect x="${outerMargin}" y="${outerMargin}" width="${outerW}" height="${outerH}" rx="3" fill="none" stroke="${color}" stroke-width="1" opacity="0.4"/>`,
    ...depthLayers,
    innerFrame,
    glowFrame,
  ].join('\n')
}

export function generateTallyMarks(
  walks: Walk[],
  width: number,
  height: number,
  borderWidth: number,
  seasonColors: Record<string, string> = BORDER_THEMES[DEFAULT_THEME].seasons,
): string {
  const count = walks.length
  if (count === 0) return ''

  const x = width - borderWidth / 2
  const yStart = borderWidth + 15
  const yEnd = height - borderWidth - 15
  const available = yEnd - yStart
  const spacing = Math.min(available / count, 8)
  const marks: string[] = []

  for (let i = 0; i < count; i++) {
    const y = yStart + i * spacing
    if (y > yEnd) break
    const routePoints = extractRoutePoints(walks[i])
    const lat = routePoints[0]?.lat ?? 0
    const season = getSeason(walks[i].startDate, lat)
    const color = seasonColors[season] ?? COLORS.dawn

    marks.push(
      `<line x1="${x - 4}" y1="${y.toFixed(1)}" x2="${x + 4}" y2="${y.toFixed(1)}" stroke="${color}" stroke-width="1.2" opacity="0.5" stroke-linecap="round"/>`,
    )
  }

  return marks.join('\n')
}

export function generateDateRange(
  walks: Walk[],
  width: number,
  borderWidth: number,
  color: string,
): string {
  if (walks.length === 0) return ''

  const sorted = [...walks].sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
  const first = sorted[0].startDate
  const last = sorted[sorted.length - 1].startDate

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const firstYear = first.getUTCFullYear()
  const lastYear = last.getUTCFullYear()

  let text: string
  if (firstYear === lastYear && first.getUTCMonth() === last.getUTCMonth()) {
    text = `${months[first.getUTCMonth()]} ${firstYear}`
  } else if (firstYear === lastYear) {
    text = `${months[first.getUTCMonth()]} \u2013 ${months[last.getUTCMonth()]} ${firstYear}`
  } else {
    text = `${months[first.getUTCMonth()]} ${firstYear} \u2013 ${months[last.getUTCMonth()]} ${lastYear}`
  }

  const y = borderWidth / 2 + 4
  return `<text x="${width / 2}" y="${y}" text-anchor="middle" font-family="'Lato', -apple-system, sans-serif" font-size="10" fill="${color}" opacity="0.45" letter-spacing="3" style="text-transform:uppercase">${escapeXml(text)}</text>`
}

export function generateCompassRose(
  bytes: Uint8Array,
  cx: number,
  cy: number,
  size: number,
  color: string,
): string {
  const r = size / 2
  const elements: string[] = []

  const cardinals = [
    { angle: -90, label: 'N', bold: true },
    { angle: 0, label: 'E', bold: false },
    { angle: 90, label: 'S', bold: false },
    { angle: 180, label: 'W', bold: false },
  ]

  for (const { angle, label, bold } of cardinals) {
    const rad = (angle * Math.PI) / 180
    const x1 = cx + Math.cos(rad) * (r * 0.3)
    const y1 = cy + Math.sin(rad) * (r * 0.3)
    const x2 = cx + Math.cos(rad) * r
    const y2 = cy + Math.sin(rad) * r
    const lx = cx + Math.cos(rad) * (r * 1.3)
    const ly = cy + Math.sin(rad) * (r * 1.3)

    elements.push(
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="${bold ? '1.2' : '0.6'}" opacity="${bold ? '0.6' : '0.35'}" stroke-linecap="round"/>`,
    )
    elements.push(
      `<text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="middle" font-family="'Lato', -apple-system, sans-serif" font-size="${bold ? '7' : '5'}" fill="${color}" opacity="${bold ? '0.55' : '0.3'}">${label}</text>`,
    )
  }

  const interCount = 2 + (bytes[0] % 3)
  for (let i = 0; i < interCount; i++) {
    const byteIdx = (i * 3 + 5) % 32
    const angle = (bytes[byteIdx] / 255) * 360
    const rad = (angle * Math.PI) / 180
    const len = r * (0.4 + (bytes[(byteIdx + 1) % 32] / 255) * 0.4)
    const x2 = cx + Math.cos(rad) * len
    const y2 = cy + Math.sin(rad) * len
    elements.push(
      `<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="0.4" opacity="0.25" stroke-linecap="round"/>`,
    )
  }

  elements.push(
    `<circle cx="${cx}" cy="${cy}" r="${(r * 0.15).toFixed(1)}" fill="${color}" opacity="0.4"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="none" stroke="${color}" stroke-width="0.5" opacity="0.3"/>`,
  )

  return elements.join('\n')
}

export function generateWalkSignature(
  walks: Walk[],
  cx: number,
  cy: number,
  size: number,
  color: string,
): string {
  const longest = walks.reduce<Walk | undefined>(
    (best, w) => (!best || w.stats.distance > best.stats.distance) ? w : best,
    undefined,
  )
  if (!longest) return ''

  const rp = extractRoutePoints(longest)
  if (rp.length < 4) return ''

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

  const pts = sampled.map(p => {
    const nx = (p.lon - minLon) / lonRange
    const ny = 1 - (p.lat - minLat) / latRange
    return `${(sx + nx * sw).toFixed(1)},${(sy + ny * sh).toFixed(1)}`
  })

  const elements: string[] = []

  elements.push(
    `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  )

  const startX = sx + ((sampled[0].lon - minLon) / lonRange) * sw
  const startY = sy + (1 - (sampled[0].lat - minLat) / latRange) * sh
  elements.push(
    `<circle cx="${startX.toFixed(1)}" cy="${startY.toFixed(1)}" r="2" fill="${color}" opacity="0.6"/>`,
  )

  const endP = sampled[sampled.length - 1]
  const endX = sx + ((endP.lon - minLon) / lonRange) * sw
  const endY = sy + (1 - (endP.lat - minLat) / latRange) * sh
  elements.push(
    `<circle cx="${endX.toFixed(1)}" cy="${endY.toFixed(1)}" r="1.2" fill="none" stroke="${color}" stroke-width="0.8" opacity="0.5"/>`,
  )

  return elements.join('\n')
}

function buildFrameElevationPath(
  routePoints: RoutePoint[],
  xStart: number,
  xEnd: number,
  yBaseline: number,
  maxAmplitude: number,
  frameX: number,
  frameW: number,
): string {
  if (routePoints.length < 4) return ''

  const alts = routePoints.map(p => p.alt)
  let minAlt = Infinity
  let maxAlt = -Infinity
  for (const a of alts) {
    if (a < minAlt) minAlt = a
    if (a > maxAlt) maxAlt = a
  }
  const altRange = Math.max(maxAlt - minAlt, 1)
  if (altRange < 0.5) return ''

  const totalWidth = xEnd - xStart
  const step = totalWidth / (routePoints.length - 1)
  const segments: string[] = []

  segments.push(`L${xEnd.toFixed(1)},${yBaseline.toFixed(1)}`)

  for (let i = routePoints.length - 1; i >= 0; i--) {
    const x = xStart + i * step
    const normalized = (alts[i] - minAlt) / altRange
    const y = yBaseline - normalized * maxAmplitude
    segments.push(`L${x.toFixed(1)},${y.toFixed(1)}`)
  }

  segments.push(`L${frameX.toFixed(1)},${yBaseline.toFixed(1)}`)

  return segments.join(' ')
}

export function generateBorderSvg(
  walks: Walk[],
  width: number,
  height: number,
  unit: UnitSystem,
  hashHex: string,
  statsText?: string,
  theme: BorderTheme = DEFAULT_THEME,
): string {
  const palette = BORDER_THEMES[theme]
  const color = palette.primary
  const bytes = hexToBytes(hashHex)
  const allRoutePoints = walks.flatMap(extractRoutePoints)

  const bw = BORDER_WIDTH
  const sealX = bw
  const sealY = height - bw
  const ix = bw
  const iy = bw
  const iw = width - bw * 2
  const ih = height - bw * 2
  const elevXStart = sealX + 80
  const elevXEnd = width - bw
  const frameElevYBaseline = iy + ih
  const frameElevAmplitude = bw * 0.45
  const traceElevYBaseline = iy + ih + 12
  const traceElevAmplitude = 14
  const seasonBarX = bw / 2
  const seasonBarYStart = bw + 15
  const seasonBarYEnd = height - bw - 15

  const frameElevationPoints = buildFrameElevationPath(allRoutePoints, elevXStart, elevXEnd, frameElevYBaseline, frameElevAmplitude, ix, iw)

  const elevationTraces = walks.map((walk, i) => {
    const points = extractRoutePoints(walk)
    const opacity = walks.length === 1 ? 0.5 : Math.max(0.15, 0.5 - i * (0.35 / walks.length))
    return generateLinearElevation(points, elevXStart, elevXEnd, traceElevYBaseline, traceElevAmplitude, color, opacity)
  })

  const compassCx = width - bw / 2
  const compassCy = bw / 2
  const signatureCx = bw / 2
  const signatureCy = bw / 2

  const allElements = [
    generateRouteGhost(walks, width, height, bw, color),
    generateFrameLines(width, height, bw, color, palette.glow, frameElevationPoints),
    generateSeasonBars(walks, seasonBarX, seasonBarYStart, seasonBarYEnd, palette.seasons),
    generateCornerOrnaments(bytes, width, height, bw, color),
    generateEdgeDots(bytes, width, height, bw, color, walks.length),
    generateSealRadials(bytes, sealX, sealY, color),
    generateTallyMarks(walks, width, height, bw, palette.seasons),
    generateDateRange(walks, width, bw, color),
    generateCompassRose(bytes, compassCx, compassCy, bw * 0.45, color),
    generateWalkSignature(walks, signatureCx, signatureCy, bw * 0.7, color),
    ...elevationTraces,
  ].filter(Boolean).join('\n')

  const elements: string[] = [
    allElements,
  ]

  elements.push(generateBorderStatsText(statsText, width, bw, height, color))

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    ...elements,
    `</svg>`,
  ].join('\n')
}
