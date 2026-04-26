import type { Walk, WalkStats, GeoJSONFeatureCollection } from '../parsers/types'
import { totalDistance, elevationGain } from '../parsers/geo'

function routeDistance(route: GeoJSONFeatureCollection): number {
  let sum = 0
  for (const f of route.features) {
    if (f.geometry.type !== 'LineString') continue
    sum += totalDistance(f.geometry.coordinates as number[][])
  }
  return sum
}

function routeElevation(route: GeoJSONFeatureCollection): { ascent: number; descent: number } {
  let ascent = 0
  let descent = 0
  for (const f of route.features) {
    if (f.geometry.type !== 'LineString') continue
    const coords = f.geometry.coordinates as number[][]
    const elevations = coords
      .map(c => c[2])
      .filter((e): e is number => typeof e === 'number')
    if (elevations.length < 2) continue
    const seg = elevationGain(elevations)
    ascent += seg.ascent
    descent += seg.descent
  }
  return { ascent, descent }
}

function sumDurationSeconds(items: { startDate: Date; endDate: Date }[]): number {
  let sum = 0
  for (const it of items) {
    sum += (it.endDate.getTime() - it.startDate.getTime()) / 1000
  }
  return Math.round(sum)
}

export function recomputeStats(walk: Walk, original: WalkStats): WalkStats {
  const totalSeconds = Math.round((walk.endDate.getTime() - walk.startDate.getTime()) / 1000)
  const distance = routeDistance(walk.route)
  const { ascent, descent } = routeElevation(walk.route)
  const pauseDuration = sumDurationSeconds(walk.pauses)
  const activeDuration = Math.max(0, totalSeconds - pauseDuration)
  const talkDuration = sumDurationSeconds(walk.activities.filter(a => a.type === 'talk'))
  const meditateDuration = sumDurationSeconds(walk.activities.filter(a => a.type === 'meditate'))

  const distRatio = original.distance > 0 ? distance / original.distance : 1
  const steps = original.steps !== undefined ? Math.round(original.steps * distRatio) : undefined
  const burnedEnergy = original.burnedEnergy !== undefined
    ? Math.round(original.burnedEnergy * distRatio)
    : undefined

  return {
    distance,
    activeDuration,
    pauseDuration,
    ascent,
    descent,
    steps,
    burnedEnergy,
    talkDuration,
    meditateDuration,
  }
}
