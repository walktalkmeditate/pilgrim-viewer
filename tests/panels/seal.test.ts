import { describe, it, expect } from 'vitest'
import {
  _getSeason,
  _getTimeOfDay,
  _extractRoutePoints,
  buildCombinedWalk,
  computeWalkHash,
  hexToBytes,
  getSeason,
  getWeatherTurbulence,
  COLORS,
} from '../../src/panels/seal'
import type { Walk } from '../../src/parsers/types'

function makeWalk(overrides: Partial<Walk> = {}): Walk {
  return {
    id: 'test-walk-1',
    startDate: new Date('2024-06-15T10:30:00Z'),
    endDate: new Date('2024-06-15T11:30:00Z'),
    stats: {
      distance: 5000,
      activeDuration: 3600,
      pauseDuration: 0,
      ascent: 50,
      descent: 45,
      talkDuration: 300,
      meditateDuration: 600,
    },
    route: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [-122.4194, 37.7749, 10],
            [-122.4180, 37.7760, 15],
            [-122.4170, 37.7770, 20],
          ],
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

describe('getSeason', () => {
  it('returns Spring for northern hemisphere in March', () => {
    // #given
    const date = new Date('2024-03-15T00:00:00Z')
    // #when
    const result = _getSeason(date, 40)
    // #then
    expect(result).toBe('Spring')
  })

  it('returns Summer for northern hemisphere in July', () => {
    const date = new Date('2024-07-15T00:00:00Z')
    expect(_getSeason(date, 40)).toBe('Summer')
  })

  it('returns Autumn for northern hemisphere in October', () => {
    const date = new Date('2024-10-15T00:00:00Z')
    expect(_getSeason(date, 40)).toBe('Autumn')
  })

  it('returns Winter for northern hemisphere in January', () => {
    const date = new Date('2024-01-15T00:00:00Z')
    expect(_getSeason(date, 40)).toBe('Winter')
  })

  it('inverts seasons for southern hemisphere', () => {
    const marchDate = new Date('2024-03-15T00:00:00Z')
    expect(_getSeason(marchDate, -33)).toBe('Autumn')

    const julyDate = new Date('2024-07-15T00:00:00Z')
    expect(_getSeason(julyDate, -33)).toBe('Winter')
  })

  it('treats equator as northern hemisphere', () => {
    const date = new Date('2024-06-15T00:00:00Z')
    expect(_getSeason(date, 0)).toBe('Summer')
  })
})

describe('getTimeOfDay', () => {
  it('returns Early Morning for hours 5-7', () => {
    expect(_getTimeOfDay(5)).toBe('Early Morning')
    expect(_getTimeOfDay(7)).toBe('Early Morning')
  })

  it('returns Morning for hours 8-10', () => {
    expect(_getTimeOfDay(8)).toBe('Morning')
    expect(_getTimeOfDay(10)).toBe('Morning')
  })

  it('returns Midday for hours 11-13', () => {
    expect(_getTimeOfDay(11)).toBe('Midday')
    expect(_getTimeOfDay(13)).toBe('Midday')
  })

  it('returns Afternoon for hours 14-16', () => {
    expect(_getTimeOfDay(14)).toBe('Afternoon')
    expect(_getTimeOfDay(16)).toBe('Afternoon')
  })

  it('returns Evening for hours 17-19', () => {
    expect(_getTimeOfDay(17)).toBe('Evening')
    expect(_getTimeOfDay(19)).toBe('Evening')
  })

  it('returns Night for hours 20-4', () => {
    expect(_getTimeOfDay(0)).toBe('Night')
    expect(_getTimeOfDay(4)).toBe('Night')
    expect(_getTimeOfDay(23)).toBe('Night')
  })
})

describe('extractRoutePoints', () => {
  it('extracts lat/lon/alt from LineString features', () => {
    // #given
    const walk = makeWalk()

    // #when
    const points = _extractRoutePoints(walk)

    // #then
    expect(points).toHaveLength(3)
    expect(points[0]).toEqual({ lon: -122.4194, lat: 37.7749, alt: 10 })
    expect(points[1]).toEqual({ lon: -122.4180, lat: 37.7760, alt: 15 })
    expect(points[2]).toEqual({ lon: -122.4170, lat: 37.7770, alt: 20 })
  })

  it('defaults altitude to 0 when not present', () => {
    // #given
    const walk = makeWalk({
      route: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [[-122.4, 37.7]],
          },
          properties: {},
        }],
      },
    })

    // #when
    const points = _extractRoutePoints(walk)

    // #then
    expect(points[0].alt).toBe(0)
  })

  it('returns empty array when no LineString features exist', () => {
    // #given
    const walk = makeWalk({
      route: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-122.4, 37.7] },
          properties: {},
        }],
      },
    })

    // #when
    const points = _extractRoutePoints(walk)

    // #then
    expect(points).toHaveLength(0)
  })

  it('combines points from multiple LineString features', () => {
    // #given
    const walk = makeWalk({
      route: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [[-122.4, 37.7, 10]],
            },
            properties: {},
          },
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [[-122.3, 37.8, 20]],
            },
            properties: {},
          },
        ],
      },
    })

    // #when
    const points = _extractRoutePoints(walk)

    // #then
    expect(points).toHaveLength(2)
  })
})

