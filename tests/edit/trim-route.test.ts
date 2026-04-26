import { describe, it, expect } from 'vitest'
import { trimRouteSeparately } from '../../src/parsers/route-trim'
import type { GeoJSONFeatureCollection } from '../../src/parsers/types'

function lineRoute(coords: number[][]): GeoJSONFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: { timestamps: coords.map((_, i) => i * 1000) },
    }],
  }
}

describe('trimRouteSeparately', () => {
  it('returns original route when both meters are 0', () => {
    const route = lineRoute([[0, 0], [0.001, 0], [0.002, 0]])
    const out = trimRouteSeparately(route, { startMeters: 0, endMeters: 0 })
    expect(out.features[0].geometry.coordinates).toEqual([[0, 0], [0.001, 0], [0.002, 0]])
  })

  it('trims from start by accumulating meters', () => {
    const route = lineRoute([[0, 0], [0.001, 0], [0.002, 0], [0.003, 0]])
    const out = trimRouteSeparately(route, { startMeters: 50, endMeters: 0 })
    expect(out.features[0].geometry.coordinates).toHaveLength(3)
    expect(out.features[0].geometry.coordinates[0]).toEqual([0.001, 0])
  })

  it('trims from end', () => {
    const route = lineRoute([[0, 0], [0.001, 0], [0.002, 0], [0.003, 0]])
    const out = trimRouteSeparately(route, { startMeters: 0, endMeters: 50 })
    expect(out.features[0].geometry.coordinates).toHaveLength(3)
    expect(out.features[0].geometry.coordinates[2]).toEqual([0.002, 0])
  })

  it('trims from both ends in one call', () => {
    const route = lineRoute([[0, 0], [0.001, 0], [0.002, 0], [0.003, 0], [0.004, 0]])
    const out = trimRouteSeparately(route, { startMeters: 50, endMeters: 50 })
    expect(out.features[0].geometry.coordinates).toHaveLength(3)
  })

  it('leaves at least 2 coords when over-trimmed', () => {
    const route = lineRoute([[0, 0], [0.001, 0], [0.002, 0]])
    const out = trimRouteSeparately(route, { startMeters: 999_999, endMeters: 0 })
    expect(out.features[0].geometry.coordinates.length).toBeGreaterThanOrEqual(2)
  })

  it('preserves timestamps aligned with surviving coords', () => {
    const route = lineRoute([[0, 0], [0.001, 0], [0.002, 0], [0.003, 0]])
    const out = trimRouteSeparately(route, { startMeters: 50, endMeters: 0 })
    expect(out.features[0].properties.timestamps).toEqual([1000, 2000, 3000])
  })
})
