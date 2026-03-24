import { describe, it, expect } from 'vitest'
import { haversineDistance, totalDistance, elevationGain } from '../../src/parsers/geo'

describe('haversineDistance', () => {
  it('returns approximately 13km between SF and Oakland', () => {
    const dist = haversineDistance(37.7749, -122.4194, 37.8044, -122.2712)
    expect(dist).toBeGreaterThan(12500)
    expect(dist).toBeLessThan(13500)
  })

  it('returns 0 for the same point', () => {
    expect(haversineDistance(37.7749, -122.4194, 37.7749, -122.4194)).toBe(0)
  })

  it('returns approximately half Earth circumference for antipodal points', () => {
    const dist = haversineDistance(0, 0, 0, 180)
    expect(dist).toBeGreaterThan(19915000)
    expect(dist).toBeLessThan(20115000)
  })
})

describe('totalDistance', () => {
  it('sums sequential haversine distances for a coordinate array', () => {
    // Three points: SF, Oakland, Berkeley — coords are [lon, lat, alt]
    const sf = [-122.4194, 37.7749, 0]
    const oakland = [-122.2712, 37.8044, 0]
    const berkeley = [-122.2727, 37.8716, 0]
    const total = totalDistance([sf, oakland, berkeley])
    const sfToOakland = haversineDistance(37.7749, -122.4194, 37.8044, -122.2712)
    const oaklandToBerkeley = haversineDistance(37.8044, -122.2712, 37.8716, -122.2727)
    expect(total).toBeCloseTo(sfToOakland + oaklandToBerkeley, 0)
  })

  it('returns 0 for a single point', () => {
    expect(totalDistance([[-122.4194, 37.7749, 0]])).toBe(0)
  })

  it('returns 0 for an empty array', () => {
    expect(totalDistance([])).toBe(0)
  })
})

describe('elevationGain', () => {
  it('accumulates ascent and descent above threshold', () => {
    // [100, 105, 110, 108, 115, 100]
    // 100→105: +5 ascent
    // 105→110: +5 ascent
    // 110→108: -2 change, not > threshold (2), ignored
    // 108→115: +7 ascent
    // 115→100: -15 descent
    const { ascent, descent } = elevationGain([100, 105, 110, 108, 115, 100], 2)
    expect(ascent).toBe(17)
    expect(descent).toBe(15)
  })

  it('returns 0/0 for a flat route', () => {
    expect(elevationGain([100, 100, 100])).toEqual({ ascent: 0, descent: 0 })
  })

  it('returns 0/0 for an empty array', () => {
    expect(elevationGain([])).toEqual({ ascent: 0, descent: 0 })
  })
})
