import { describe, it, expect } from 'vitest'
import { recomputeStats } from '../../src/edit/recompute'
import type { Walk, WalkStats, GeoJSONFeatureCollection, Activity } from '../../src/parsers/types'

function makeRoute(coords: number[][]): GeoJSONFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: {},
    }],
  }
}

function baseWalk(overrides: Partial<Walk> = {}): Walk {
  return {
    id: 'w1',
    startDate: new Date(1_000_000),  // ms
    endDate: new Date(1_600_000),    // 10 minutes later
    stats: {
      distance: 1000, activeDuration: 540, pauseDuration: 60,
      ascent: 50, descent: 50, steps: 1500, burnedEnergy: 100,
      talkDuration: 0, meditateDuration: 0,
    },
    route: makeRoute([
      [0, 0, 100],
      [0.001, 0, 105],   // ~111m east, +5m elevation
      [0.002, 0, 110],
    ]),
    voiceRecordings: [],
    activities: [],
    pauses: [],
    source: 'pilgrim',
    ...overrides,
  }
}

describe('recomputeStats', () => {
  it('recomputes distance from haversine over remaining route coords', () => {
    const walk = baseWalk()
    const stats = recomputeStats(walk, walk.stats)
    expect(stats.distance).toBeGreaterThan(200)
    expect(stats.distance).toBeLessThan(250)
  })

  it('recomputes ascent and descent from elevation deltas', () => {
    const walk = baseWalk({
      route: makeRoute([
        [0, 0, 100], [0.001, 0, 110], [0.002, 0, 120], [0.003, 0, 105],
      ]),
    })
    const stats = recomputeStats(walk, walk.stats)
    expect(stats.ascent).toBeCloseTo(20, 0)   // 10 + 10
    expect(stats.descent).toBeCloseTo(15, 0)  // 15
  })

  it('pauseDuration sums remaining pauses; activeDuration = total - pauseDuration', () => {
    const walk = baseWalk({
      pauses: [
        { startDate: new Date(1_100_000), endDate: new Date(1_160_000), type: 'manual' }, // 60s
        { startDate: new Date(1_300_000), endDate: new Date(1_330_000), type: 'auto' },   // 30s
      ],
    })
    const stats = recomputeStats(walk, walk.stats)
    expect(stats.pauseDuration).toBe(90)
    expect(stats.activeDuration).toBe(600 - 90) // (endDate - startDate) seconds = 600
  })

  it('talkDuration and meditateDuration sum activities by type', () => {
    const walk = baseWalk({
      activities: [
        { type: 'talk',     startDate: new Date(1_000_000), endDate: new Date(1_050_000) }, // 50s
        { type: 'meditate', startDate: new Date(1_100_000), endDate: new Date(1_300_000) }, // 200s
        { type: 'walk',     startDate: new Date(1_300_000), endDate: new Date(1_600_000) }, // ignored
      ] as Activity[],
    })
    const stats = recomputeStats(walk, walk.stats)
    expect(stats.talkDuration).toBe(50)
    expect(stats.meditateDuration).toBe(200)
  })

  it('scales steps and burnedEnergy proportionally to new distance', () => {
    const walk = baseWalk()
    const original: WalkStats = { ...walk.stats, distance: 500, steps: 1000, burnedEnergy: 200 }
    const stats = recomputeStats(walk, original)
    // walk.route is ~222m total, original.distance = 500 → ratio = 222/500 ≈ 0.444
    expect(stats.steps).toBeGreaterThan(440)
    expect(stats.steps).toBeLessThan(450)
    expect(stats.burnedEnergy).toBeGreaterThan(85)
    expect(stats.burnedEnergy).toBeLessThan(95)
  })

  it('preserves undefined steps/burnedEnergy when original was undefined', () => {
    const walk = baseWalk()
    const original: WalkStats = { ...walk.stats, steps: undefined, burnedEnergy: undefined }
    const stats = recomputeStats(walk, original)
    expect(stats.steps).toBeUndefined()
    expect(stats.burnedEnergy).toBeUndefined()
  })
})
