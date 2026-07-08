import { describe, it, expect } from 'vitest'
import { isFoundPlace, FOUND_PLACE_ICON } from '../../src/parsers/found-place'
import type { GeoJSONFeature } from '../../src/parsers/types'

function makeFeature(properties: GeoJSONFeature['properties']): GeoJSONFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-8.51, 42.87] },
    properties,
  }
}

describe('isFoundPlace', () => {
  it('pins the reserved icon value shared with the iOS app', () => {
    expect(FOUND_PLACE_ICON).toBe('sun.haze')
  })

  it('is true for a waypoint carrying the sun.haze icon', () => {
    const f = makeFeature({ markerType: 'waypoint', icon: 'sun.haze', label: 'First clearing' })
    expect(isFoundPlace(f)).toBe(true)
  })

  it('is false for an ordinary waypoint icon', () => {
    const f = makeFeature({ markerType: 'waypoint', icon: 'leaf', label: 'Peaceful' })
    expect(isFoundPlace(f)).toBe(false)
  })

  it('is false when the icon is missing', () => {
    const f = makeFeature({ markerType: 'waypoint', label: 'Unmarked' })
    expect(isFoundPlace(f)).toBe(false)
  })

  it('is false for a non-waypoint feature even with the sun.haze icon', () => {
    const f = makeFeature({ markerType: 'photo', icon: 'sun.haze' })
    expect(isFoundPlace(f)).toBe(false)
  })
})
