import { XMLParser } from 'fast-xml-parser'
import type { Walk, WalkStats, GeoJSONFeatureCollection, GeoJSONFeature } from './types'
import { totalDistance, elevationGain } from './geo'

interface RawTrackPoint {
  '@_lat': string | number
  '@_lon': string | number
  ele?: number
  time?: string
}

interface RawTrackSegment {
  trkpt: RawTrackPoint | RawTrackPoint[]
}

interface RawTrack {
  name?: string
  trkseg: RawTrackSegment | RawTrackSegment[]
}

interface ParsedGPX {
  gpx: {
    trk: RawTrack | RawTrack[]
  }
}

function toArray<T>(value: T | T[]): T[] {
  if (Array.isArray(value)) return value
  return [value]
}

function generateId(trackName: string | undefined, startTimestamp: number): string {
  const name = trackName ?? 'gpx-track'
  return `${name.replace(/\s+/g, '-').toLowerCase()}-${startTimestamp}`
}

function buildRouteFeatureCollection(
  coordinates: number[][],
  timestamps: number[]
): GeoJSONFeatureCollection {
  const feature: GeoJSONFeature = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates,
    },
    properties: {
      timestamps,
    },
  }
  return {
    type: 'FeatureCollection',
    features: [feature],
  }
}

function buildStats(
  coordinates: number[][],
  elevations: number[],
  startMs: number,
  endMs: number
): WalkStats {
  const distance = totalDistance(coordinates)
  const { ascent, descent } = elevationGain(elevations)
  const activeDuration = Math.round((endMs - startMs) / 1000)

  return {
    distance,
    activeDuration,
    pauseDuration: 0,
    ascent,
    descent,
    talkDuration: 0,
    meditateDuration: 0,
  }
}

function extractTrackPoints(track: RawTrack): RawTrackPoint[] {
  const segments = toArray(track.trkseg)
  const points: RawTrackPoint[] = []
  for (const seg of segments) {
    if (seg.trkpt) {
      points.push(...toArray(seg.trkpt))
    }
  }
  return points
}

export function parseGPX(xmlString: string): Walk[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
  })

  const parsed = parser.parse(xmlString) as ParsedGPX

  if (!parsed.gpx?.trk) {
    throw new Error('No trackpoints found in GPX file')
  }

  const tracks = toArray(parsed.gpx.trk)
  const walks: Walk[] = []

  for (const track of tracks) {
    const points = extractTrackPoints(track)

    if (points.length === 0) {
      throw new Error('No trackpoints found in GPX file')
    }

    const coordinates: number[][] = []
    const timestamps: number[] = []
    const elevations: number[] = []

    for (const pt of points) {
      const lat = Number(pt['@_lat'])
      const lon = Number(pt['@_lon'])
      const ele = pt.ele ?? 0
      coordinates.push([lon, lat, ele])
      elevations.push(ele)

      if (pt.time) {
        timestamps.push(new Date(pt.time).getTime())
      }
    }

    const now = Date.now()
    const startMs = timestamps[0] ?? now
    const endMs = timestamps[timestamps.length - 1] ?? now

    const stats = buildStats(coordinates, elevations, startMs, endMs)
    const route = buildRouteFeatureCollection(coordinates, timestamps)
    const id = generateId(track.name, startMs)

    walks.push({
      id,
      startDate: new Date(startMs),
      endDate: new Date(endMs),
      stats,
      route,
      voiceRecordings: [],
      activities: [],
      pauses: [],
      source: 'gpx',
    })
  }

  return walks
}
