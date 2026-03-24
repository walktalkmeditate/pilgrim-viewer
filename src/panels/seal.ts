import type { Walk } from '../parsers/types'
import type { UnitSystem } from '../parsers/units'

const COLORS = {
  stone: '#8B7355',
  dawn: '#C4956A',
  fog: '#B8AFA2',
} as const

function getSeason(date: Date, latitude: number): string {
  const month = date.getUTCMonth()
  const isNorthern = latitude >= 0

  if (isNorthern) {
    if (month >= 2 && month <= 4) return 'Spring'
    if (month >= 5 && month <= 7) return 'Summer'
    if (month >= 8 && month <= 10) return 'Autumn'
    return 'Winter'
  }

  if (month >= 2 && month <= 4) return 'Autumn'
  if (month >= 5 && month <= 7) return 'Winter'
  if (month >= 8 && month <= 10) return 'Spring'
  return 'Summer'
}

function getTimeOfDay(hour: number): string {
  if (hour >= 5 && hour < 8) return 'Early Morning'
  if (hour >= 8 && hour < 11) return 'Morning'
  if (hour >= 11 && hour < 14) return 'Midday'
  if (hour >= 14 && hour < 17) return 'Afternoon'
  if (hour >= 17 && hour < 20) return 'Evening'
  return 'Night'
}

function getWeatherTurbulence(condition?: string): { freq: string; octaves: number; scale: number } {
  switch (condition?.toLowerCase()) {
    case 'rain': case 'drizzle': case 'thunderstorm':
      return { freq: '0.06', octaves: 4, scale: 2.0 }
    case 'snow':
      return { freq: '0.08', octaves: 5, scale: 1.0 }
    case 'wind':
      return { freq: '0.03', octaves: 2, scale: 2.5 }
    default:
      return { freq: '0.04', octaves: 3, scale: 1.5 }
  }
}

interface RoutePoint {
  lat: number
  lon: number
  alt: number
}

function extractRoutePoints(walk: Walk): RoutePoint[] {
  const points: RoutePoint[] = []
  for (const feature of walk.route.features) {
    if (feature.geometry.type === 'LineString') {
      const coords = feature.geometry.coordinates as number[][]
      for (const coord of coords) {
        points.push({ lon: coord[0], lat: coord[1], alt: coord[2] ?? 0 })
      }
    }
  }
  return points
}

