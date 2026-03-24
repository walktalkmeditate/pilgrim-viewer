import JSZip from 'jszip'
import type {
  Walk,
  WalkStats,
  Weather,
  Reflection,
  VoiceRecording,
  Activity,
  Pause,
  CelestialContext,
  GeoJSONFeatureCollection,
  PilgrimManifest,
} from './types'

interface Interval {
  start: number
  end: number
}

interface RawActivity {
  type: string
  startDate: number | Date
  endDate: number | Date
}

interface RawVoiceRecording {
  startDate: number | Date
  endDate: number | Date
  duration: number
  transcription?: string
  wordsPerMinute?: number
  isEnhanced?: boolean
}

interface RawPause {
  startDate: number | Date
  endDate: number | Date
  type: string
}

function epochToDate(epoch: number | Date): Date {
  if (epoch instanceof Date) return epoch
  return new Date(epoch * 1000)
}

function convertRouteTimestamps(route: GeoJSONFeatureCollection): GeoJSONFeatureCollection {
  return {
    ...route,
    features: route.features.map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        timestamps: f.properties.timestamps
          ? f.properties.timestamps.map((t) => t * 1000)
          : undefined,
      },
    })),
  }
}

function mergeOverlappingIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return []

  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  const merged: Interval[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const last = merged[merged.length - 1]

    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end)
    } else {
      merged.push(current)
    }
  }

  return merged
}

function subtractIntervals(totalStart: number, totalEnd: number, occupied: Interval[]): Interval[] {
  const gaps: Interval[] = []
  let cursor = totalStart

  for (const interval of occupied) {
    if (interval.start > cursor) {
      gaps.push({ start: cursor, end: interval.start })
    }
    cursor = Math.max(cursor, interval.end)
  }

  if (cursor < totalEnd) {
    gaps.push({ start: cursor, end: totalEnd })
  }

  return gaps
}

export function deriveActivities(
  startDate: Date,
  endDate: Date,
  rawActivities: RawActivity[],
  voiceRecordings: RawVoiceRecording[],
  pauses: RawPause[]
): Activity[] {
  const startMs = startDate.getTime()
  const endMs = endDate.getTime()

  const meditationIntervals: Interval[] = rawActivities
    .filter(a => a.type === 'meditation')
    .map(a => ({
      start: epochToDate(a.startDate).getTime(),
      end: epochToDate(a.endDate).getTime(),
    }))

  const talkIntervals: Interval[] = mergeOverlappingIntervals(
    voiceRecordings.map(vr => ({
      start: epochToDate(vr.startDate).getTime(),
      end: epochToDate(vr.endDate).getTime(),
    }))
  )

  const pauseIntervals: Interval[] = pauses.map(p => ({
    start: epochToDate(p.startDate).getTime(),
    end: epochToDate(p.endDate).getTime(),
  }))

  const talkWithoutMeditation: Interval[] = []
  for (const talk of talkIntervals) {
    let segments: Interval[] = [talk]
    for (const med of meditationIntervals) {
      const next: Interval[] = []
      for (const seg of segments) {
        if (med.start >= seg.end || med.end <= seg.start) {
          next.push(seg)
        } else {
          if (seg.start < med.start) {
            next.push({ start: seg.start, end: med.start })
          }
          if (seg.end > med.end) {
            next.push({ start: med.end, end: seg.end })
          }
        }
      }
      segments = next
    }
    talkWithoutMeditation.push(...segments)
  }

  const allOccupied = mergeOverlappingIntervals([
    ...meditationIntervals,
    ...talkWithoutMeditation,
    ...pauseIntervals,
  ])

  const walkIntervals = subtractIntervals(startMs, endMs, allOccupied)

  const activities: Activity[] = []

  for (const interval of meditationIntervals) {
    activities.push({
      type: 'meditate',
      startDate: new Date(interval.start),
      endDate: new Date(interval.end),
    })
  }

  for (const interval of talkWithoutMeditation) {
    activities.push({
      type: 'talk',
      startDate: new Date(interval.start),
      endDate: new Date(interval.end),
    })
  }

  for (const interval of walkIntervals) {
    activities.push({
      type: 'walk',
      startDate: new Date(interval.start),
      endDate: new Date(interval.end),
    })
  }

  activities.sort((a, b) => a.startDate.getTime() - b.startDate.getTime())

  return activities
}

