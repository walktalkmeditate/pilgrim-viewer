import type { Walk } from '../parsers/types'
import type { UnitSystem } from '../parsers/units'
import {
  computeWalkHash, hexToBytes, extractRoutePoints, buildCombinedWalk,
  getSeason, getWeatherTurbulence, COLORS,
} from '../panels/seal'
import type { RoutePoint } from '../panels/seal'

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
