import { describe, it, expect } from 'vitest'
import { generateFrameLines, generateLinearElevation, generateSeasonBars, generateCornerOrnaments, generateEdgeDots, generateSealRadials, generateBorderStatsText, generateWeatherFilter, generateBorderSvg, generateTallyMarks, generateDateRange, generateCompassRose, generateRouteGhost, generatePaperGrain, generateStreakCalendar } from '../../src/map/border'
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
    expect((svg.match(/<rect/g) ?? []).length).toBeGreaterThanOrEqual(4)
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

describe('generateBorderStatsText', () => {
  it('splits distance into hero number and rest below', () => {
    // #given
    const statsText = '12 walks \u00B7 48.3 km \u00B7 3 seasons'

    // #when
    const svg = generateBorderStatsText(statsText, 400, 60, 300, '#C4956A')

    // #then
    expect(svg).toContain('<text')
    expect(svg).toContain('48.3 km')
    expect(svg).toContain('Cormorant Garamond')
    expect(svg).toContain('text-anchor="end"')
  })

  it('returns empty string when statsText is undefined', () => {
    // #when
    const svg = generateBorderStatsText(undefined, 400, 60, 300, '#C4956A')

    // #then
    expect(svg).toBe('')
  })
})

describe('generateWeatherFilter', () => {
  it('produces SVG filter with turbulence for rain', () => {
    // #when
    const svg = generateWeatherFilter('rain', 'border-weather')

    // #then
    expect(svg).toContain('<filter')
    expect(svg).toContain('feTurbulence')
    expect(svg).toContain('0.06') // rain frequency
  })

  it('uses default turbulence when condition is undefined', () => {
    // #when
    const svg = generateWeatherFilter(undefined, 'border-weather')

    // #then
    expect(svg).toContain('0.04') // default frequency
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

describe('generateBorderSvg', () => {
  it('produces a complete SVG with all border elements for stats variant', async () => {
    // #given
    const walks = [makeWalk()]
    const hashHex = TEST_HASH
    const statsText = '1 walk · 5.00 km · 1 season'

    // #when
    const svg = await generateBorderSvg(walks, 400, 300, 'metric', hashHex, statsText)

    // #then
    expect(svg).toContain('<svg')
    expect(svg).toContain('</svg>')
    expect(svg).toContain('<rect')    // frame lines
    expect(svg).toContain('<polyline') // elevation trace
    expect(svg).toContain('1 walk')    // stats text
    expect(svg).toContain('<circle')   // edge dots
  })

  it('omits stats text when statsText is not provided', async () => {
    // #given
    const walks = [makeWalk()]
    const hashHex = TEST_HASH

    // #when
    const svg = await generateBorderSvg(walks, 400, 300, 'metric', hashHex)

    // #then
    expect(svg).toContain('<svg')
    expect(svg).not.toContain('Cormorant Garamond')
  })

  it('produces denser elements for multi-walk overlay', async () => {
    // #given
    const walks = Array.from({ length: 25 }, (_, i) =>
      makeWalk({
        id: `walk-${i}`,
        startDate: new Date(2024, i % 12, 15),
      })
    )

    // #when
    const svg = await generateBorderSvg(walks, 400, 300, 'metric', TEST_HASH, '25 walks')

    // #then
    const circles = svg.match(/<circle/g) ?? []
    expect(circles.length).toBeGreaterThan(5) // scaled dots
  })
})

describe('generateTallyMarks', () => {
  it('produces one mark per walk', () => {
    // #given
    const walks = [makeWalk(), makeWalk({ id: 'w2' }), makeWalk({ id: 'w3' })]

    // #when
    const svg = generateTallyMarks(walks, 400, 300, 60)

    // #then
    const lines = svg.match(/<line/g) ?? []
    expect(lines.length).toBe(3)
  })

  it('returns empty string for no walks', () => {
    expect(generateTallyMarks([], 400, 300, 60)).toBe('')
  })
})

describe('generateDateRange', () => {
  it('produces date range text for walks spanning months', () => {
    // #given
    const walks = [
      makeWalk({ startDate: new Date('2024-03-15T10:00:00Z') }),
      makeWalk({ startDate: new Date('2024-09-20T10:00:00Z') }),
    ]

    // #when
    const svg = generateDateRange(walks, 400, 60, '#C4956A')

    // #then
    expect(svg).toContain('<text')
    expect(svg).toContain('Mar')
    expect(svg).toContain('Sep')
  })

  it('shows single month for same-month walks', () => {
    // #given
    const walks = [
      makeWalk({ startDate: new Date('2024-06-10T10:00:00Z') }),
      makeWalk({ startDate: new Date('2024-06-20T10:00:00Z') }),
    ]

    // #when
    const svg = generateDateRange(walks, 400, 60, '#C4956A')

    // #then
    expect(svg).toContain('Jun 2024')
    expect(svg).not.toContain('\u2013')
  })
})

describe('generateCompassRose', () => {
  it('produces cardinal lines and labels', () => {
    // #given / #when
    const svg = generateCompassRose(testBytes, 370, 30, 25, '#C4956A')

    // #then
    expect(svg).toContain('N')
    expect(svg).toContain('E')
    expect(svg).toContain('S')
    expect(svg).toContain('W')
    expect(svg).toContain('<line')
    expect(svg).toContain('<circle')
  })
})

describe('generateFrameLines with elevation', () => {
  it('uses path instead of rect for inner frame when elevation provided', () => {
    // #given
    const elevPoints = 'L300,240 L200,230 L100,235'

    // #when
    const svg = generateFrameLines(400, 300, 60, '#C4956A', '#F0EBE1', elevPoints)

    // #then
    expect(svg).toContain('<path')
    expect(svg).toContain(elevPoints)
  })
})

describe('generateRouteGhost', () => {
  it('produces faint polylines from walk routes', () => {
    // #given
    const walks = [makeWalk({
      route: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [[-122.4, 37.7, 10], [-122.3, 37.8, 15], [-122.2, 37.9, 20], [-122.1, 38.0, 25]],
          },
          properties: {},
        }],
      },
    })]

    // #when
    const svg = generateRouteGhost(walks, 400, 300, 60, '#C4956A')

    // #then
    expect(svg).toContain('<polyline')
    expect(svg).toContain('opacity="0.04"')
  })
})

describe('generatePaperGrain', () => {
  it('produces filter and rect elements for border areas', () => {
    // #when
    const svg = generatePaperGrain(400, 300, 60)

    // #then
    expect(svg).toContain('<filter')
    expect(svg).toContain('fractalNoise')
    expect(svg).toContain('<rect')
  })
})

describe('generateStreakCalendar', () => {
  it('produces dots for walk days and rest days', () => {
    // #given — 3 walks over 5 days
    const walks = [
      makeWalk({ startDate: new Date('2024-06-10T10:00:00Z') }),
      makeWalk({ startDate: new Date('2024-06-12T10:00:00Z') }),
      makeWalk({ startDate: new Date('2024-06-14T10:00:00Z') }),
    ]

    // #when
    const svg = generateStreakCalendar(walks, 400, 300, 60, '#C4956A')

    // #then
    expect(svg).toContain('<circle')
    const circles = svg.match(/<circle/g) ?? []
    expect(circles.length).toBe(5) // 5 days total, 3 filled + 2 empty
  })

  it('returns empty for no walks', () => {
    expect(generateStreakCalendar([], 400, 300, 60, '#C4956A')).toBe('')
  })
})