function parseStats(raw: Record<string, unknown>): WalkStats {
  return {
    distance: raw.distance as number,
    activeDuration: raw.activeDuration as number,
    pauseDuration: raw.pauseDuration as number,
    ascent: raw.ascent as number,
    descent: raw.descent as number,
    steps: raw.steps as number | undefined,
    burnedEnergy: raw.burnedEnergy as number | undefined,
    talkDuration: raw.talkDuration as number,
    meditateDuration: raw.meditateDuration as number,
  }
}

function parseWeather(raw: Record<string, unknown> | undefined): Weather | undefined {
  if (!raw) return undefined
  return {
    temperature: raw.temperature as number,
    condition: raw.condition as string,
    humidity: raw.humidity as number | undefined,
    windSpeed: raw.windSpeed as number | undefined,
  }
}

function parseReflection(
  raw: Record<string, unknown> | undefined
): { reflection?: Reflection; celestial?: CelestialContext } {
  if (!raw) return {}

  const { celestialContext, ...rest } = raw as Record<string, unknown> & { celestialContext?: CelestialContext }

  const reflection: Reflection = {
    style: rest.style as string | undefined,
    text: rest.text as string | undefined,
  }

  const hasContent = reflection.style !== undefined || reflection.text !== undefined
  return {
    reflection: hasContent ? reflection : undefined,
    celestial: celestialContext as CelestialContext | undefined,
  }
}

function parseVoiceRecordings(raw: RawVoiceRecording[]): VoiceRecording[] {
  return raw.map(vr => ({
    startDate: epochToDate(vr.startDate),
    endDate: epochToDate(vr.endDate),
    duration: vr.duration,
    transcription: vr.transcription,
    wordsPerMinute: vr.wordsPerMinute,
    isEnhanced: vr.isEnhanced,
  }))
}

function parsePauses(raw: RawPause[]): Pause[] {
  return raw.map(p => ({
    startDate: epochToDate(p.startDate),
    endDate: epochToDate(p.endDate),
    type: p.type,
  }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsePilgrimWalkJSON(raw: any): Walk {
  const startDate = epochToDate(raw.startDate)
  const endDate = epochToDate(raw.endDate)
  const voiceRecordings = parseVoiceRecordings(raw.voiceRecordings ?? [])
  const pauses = parsePauses(raw.pauses ?? [])
  const rawActivities = (raw.activities ?? []) as RawActivity[]

  const { reflection, celestial } = parseReflection(raw.reflection)

  const activities = deriveActivities(
    startDate,
    endDate,
    rawActivities,
    raw.voiceRecordings ?? [],
    raw.pauses ?? []
  )

  const walk: Walk = {
    id: raw.id,
    startDate,
    endDate,
    stats: parseStats(raw.stats),
    route: convertRouteTimestamps(raw.route as GeoJSONFeatureCollection),
    voiceRecordings,
    activities,
    pauses,
    source: 'pilgrim',
  }

  if (raw.weather) walk.weather = parseWeather(raw.weather)
  if (raw.intention) walk.intention = raw.intention
  if (reflection) walk.reflection = reflection
  if (celestial) walk.celestial = celestial
  if (raw.favicon) walk.favicon = raw.favicon

  return walk
}

export async function parsePilgrim(
  buffer: ArrayBuffer
): Promise<{ manifest: PilgrimManifest; walks: Walk[] }> {
  let zip: JSZip

  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new Error('Failed to parse ZIP: invalid .pilgrim file')
  }

  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) {
    throw new Error('Failed to parse .pilgrim file: missing manifest.json')
  }

  const manifestText = await manifestFile.async('text')
  const manifestRaw = JSON.parse(manifestText)
  const manifest: PilgrimManifest = {
    schemaVersion: manifestRaw.schemaVersion,
    exportDate: manifestRaw.exportDate,
    appVersion: manifestRaw.appVersion,
    walkCount: manifestRaw.walkCount,
    preferences: {
      distanceUnit: manifestRaw.preferences.distanceUnit,
      altitudeUnit: manifestRaw.preferences.altitudeUnit,
      speedUnit: manifestRaw.preferences.speedUnit,
      energyUnit: manifestRaw.preferences.energyUnit,
    },
  }

  const walkFiles = zip.file(/^walks\/.*\.json$/)
  const walks: Walk[] = []

  for (const file of walkFiles) {
    const text = await file.async('text')
    const walkRaw = JSON.parse(text)
    walks.push(parsePilgrimWalkJSON(walkRaw))
  }

  walks.sort((a, b) => a.startDate.getTime() - b.startDate.getTime())

  return { manifest, walks }
}
