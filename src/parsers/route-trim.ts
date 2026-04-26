import { haversineDistance } from './geo'
import type { GeoJSONFeatureCollection } from './types'

export function trimRouteEnds(
  route: GeoJSONFeatureCollection,
  meters: number,
): GeoJSONFeatureCollection {
  if (meters <= 0) return route

  return {
    ...route,
    features: route.features.map((feature) => {
      if (feature.geometry.type !== 'LineString') return feature

      const coords = feature.geometry.coordinates as number[][]
      if (coords.length < 3) return feature

      const endTrimmed = trimFromEnd(coords, meters)
      const startTrimIdx = findStartTrimIndex(endTrimmed, meters)
      const trimmedCoords = endTrimmed.slice(startTrimIdx)

      if (trimmedCoords.length < 2) return feature

      const timestamps = feature.properties.timestamps

      return {
        ...feature,
        geometry: { ...feature.geometry, coordinates: trimmedCoords },
        properties: {
          ...feature.properties,
          timestamps: timestamps
            ? timestamps.slice(startTrimIdx, startTrimIdx + trimmedCoords.length)
            : undefined,
        },
      }
    }),
  }
}

function findStartTrimIndex(coords: number[][], meters: number): number {
  let accumulated = 0
  for (let i = 1; i < coords.length; i++) {
    accumulated += haversineDistance(
      coords[i - 1][1], coords[i - 1][0],
      coords[i][1], coords[i][0]
    )
    if (accumulated >= meters) return i
  }
  return 0
}

function trimFromEnd(coords: number[][], meters: number): number[][] {
  let accumulated = 0
  for (let i = coords.length - 1; i > 0; i--) {
    accumulated += haversineDistance(
      coords[i][1], coords[i][0],
      coords[i - 1][1], coords[i - 1][0]
    )
    if (accumulated >= meters) return coords.slice(0, i)
  }
  return coords
}

export function trimRouteSeparately(
  route: GeoJSONFeatureCollection,
  opts: { startMeters: number; endMeters: number },
): GeoJSONFeatureCollection {
  const { startMeters, endMeters } = opts
  if (startMeters <= 0 && endMeters <= 0) return route

  return {
    ...route,
    features: route.features.map((feature) => {
      if (feature.geometry.type !== 'LineString') return feature

      const coords = feature.geometry.coordinates as number[][]
      if (coords.length < 3) return feature

      let endIdx = coords.length
      if (endMeters > 0) {
        let acc = 0
        for (let i = coords.length - 1; i > 0; i--) {
          acc += haversineDistance(coords[i][1], coords[i][0], coords[i - 1][1], coords[i - 1][0])
          if (acc >= endMeters) { endIdx = i; break }
          if (i === 1) endIdx = 1
        }
      }

      let startIdx = 0
      if (startMeters > 0) {
        let acc = 0
        for (let i = 1; i < endIdx; i++) {
          acc += haversineDistance(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0])
          if (acc >= startMeters) { startIdx = i; break }
        }
      }

      if (endIdx - startIdx < 2) {
        const clampedEnd = Math.min(coords.length, startIdx + 2)
        endIdx = clampedEnd
        if (endIdx - startIdx < 2) {
          startIdx = Math.max(0, endIdx - 2)
        }
      }

      const trimmedCoords = coords.slice(startIdx, endIdx)
      const timestamps = feature.properties.timestamps

      return {
        ...feature,
        geometry: { ...feature.geometry, coordinates: trimmedCoords },
        properties: {
          ...feature.properties,
          timestamps: timestamps ? timestamps.slice(startIdx, endIdx) : undefined,
        },
      }
    }),
  }
}
