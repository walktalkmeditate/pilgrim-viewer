import { describe, it, expect } from 'vitest'
import { generateFrameLines, generateLinearElevation, generateSeasonBars, generateCornerOrnaments, generateEdgeDots, generateSealRadials } from '../../src/map/border'
import { hexToBytes } from '../../src/panels/seal'
import type { Walk } from '../../src/parsers/types'

const TEST_HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'
const testBytes = hexToBytes(TEST_HASH)

function makeWalk(overrides: Partial<Walk> = {}): Walk {
  return {
    id: 'test-walk',
    startDate: new Date('2024-06-15T10:30:00Z'),
    endDate: new Date('2024-06-15T11:30:00Z'),
    stats: {
      distance: 5000, activeDuration: 3600, pauseDuration: 0,
      ascent: 50, descent: 45, talkDuration: 300, meditateDuration: 600,
    },
    route: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [[-122.4194, 37.7749, 10], [-122.4180, 37.7760, 15], [-122.4170, 37.7770, 20]],
        },
        properties: {},
      }],
    },
    voiceRecordings: [],
    activities: [],
    pauses: [],
    source: 'pilgrim',
    ...overrides,
  }
}

describe('generateFrameLines', () => {
  it('produces outer and inner rect elements', () => {
    // #given
    const width = 400
    const height = 300
    const borderWidth = 60
    const color = '#C4956A'

    // #when
    const svg = generateFrameLines(width, height, borderWidth, color)

    // #then
    expect(svg).toContain('<rect')
    expect((svg.match(/<rect/g) ?? []).length).toBe(2)
    expect(svg).toContain(color)
  })
})

describe('generateLinearElevation', () => {
  it('produces a polyline with correct point count', () => {
    // #given
    const routePoints = [
      { lat: 37.7, lon: -122.4, alt: 10 },
      { lat: 37.8, lon: -122.3, alt: 50 },
      { lat: 37.9, lon: -122.2, alt: 30 },
      { lat: 38.0, lon: -122.1, alt: 70 },
      { lat: 38.1, lon: -122.0, alt: 20 },
    ]
    const xStart = 100
    const xEnd = 350
    const yBaseline = 270
    const maxAmplitude = 20

    // #when
    const svg = generateLinearElevation(routePoints, xStart, xEnd, yBaseline, maxAmplitude, '#C4956A')

    // #then
    expect(svg).toContain('<polyline')
    const pointsMatch = svg.match(/points="([^"]+)"/)
    expect(pointsMatch).not.toBeNull()
    const points = pointsMatch![1].split(' ')
    expect(points).toHaveLength(5)
  })

  it('returns empty string for fewer than 2 route points', () => {
    // #given
    const routePoints = [{ lat: 37.7, lon: -122.4, alt: 10 }]

    // #when
    const svg = generateLinearElevation(routePoints, 100, 350, 270, 20, '#C4956A')

    // #then
    expect(svg).toBe('')
  })
})

describe('generateCornerOrnaments', () => {
  it('produces arc paths for each corner', () => {
    // #given / #when
    const svg = generateCornerOrnaments(testBytes, 400, 300, 60, '#C4956A')

    // #then
    expect(svg).toContain('<path')
    const paths = svg.match(/<path/g) ?? []
    expect(paths.length).toBeGreaterThanOrEqual(4) // at least 1 per corner
  })
})

describe('generateEdgeDots', () => {
  it('produces dots scaled to walk count', () => {
    // #given / #when
    const svg = generateEdgeDots(testBytes, 400, 300, 60, '#C4956A', 20)

    // #then
    const circles = svg.match(/<circle/g) ?? []
    expect(circles.length).toBeGreaterThanOrEqual(5)
    expect(circles.length).toBeLessThanOrEqual(30)
  })

  it('caps at 30 dots for large walk counts', () => {
    // #given / #when
    const svg = generateEdgeDots(testBytes, 400, 300, 60, '#C4956A', 500)

    // #then
    const circles = svg.match(/<circle/g) ?? []
    expect(circles.length).toBeLessThanOrEqual(30)
  })
})

describe('generateSealRadials', () => {
  it('produces line elements radiating from seal position', () => {
    // #given / #when
    const svg = generateSealRadials(testBytes, 60, 240, '#C4956A')

    // #then
    expect(svg).toContain('<line')
    const lines = svg.match(/<line/g) ?? []
    expect(lines.length).toBeGreaterThanOrEqual(3)
  })
})

describe('generateSeasonBars', () => {
  it('produces a single color bar for one walk', () => {
    // #given — summer walk in northern hemisphere
    const walks = [makeWalk({ startDate: new Date('2024-06-15T10:00:00Z') })]

    // #when
    const svg = generateSeasonBars(walks, 200, 26, 55, 240)

    // #then
    expect(svg).toContain('<line')
    expect((svg.match(/<line/g) ?? []).length).toBe(1)
    expect(svg).toContain('#C4956A') // summer/dawn
  })

  it('produces proportional bars for walks across seasons', () => {
    // #given — 2 spring, 1 autumn
    const walks = [
      makeWalk({ startDate: new Date('2024-03-15T10:00:00Z') }),
      makeWalk({ startDate: new Date('2024-04-10T10:00:00Z') }),
      makeWalk({ startDate: new Date('2024-09-20T10:00:00Z') }),
    ]

    // #when
    const svg = generateSeasonBars(walks, 200, 26, 55, 240)

    // #then
    expect(svg).toContain('#7A8B6F') // spring
    expect(svg).toContain('#A0634B') // autumn
    const lines = (svg.match(/<line/g) ?? [])
    expect(lines.length).toBe(2)
  })
})