async function computeWalkHash(walk: Walk, routePoints: RoutePoint[]): Promise<string> {
  const parts: string[] = []

  for (const p of routePoints) {
    parts.push(`${p.lat.toFixed(5)},${p.lon.toFixed(5)}`)
  }

  parts.push(String(walk.stats.distance ?? 0))
  parts.push(String(walk.stats.activeDuration ?? 0))
  parts.push(String(walk.stats.meditateDuration ?? 0))
  parts.push(String(walk.stats.talkDuration ?? 0))
  parts.push(walk.startDate.toISOString())

  const data = new TextEncoder().encode(parts.join('|'))
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = new Uint8Array(hashBuffer)

  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

function generateRings(
  bytes: Uint8Array,
  cx: number, cy: number, outerR: number, size: number,
  color: string, meditateRatio: number,
): string {
  const baseCount = 3 + (bytes[1] % 3)
  const extraRipples = meditateRatio > 0.2 ? Math.floor(meditateRatio * 6) : 0
  const ringCount = Math.min(baseCount + extraRipples, 8)

  const rings: string[] = []
  for (let i = 0; i < ringCount; i++) {
    const radiusOffset = (bytes[2 + (i % 6)] / 255) * 0.08
    const r = outerR - i * (size * (0.04 + radiusOffset * 0.02))
    if (r < size * 0.15) break

    const dashByte = bytes[6 + (i % 6)]
    const dashLen = 2 + (dashByte % 8)
    const gapLen = 1 + ((dashByte >> 4) % 6)
    const dasharray = i === 0 ? '' : `stroke-dasharray="${dashLen} ${gapLen}"`

    const strokeW = i === 0 ? 1.5 : 0.8 + (bytes[i] % 3) * 0.3
    const opacity = 0.7 - i * 0.06

    rings.push(
      `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${strokeW.toFixed(1)}" opacity="${opacity.toFixed(2)}" ${dasharray}/>`
    )
  }
  return rings.join('\n')
}

function generateRadialLines(
  bytes: Uint8Array,
  cx: number, cy: number, outerR: number, size: number,
  color: string, talkRatio: number,
): string {
  const baseCount = 4 + (bytes[8] % 5)
  const extraLines = talkRatio > 0.1 ? Math.floor(talkRatio * 8) : 0
  const lineCount = Math.min(baseCount + extraLines, 12)

  const lines: string[] = []
  for (let i = 0; i < lineCount; i++) {
    const angle = ((bytes[8 + (i % 8)] / 255) * 360 + i * (360 / lineCount)) % 360
    const rad = (angle * Math.PI) / 180

    const innerExtent = 0.25 + (bytes[16 + (i % 4)] / 255) * 0.15
    const outerExtent = 0.85 + (bytes[20 + (i % 4)] / 255) * 0.15

    const x1 = cx + Math.cos(rad) * outerR * innerExtent
    const y1 = cy + Math.sin(rad) * outerR * innerExtent
    const x2 = cx + Math.cos(rad) * outerR * outerExtent
    const y2 = cy + Math.sin(rad) * outerR * outerExtent

    const strokeW = 0.5 + (bytes[i] % 3) * 0.3
    const opacity = 0.3 + (bytes[i + 12] / 255) * 0.3

    lines.push(
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="${strokeW.toFixed(1)}" opacity="${opacity.toFixed(2)}" stroke-linecap="round"/>`
    )
  }
  return lines.join('\n')
}

function generateArcSegments(
  bytes: Uint8Array,
  cx: number, cy: number, outerR: number,
  color: string,
): string {
  const count = 2 + (bytes[24] % 3)
  const arcs: string[] = []

  for (let i = 0; i < count; i++) {
    const startAngle = (bytes[24 + i] / 255) * 360
    const sweep = 20 + (bytes[26 + (i % 2)] / 255) * 60
    const r = outerR * (0.55 + (bytes[28 + (i % 2)] / 255) * 0.25)

    const startRad = (startAngle * Math.PI) / 180
    const endRad = ((startAngle + sweep) * Math.PI) / 180

    const x1 = cx + Math.cos(startRad) * r
    const y1 = cy + Math.sin(startRad) * r
    const x2 = cx + Math.cos(endRad) * r
    const y2 = cy + Math.sin(endRad) * r

    const largeArc = sweep > 180 ? 1 : 0

    arcs.push(
      `<path d="M${x1.toFixed(1)},${y1.toFixed(1)} A${r.toFixed(1)},${r.toFixed(1)} 0 ${largeArc},1 ${x2.toFixed(1)},${y2.toFixed(1)}" fill="none" stroke="${color}" stroke-width="0.8" opacity="0.4" stroke-linecap="round"/>`
    )
  }
  return arcs.join('\n')
}

function generateDots(
  bytes: Uint8Array,
  cx: number, cy: number, outerR: number,
  color: string,
): string {
  const count = 3 + (bytes[28] % 5)
  const dots: string[] = []

  for (let i = 0; i < count; i++) {
    const angle = (bytes[28 + (i % 4)] / 255) * 360 + i * 47
    const rad = (angle * Math.PI) / 180
    const dist = outerR * (0.3 + (bytes[29 + (i % 3)] / 255) * 0.5)

    const x = cx + Math.cos(rad) * dist
    const y = cy + Math.sin(rad) * dist
    const r = 1 + (bytes[i] % 2)

    dots.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${color}" opacity="0.35"/>`
    )
  }
  return dots.join('\n')
}

function generateElevationRing(
  routePoints: RoutePoint[],
  cx: number, cy: number, baseRadius: number, size: number, color: string,
): string {
  if (routePoints.length < 10) return ''

  const alts = routePoints.map(p => p.alt)
  const minAlt = Math.min(...alts)
  const maxAlt = Math.max(...alts)
  const altRange = Math.max(maxAlt - minAlt, 1)
  const maxOffset = size * 0.03

  const points: string[] = []
  const step = (2 * Math.PI) / routePoints.length

  for (let i = 0; i < routePoints.length; i++) {
    const normalized = (alts[i] - minAlt) / altRange
    const r = baseRadius + (normalized - 0.5) * maxOffset * 2
    const angle = step * i - Math.PI / 2
    const x = cx + Math.cos(angle) * r
    const y = cy + Math.sin(angle) * r
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  }

  return `<polygon points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="0.8" opacity="0.5"/>`
}

function generateSealSvg(
  bytes: Uint8Array,
  walk: Walk,
  routePoints: RoutePoint[],
  size: number,
  unit: UnitSystem,
): string {
  const date = walk.startDate
  const latitude = routePoints[0]?.lat ?? 0
  const season = getSeason(date, latitude)
  const year = date.getUTCFullYear()
  const timeOfDay = getTimeOfDay(date.getUTCHours())
  const distanceKm = (walk.stats.distance ?? 0) / 1000
  const displayDist = unit === 'imperial'
    ? (distanceKm * 0.621371).toFixed(1)
    : distanceKm.toFixed(1)
  const unitLabel = unit === 'imperial' ? 'MILES' : 'KM'

  const cx = size / 2
  const cy = size / 2
  const outerR = size * 0.44
  const rotation = (bytes[0] / 255) * 360

  const sealColor = COLORS.stone

  const activeDuration = walk.stats.activeDuration ?? 0
  const meditateRatio = activeDuration > 0 ? (walk.stats.meditateDuration ?? 0) / activeDuration : 0
  const talkRatio = activeDuration > 0 ? (walk.stats.talkDuration ?? 0) / activeDuration : 0

  const weatherParams = getWeatherTurbulence(walk.weather?.condition)

  const filterId = `stamp-rough-${walk.id}`
  const topArcId = `stamp-arc-top-${walk.id}`
  const bottomArcId = `stamp-arc-bottom-${walk.id}`

  const elements: string[] = []
  elements.push(generateRings(bytes, cx, cy, outerR, size, sealColor, meditateRatio))
  elements.push(generateRadialLines(bytes, cx, cy, outerR, size, sealColor, talkRatio))
  elements.push(generateArcSegments(bytes, cx, cy, outerR, sealColor))
  elements.push(generateDots(bytes, cx, cy, outerR, sealColor))

  const elevationRing = generateElevationRing(routePoints, cx, cy, outerR * 0.75, size, sealColor)
  if (elevationRing) elements.push(elevationRing)

  const arcR = outerR - size * 0.08
  const topArc = `M ${cx - arcR},${cy} A ${arcR},${arcR} 0 0,1 ${cx + arcR},${cy}`
  const bottomArc = `M ${cx + arcR},${cy + size * 0.06} A ${arcR},${arcR} 0 0,1 ${cx - arcR},${cy + size * 0.06}`

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Walk seal">
<defs>
  <filter id="${filterId}">
    <feTurbulence type="turbulence" baseFrequency="${weatherParams.freq}" numOctaves="${weatherParams.octaves}" seed="${bytes[31]}"/>
    <feDisplacementMap in="SourceGraphic" scale="${weatherParams.scale}"/>
  </filter>
</defs>
<g transform="rotate(${rotation.toFixed(1)} ${cx} ${cy})" filter="url(#${filterId})">
${elements.join('\n')}
</g>
<g transform="rotate(${rotation.toFixed(1)} ${cx} ${cy})">
  <path id="${topArcId}" d="${topArc}" fill="none"/>
  <text font-family="'Lato', -apple-system, sans-serif" font-size="${size * 0.048}" fill="${sealColor}" letter-spacing="3" opacity="0.7">
    <textPath href="#${topArcId}" startOffset="50%" text-anchor="middle" style="text-transform:uppercase">PILGRIM · ${season.toUpperCase()} ${year}</textPath>
  </text>
  <path id="${bottomArcId}" d="${bottomArc}" fill="none"/>
  <text font-family="'Lato', -apple-system, sans-serif" font-size="${size * 0.048}" fill="${sealColor}" letter-spacing="3" opacity="0.7">
    <textPath href="#${bottomArcId}" startOffset="50%" text-anchor="middle" style="text-transform:uppercase">${timeOfDay.toUpperCase()} WALK</textPath>
  </text>
</g>
<text x="${cx}" y="${cy - size * 0.02}" text-anchor="middle" font-family="'Cormorant Garamond', Georgia, serif" font-size="${size * 0.17}" font-weight="300" fill="${sealColor}" opacity="0.7">${displayDist}</text>
<text x="${cx}" y="${cy + size * 0.1}" text-anchor="middle" font-family="'Lato', -apple-system, sans-serif" font-size="${size * 0.05}" fill="${COLORS.fog}" letter-spacing="2">${unitLabel}</text>
</svg>`
}

export async function renderSealPanel(
  container: HTMLElement,
  walk: Walk,
  unit: UnitSystem = 'metric',
): Promise<void> {
  const routePoints = extractRoutePoints(walk)
  if (routePoints.length === 0) return

  const hash = await computeWalkHash(walk, routePoints)
  const bytes = hexToBytes(hash)

  const SIZE = 200
  const svg = generateSealSvg(bytes, walk, routePoints, SIZE, unit)

  const wrapper = document.createElement('div')
  wrapper.className = 'panel seal-panel'
  // Safe: SVG is entirely self-generated from numeric hash values and constants, no user content
  wrapper.innerHTML = svg // eslint-disable-line no-unsanitized/property

  container.appendChild(wrapper)
}

export async function generateCombinedSealSVG(
  walks: Walk[],
  size: number,
  unit: UnitSystem = 'metric',
): Promise<string | null> {
  if (walks.length === 0) return null

  const allRoutePoints: RoutePoint[] = []
  for (const walk of walks) {
    allRoutePoints.push(...extractRoutePoints(walk))
  }
  if (allRoutePoints.length === 0) return null

  const totalDistance = walks.reduce((s, w) => s + w.stats.distance, 0)
  const totalActiveDuration = walks.reduce((s, w) => s + w.stats.activeDuration, 0)
  const totalMeditateDuration = walks.reduce((s, w) => s + w.stats.meditateDuration, 0)
  const totalTalkDuration = walks.reduce((s, w) => s + w.stats.talkDuration, 0)
  const earliestWalk = walks.reduce((min, w) => w.startDate < min.startDate ? w : min, walks[0])

  const combinedWalk: Walk = {
    ...earliestWalk,
    id: 'combined-journey',
    stats: {
      ...earliestWalk.stats,
      distance: totalDistance,
      activeDuration: totalActiveDuration,
      meditateDuration: totalMeditateDuration,
      talkDuration: totalTalkDuration,
    },
  }

  const hash = await computeWalkHash(combinedWalk, allRoutePoints)
  const bytes = hexToBytes(hash)

  return generateSealSvg(bytes, combinedWalk, allRoutePoints, size, unit)
}

export { getSeason as _getSeason, getTimeOfDay as _getTimeOfDay, extractRoutePoints as _extractRoutePoints }
