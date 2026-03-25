import type { Walk } from '../parsers/types'
import type { UnitSystem } from '../parsers/units'
import {
  hexToBytes, extractRoutePoints,
  getSeason, getWeatherTurbulence, COLORS,
} from '../panels/seal'
import type { RoutePoint } from '../panels/seal'

export const BORDER_WIDTH = 60

const BORDER_COLOR = COLORS.dawn

const SEASON_COLORS: Record<string, string> = {
  Spring: '#7A8B6F',
  Summer: '#C4956A',
  Autumn: '#A0634B',
  Winter: '#B8AFA2',
}

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

  return `<polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="1" opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round"/>`
}

export function generateSeasonBars(
  walks: Walk[],
  height: number,
  x: number,
  yStart: number,
  yEnd: number,
): string {
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
    const color = SEASON_COLORS[season] ?? COLORS.dawn
    const y2 = currentY + segmentHeight

    bars.push(
      `<line x1="${x}" y1="${currentY.toFixed(1)}" x2="${x}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="2.5" opacity="0.4" stroke-linecap="round"/>`,
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
      const opacity = (0.2 + (bytes[(byteIdx + 3) % 32] / 255) * 0.2).toFixed(2)

      const startRad = (startAngle * Math.PI) / 180
      const endRad = ((startAngle + sweep) * Math.PI) / 180

      const x1 = cx + Math.cos(startRad) * radius
      const y1 = cy + Math.sin(startRad) * radius
      const cpx = cx + Math.cos((startRad + endRad) / 2) * radius * 1.3
      const cpy = cy + Math.sin((startRad + endRad) / 2) * radius * 1.3
      const x2 = cx + Math.cos(endRad) * radius
      const y2 = cy + Math.sin(endRad) * radius

      paths.push(
        `<path d="M${x1.toFixed(1)},${y1.toFixed(1)} Q${cpx.toFixed(1)},${cpy.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}" fill="none" stroke="${color}" stroke-width="0.8" opacity="${opacity}" stroke-linecap="round"/>`,
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
    const opacity = (0.2 + (bytes[byteIdx] / 255) * 0.25).toFixed(2)

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
    const opacity = (0.2 + (bytes[byteIdx] / 255) * 0.25).toFixed(2)

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
    const opacity = (0.15 + (bytes[(byteIdx + 2) % 32] / 255) * 0.15).toFixed(2)

    const x2 = sealX + Math.cos(rad) * length
    const y2 = sealY + Math.sin(rad) * length

    lines.push(
      `<line x1="${sealX.toFixed(1)}" y1="${sealY.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="0.5" opacity="${opacity}" stroke-linecap="round"/>`,
    )
  }

  return lines.join('\n')
}

export function generateBorderStatsText(
  statsText: string | undefined,
  width: number,
  y: number,
  color: string,
): string {
  if (!statsText) return ''
  return `<text x="${width / 2}" y="${y}" text-anchor="middle" font-family="'Lato', -apple-system, sans-serif" font-size="8" fill="${color}" opacity="0.55">${statsText}</text>`
}

export function generateWeatherFilter(
  condition: string | undefined,
  filterId: string,
): string {
  const params = getWeatherTurbulence(condition)
  return [
    `<filter id="${filterId}">`,
    `  <feTurbulence type="turbulence" baseFrequency="${params.freq}" numOctaves="${params.octaves}" seed="42"/>`,
    `  <feDisplacementMap in="SourceGraphic" scale="${params.scale}"/>`,
    `</filter>`,
  ].join('\n')
}

export function generateFrameLines(
  width: number,
  height: number,
  borderWidth: number,
  color: string,
): string {
  const outerMargin = 10
  const outerW = width - outerMargin * 2
  const outerH = height - outerMargin * 2
  const innerX = borderWidth
  const innerY = borderWidth
  const innerW = width - borderWidth * 2
  const innerH = height - borderWidth * 2

  return [
    `<rect x="${outerMargin}" y="${outerMargin}" width="${outerW}" height="${outerH}" rx="3" fill="none" stroke="${color}" stroke-width="0.8" opacity="0.25"/>`,
    `<rect x="${innerX}" y="${innerY}" width="${innerW}" height="${innerH}" rx="2" fill="none" stroke="${color}" stroke-width="1.2" opacity="0.5"/>`,
  ].join('\n')
}

export async function generateBorderSvg(
  walks: Walk[],
  width: number,
  height: number,
  variant: 'stats' | 'clean',
  unit: UnitSystem,
  hashHex: string,
  statsText?: string,
): Promise<string> {
  const bytes = hexToBytes(hashHex)
  const allRoutePoints = walks.flatMap(extractRoutePoints)
  const earliestWalk = walks.reduce<Walk | undefined>(
    (earliest, walk) => (!earliest || walk.startDate < earliest.startDate ? walk : earliest),
    undefined,
  )
  const weatherCondition = earliestWalk?.weather?.condition

  const sealX = BORDER_WIDTH
  const sealY = height - BORDER_WIDTH
  const elevXStart = sealX + 80
  const elevXEnd = width - BORDER_WIDTH
  const elevYBaseline = height - BORDER_WIDTH / 2
  const elevMaxAmplitude = BORDER_WIDTH * 0.3
  const seasonBarX = BORDER_WIDTH / 2
  const seasonBarYStart = BORDER_WIDTH + 8
  const seasonBarYEnd = height - BORDER_WIDTH - 8

  const elevationTraces = walks.map((walk, i) => {
    const points = extractRoutePoints(walk)
    const opacity = walks.length === 1 ? 0.35 : Math.max(0.1, 0.35 - i * (0.25 / walks.length))
    return generateLinearElevation(points, elevXStart, elevXEnd, elevYBaseline, elevMaxAmplitude, BORDER_COLOR, opacity)
  })

  const filteredElements = [
    generateFrameLines(width, height, BORDER_WIDTH, BORDER_COLOR),
    generateSeasonBars(walks, height, seasonBarX, seasonBarYStart, seasonBarYEnd),
    generateCornerOrnaments(bytes, width, height, BORDER_WIDTH, BORDER_COLOR),
    generateEdgeDots(bytes, width, height, BORDER_WIDTH, BORDER_COLOR, walks.length),
    generateSealRadials(bytes, sealX, sealY, BORDER_COLOR),
    ...elevationTraces,
  ].filter(Boolean).join('\n')

  const elements: string[] = [
    `<defs>\n${generateWeatherFilter(weatherCondition, 'border-weather')}\n</defs>`,
    `<g filter="url(#border-weather)">`,
    filteredElements,
    `</g>`,
  ]

  if (variant === 'stats') {
    elements.push(generateBorderStatsText(statsText, width, height - BORDER_WIDTH / 2 + 16, BORDER_COLOR))
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    ...elements,
    `</svg>`,
  ].join('\n')
}
