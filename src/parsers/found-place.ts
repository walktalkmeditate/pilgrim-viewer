import type { GeoJSONFeature } from './types'

// Seek arrivals ("found places") come from the iOS app as ordinary
// waypoint features stamped with this reserved icon value — no
// user-pickable waypoint uses it. Contract shared with pilgrim-ios.
export const FOUND_PLACE_ICON = 'sun.haze'

export function isFoundPlace(feature: GeoJSONFeature): boolean {
  return feature.properties.markerType === 'waypoint'
    && feature.properties.icon === FOUND_PLACE_ICON
}