describe('buildCombinedWalk', () => {
  it('aggregates stats from multiple walks and uses earliest startDate', () => {
    // #given
    const walk1 = makeWalk({
      id: 'walk-1',
      startDate: new Date('2024-06-15T10:00:00Z'),
      stats: {
        distance: 3000,
        activeDuration: 1800,
        pauseDuration: 0,
        ascent: 20,
        descent: 20,
        talkDuration: 200,
        meditateDuration: 400,
      },
    })
    const walk2 = makeWalk({
      id: 'walk-2',
      startDate: new Date('2024-03-10T08:00:00Z'),
      stats: {
        distance: 7000,
        activeDuration: 4200,
        pauseDuration: 0,
        ascent: 80,
        descent: 75,
        talkDuration: 600,
        meditateDuration: 900,
      },
    })

    // #when
    const combined = buildCombinedWalk([walk1, walk2])

    // #then
    expect(combined.id).toBe('combined-journey')
    expect(combined.stats.distance).toBe(10000)
    expect(combined.stats.activeDuration).toBe(6000)
    expect(combined.stats.talkDuration).toBe(800)
    expect(combined.stats.meditateDuration).toBe(1300)
    expect(combined.startDate).toEqual(new Date('2024-03-10T08:00:00Z'))
  })
})

describe('computeWalkHash', () => {
  it('returns a 64-character hex string', async () => {
    // #given
    const walk = makeWalk()
    const points = _extractRoutePoints(walk)

    // #when
    const hash = await computeWalkHash(walk, points)

    // #then
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]+$/)
  })
})

describe('hexToBytes', () => {
  it('converts a hex string to a Uint8Array', () => {
    // #given / #when
    const bytes = hexToBytes('deadbeef')

    // #then
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes[0]).toBe(0xde)
    expect(bytes[1]).toBe(0xad)
    expect(bytes[2]).toBe(0xbe)
    expect(bytes[3]).toBe(0xef)
  })
})

describe('getSeason (direct export)', () => {
  it('matches _getSeason alias', () => {
    const date = new Date('2024-06-15T00:00:00Z')
    expect(getSeason(date, 40)).toBe(_getSeason(date, 40))
  })
})

describe('getWeatherTurbulence', () => {
  it('returns higher octaves for rain', () => {
    expect(getWeatherTurbulence('rain').octaves).toBeGreaterThan(getWeatherTurbulence().octaves)
  })

  it('returns default params when condition is undefined', () => {
    expect(getWeatherTurbulence()).toEqual({ freq: '0.04', octaves: 3, scale: 1.5 })
  })
})

describe('COLORS', () => {
  it('exports expected color tokens', () => {
    expect(COLORS.stone).toBe('#8B7355')
    expect(COLORS.dawn).toBe('#C4956A')
    expect(COLORS.fog).toBe('#B8AFA2')
  })
})
