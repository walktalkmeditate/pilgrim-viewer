import JSZip from 'jszip'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const DOWNLOADS = join(process.env.HOME!, 'Downloads')
const SAMPLES = join(import.meta.dirname, '..', 'samples')
mkdirSync(SAMPLES, { recursive: true })

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function epochSec(date: Date): number {
  return date.getTime() / 1000
}

function interpolate(
  start: [number, number, number],
  end: [number, number, number],
  steps: number,
): number[][] {
  const coords: number[][] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const lat = start[0] + (end[0] - start[0]) * t + (Math.random() - 0.5) * 0.0003
    const lon = start[1] + (end[1] - start[1]) * t + (Math.random() - 0.5) * 0.0003
    const ele = start[2] + (end[2] - start[2]) * t + (Math.random() - 0.5) * 2
    coords.push([lon, lat, Math.round(ele * 10) / 10])
  }
  return coords
}

function makeTimestamps(startDate: Date, count: number, intervalSec: number): number[] {
  const timestamps: number[] = []
  for (let i = 0; i < count; i++) {
    timestamps.push(epochSec(new Date(startDate.getTime() + i * intervalSec * 1000)))
  }
  return timestamps
}

interface RouteSpec {
  name: string
  waypoints: Array<{ lat: number; lon: number; ele: number }>
  pointsPerLeg: number
  startDate: Date
  intervalSec: number
}

function buildRoute(spec: RouteSpec) {
  let allCoords: number[][] = []
  for (let i = 0; i < spec.waypoints.length - 1; i++) {
    const start: [number, number, number] = [spec.waypoints[i].lat, spec.waypoints[i].lon, spec.waypoints[i].ele]
    const end: [number, number, number] = [spec.waypoints[i + 1].lat, spec.waypoints[i + 1].lon, spec.waypoints[i + 1].ele]
    const leg = interpolate(start, end, spec.pointsPerLeg)
    if (i > 0) leg.shift()
    allCoords = allCoords.concat(leg)
  }
  const timestamps = makeTimestamps(spec.startDate, allCoords.length, spec.intervalSec)
  return { coords: allCoords, timestamps }
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function totalDistance(coords: number[][]): number {
  let d = 0
  for (let i = 1; i < coords.length; i++) {
    d += haversine(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0])
  }
  return d
}

function elevationGain(coords: number[][]): { ascent: number; descent: number } {
  let ascent = 0
  let descent = 0
  for (let i = 1; i < coords.length; i++) {
    const diff = coords[i][2] - coords[i - 1][2]
    if (diff > 2) ascent += diff
    else if (diff < -2) descent += Math.abs(diff)
  }
  return { ascent, descent }
}

// ── GPX Generator ──

function generateGPX(name: string, coords: number[][], timestamps: number[]): string {
  const points = coords
    .map((c, i) => {
      const time = new Date(timestamps[i] * 1000).toISOString()
      return `      <trkpt lat="${c[1].toFixed(6)}" lon="${c[0].toFixed(6)}"><ele>${c[2]}</ele><time>${time}</time></trkpt>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Pilgrim Viewer Test Data" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${name}</name>
  </metadata>
  <trk>
    <name>${name}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>`
}

// ── Pilgrim Walk Generator ──

interface PilgrimWalkOpts {
  coords: number[][]
  timestamps: number[]
  startDate: Date
  intention?: string
  weather?: { temperature: number; condition: string; humidity?: number; windSpeed?: number }
  transcriptions?: Array<{ offsetMin: number; durationSec: number; text: string }>
  meditationOffsetMin?: number
  meditationDurationSec?: number
  reflection?: { style: string; text: string }
  celestial?: boolean
  favicon?: string
}

function buildPilgrimWalk(opts: PilgrimWalkOpts) {
  const id = uuid()
  const startEpoch = epochSec(opts.startDate)
  const durationSec = (opts.timestamps[opts.timestamps.length - 1] - opts.timestamps[0])
  const endEpoch = startEpoch + durationSec
  const dist = totalDistance(opts.coords)
  const { ascent, descent } = elevationGain(opts.coords)

  const meditationDuration = opts.meditationDurationSec ?? 0
  const talkDuration = (opts.transcriptions ?? []).reduce((s, t) => s + t.durationSec, 0)
  const pauseDuration = 60

  const activities: any[] = []
  if (opts.meditationOffsetMin != null && opts.meditationDurationSec) {
    activities.push({
      type: 'meditation',
      startDate: startEpoch + opts.meditationOffsetMin * 60,
      endDate: startEpoch + opts.meditationOffsetMin * 60 + opts.meditationDurationSec,
    })
  }

  const voiceRecordings = (opts.transcriptions ?? []).map((t) => ({
    startDate: startEpoch + t.offsetMin * 60,
    endDate: startEpoch + t.offsetMin * 60 + t.durationSec,
    duration: t.durationSec,
    transcription: t.text,
    wordsPerMinute: 120,
    isEnhanced: true,
  }))

  const route = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: opts.coords,
        },
        properties: {
          timestamps: opts.timestamps,
        },
      },
    ],
  }

  const walk: any = {
    schemaVersion: '1.0',
    id,
    type: 'walking',
    startDate: startEpoch,
    endDate: endEpoch,
    stats: {
      distance: Math.round(dist * 100) / 100,
      steps: Math.round(dist / 0.75),
      activeDuration: durationSec - pauseDuration,
      pauseDuration,
      ascent: Math.round(ascent * 10) / 10,
      descent: Math.round(descent * 10) / 10,
      burnedEnergy: Math.round(dist * 0.06),
      talkDuration,
      meditateDuration: meditationDuration,
    },
    weather: opts.weather ?? null,
    route,
    pauses: [
      {
        startDate: startEpoch + Math.round(durationSec / 2),
        endDate: startEpoch + Math.round(durationSec / 2) + pauseDuration,
        type: 'manual',
      },
    ],
    activities,
    voiceRecordings,
    intention: opts.intention ?? null,
    reflection: null,
    heartRates: [],
    workoutEvents: [],
    favicon: opts.favicon ?? null,
    isRace: false,
    isUserModified: false,
    finishedRecording: true,
  }

  if (opts.reflection) {
    walk.reflection = {
      style: opts.reflection.style,
      text: opts.reflection.text,
      celestialContext: opts.celestial
        ? {
            lunarPhase: { name: 'Waxing Gibbous', illumination: 0.82, age: 11.3, isWaxing: true },
            planetaryPositions: [
              { planet: 'sun', sign: 'pisces', degree: 27.5, isRetrograde: false },
              { planet: 'moon', sign: 'leo', degree: 14.2, isRetrograde: false },
              { planet: 'mercury', sign: 'pisces', degree: 12.8, isRetrograde: true },
              { planet: 'venus', sign: 'aries', degree: 8.1, isRetrograde: false },
              { planet: 'mars', sign: 'cancer', degree: 22.4, isRetrograde: false },
              { planet: 'jupiter', sign: 'gemini', degree: 15.7, isRetrograde: false },
              { planet: 'saturn', sign: 'pisces', degree: 21.3, isRetrograde: false },
            ],
            planetaryHour: { planet: 'venus', planetaryDay: 'mars' },
            elementBalance: { fire: 2, earth: 0, air: 1, water: 4, dominant: 'water' },
            seasonalMarker: 'springEquinox',
            zodiacSystem: 'tropical',
          }
        : null,
    }
  }

  return walk
}

async function buildPilgrimFile(walks: any[], filename: string) {
  const zip = new JSZip()

  zip.file(
    'manifest.json',
    JSON.stringify(
      {
        schemaVersion: '1.0',
        exportDate: epochSec(new Date()),
        appVersion: '1.0.0',
        walkCount: walks.length,
        preferences: {
          distanceUnit: 'km',
          altitudeUnit: 'm',
          speedUnit: 'min/km',
          energyUnit: 'kcal',
          celestialAwareness: true,
          zodiacSystem: 'tropical',
          beginWithIntention: true,
        },
        customPromptStyles: [],
        intentions: [],
        events: [],
      },
      null,
      2,
    ),
  )

  zip.file('schema.json', '{}')

  for (const walk of walks) {
    zip.file(`walks/${walk.id}.json`, JSON.stringify(walk, null, 2))
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  writeFileSync(join(DOWNLOADS, filename), buffer)
  writeFileSync(join(SAMPLES, filename), buffer)
  console.log(`Created ${filename} (${walks.length} walk${walks.length > 1 ? 's' : ''}, ${(buffer.length / 1024).toFixed(0)} KB)`)
}

// ── Multi-Day Pilgrimage Routes ──

// Kumano Kodo: 5-day Nakahechi route (Japan, March — spring)
const kumanoKodoDays: RouteSpec[] = [
  {
    name: 'Kumano Kodo Day 1 — Takijiri to Takahara',
    waypoints: [
      { lat: 33.8897, lon: 135.7656, ele: 80 },
      { lat: 33.8920, lon: 135.7690, ele: 220 },
      { lat: 33.8955, lon: 135.7710, ele: 450 },
      { lat: 33.8990, lon: 135.7740, ele: 530 },
      { lat: 33.9020, lon: 135.7770, ele: 420 },
    ],
    pointsPerLeg: 35,
    startDate: new Date('2026-03-15T06:30:00+09:00'),
    intervalSec: 18,
  },
  {
    name: 'Kumano Kodo Day 2 — Takahara to Chikatsuyu',
    waypoints: [
      { lat: 33.9020, lon: 135.7770, ele: 420 },
      { lat: 33.9055, lon: 135.7800, ele: 520 },
      { lat: 33.9080, lon: 135.7840, ele: 380 },
      { lat: 33.9110, lon: 135.7880, ele: 180 },
    ],
    pointsPerLeg: 40,
    startDate: new Date('2026-03-16T07:00:00+09:00'),
    intervalSec: 15,
  },
  {
    name: 'Kumano Kodo Day 3 — Chikatsuyu to Hongu',
    waypoints: [
      { lat: 33.9110, lon: 135.7880, ele: 180 },
      { lat: 33.9150, lon: 135.7920, ele: 350 },
      { lat: 33.9190, lon: 135.7960, ele: 600 },
      { lat: 33.9230, lon: 135.8010, ele: 480 },
      { lat: 33.9270, lon: 135.8060, ele: 250 },
      { lat: 33.8400, lon: 135.7730, ele: 70 },
    ],
    pointsPerLeg: 30,
    startDate: new Date('2026-03-17T06:00:00+09:00'),
    intervalSec: 20,
  },
  {
    name: 'Kumano Kodo Day 4 — Hongu to Koguchi',
    waypoints: [
      { lat: 33.8400, lon: 135.7730, ele: 70 },
      { lat: 33.8350, lon: 135.7900, ele: 300 },
      { lat: 33.8300, lon: 135.8100, ele: 550 },
      { lat: 33.8250, lon: 135.8250, ele: 380 },
      { lat: 33.8210, lon: 135.8400, ele: 120 },
    ],
    pointsPerLeg: 35,
    startDate: new Date('2026-03-18T06:30:00+09:00'),
    intervalSec: 16,
  },
  {
    name: 'Kumano Kodo Day 5 — Koguchi to Nachi',
    waypoints: [
      { lat: 33.8210, lon: 135.8400, ele: 120 },
      { lat: 33.8180, lon: 135.8550, ele: 450 },
      { lat: 33.8140, lon: 135.8700, ele: 600 },
      { lat: 33.8100, lon: 135.8850, ele: 320 },
      { lat: 33.6700, lon: 135.8900, ele: 130 },
    ],
    pointsPerLeg: 35,
    startDate: new Date('2026-03-19T06:00:00+09:00'),
    intervalSec: 18,
  },
]

// Camino de Santiago: Last 5 days into Santiago (Spain, October — autumn)
const caminoDays: RouteSpec[] = [
  {
    name: 'Camino Day 1 — Sarria to Portomarin',
    waypoints: [
      { lat: 42.7801, lon: -7.4148, ele: 450 },
      { lat: 42.7680, lon: -7.4350, ele: 520 },
      { lat: 42.7580, lon: -7.4700, ele: 430 },
      { lat: 42.7490, lon: -7.5150, ele: 390 },
    ],
    pointsPerLeg: 35,
    startDate: new Date('2026-10-01T07:00:00+02:00'),
    intervalSec: 18,
  },
  {
    name: 'Camino Day 2 — Portomarin to Palas de Rei',
    waypoints: [
      { lat: 42.7490, lon: -7.5150, ele: 390 },
      { lat: 42.7450, lon: -7.5400, ele: 520 },
      { lat: 42.7400, lon: -7.5700, ele: 580 },
      { lat: 42.7340, lon: -7.6100, ele: 560 },
    ],
    pointsPerLeg: 35,
    startDate: new Date('2026-10-02T07:30:00+02:00'),
    intervalSec: 16,
  },
  {
    name: 'Camino Day 3 — Palas de Rei to Arzua',
    waypoints: [
      { lat: 42.7340, lon: -7.6100, ele: 560 },
      { lat: 42.7450, lon: -7.6500, ele: 480 },
      { lat: 42.7600, lon: -7.7000, ele: 420 },
      { lat: 42.7720, lon: -7.7500, ele: 380 },
      { lat: 42.7780, lon: -7.8000, ele: 390 },
    ],
    pointsPerLeg: 30,
    startDate: new Date('2026-10-03T06:45:00+02:00'),
    intervalSec: 20,
  },
  {
    name: 'Camino Day 4 — Arzua to O Pedrouzo',
    waypoints: [
      { lat: 42.7780, lon: -7.8000, ele: 390 },
      { lat: 42.7850, lon: -7.8300, ele: 350 },
      { lat: 42.7920, lon: -7.8600, ele: 310 },
      { lat: 42.8000, lon: -7.9000, ele: 280 },
    ],
    pointsPerLeg: 30,
    startDate: new Date('2026-10-04T08:00:00+02:00'),
    intervalSec: 18,
  },
  {
    name: 'Camino Day 5 — O Pedrouzo to Santiago de Compostela',
    waypoints: [
      { lat: 42.8000, lon: -7.9000, ele: 280 },
      { lat: 42.8100, lon: -7.9400, ele: 350 },
      { lat: 42.8250, lon: -7.9800, ele: 380 },
      { lat: 42.8400, lon: -8.0200, ele: 320 },
      { lat: 42.8600, lon: -8.0600, ele: 300 },
      { lat: 42.8782, lon: -8.5445, ele: 260 },
    ],
    pointsPerLeg: 30,
    startDate: new Date('2026-10-05T06:00:00+02:00'),
    intervalSec: 22,
  },
]

// Shikoku 88: First 4 temples (Japan, May — spring)
const shikokuDays: RouteSpec[] = [
  {
    name: 'Shikoku Day 1 — Temple 1 Ryozenji to Temple 2 Gokurakuji',
    waypoints: [
      { lat: 34.1590, lon: 134.5050, ele: 15 },
      { lat: 34.1560, lon: 134.5010, ele: 20 },
      { lat: 34.1530, lon: 134.4960, ele: 25 },
      { lat: 34.1485, lon: 134.4905, ele: 12 },
    ],
    pointsPerLeg: 25,
    startDate: new Date('2026-05-01T08:00:00+09:00'),
    intervalSec: 12,
  },
  {
    name: 'Shikoku Day 2 — Temple 2 to Temple 5 Jizoji',
    waypoints: [
      { lat: 34.1485, lon: 134.4905, ele: 12 },
      { lat: 34.1450, lon: 134.4850, ele: 30 },
      { lat: 34.1400, lon: 134.4780, ele: 45 },
      { lat: 34.1350, lon: 134.4700, ele: 35 },
      { lat: 34.1300, lon: 134.4620, ele: 20 },
    ],
    pointsPerLeg: 25,
    startDate: new Date('2026-05-02T07:30:00+09:00'),
    intervalSec: 14,
  },
  {
    name: 'Shikoku Day 3 — Temple 5 to Temple 10 Kirihata-ji',
    waypoints: [
      { lat: 34.1300, lon: 134.4620, ele: 20 },
      { lat: 34.1200, lon: 134.4500, ele: 50 },
      { lat: 34.1050, lon: 134.4350, ele: 120 },
      { lat: 34.0900, lon: 134.4200, ele: 180 },
      { lat: 34.0750, lon: 134.4050, ele: 90 },
    ],
    pointsPerLeg: 30,
    startDate: new Date('2026-05-03T06:45:00+09:00'),
    intervalSec: 16,
  },
  {
    name: 'Shikoku Day 4 — Temple 10 to Temple 12 Shosanji',
    waypoints: [
      { lat: 34.0750, lon: 134.4050, ele: 90 },
      { lat: 34.0650, lon: 134.3900, ele: 250 },
      { lat: 34.0550, lon: 134.3750, ele: 500 },
      { lat: 34.0450, lon: 134.3600, ele: 700 },
    ],
    pointsPerLeg: 35,
    startDate: new Date('2026-05-04T06:00:00+09:00'),
    intervalSec: 18,
  },
]

// ── Per-Day Walk Content ──

interface DayContent {
  intention: string
  weather: { temperature: number; condition: string; humidity?: number; windSpeed?: number }
  transcriptions: Array<{ offsetMin: number; durationSec: number; text: string }>
  meditationOffsetMin: number
  meditationDurationSec: number
  reflection?: { style: string; text: string }
  celestial?: boolean
  favicon?: string
}

const kumanoContent: DayContent[] = [
  {
    intention: 'Walk the ancient path with an open heart',
    weather: { temperature: 12.5, condition: 'fog', humidity: 0.92, windSpeed: 0.5 },
    transcriptions: [
      { offsetMin: 8, durationSec: 55, text: 'The cedar trees here must be hundreds of years old. The path is so narrow, just moss-covered stones leading up through the forest. I can hear a stream somewhere below. Every few minutes there is a small stone marker with kanji I cannot read.' },
      { offsetMin: 30, durationSec: 40, text: 'There is a clearing here with a wooden bench. An old woman passed me going down. She bowed. I bowed. Neither of us spoke. That was enough.' },
    ],
    meditationOffsetMin: 20, meditationDurationSec: 600,
    reflection: { style: 'haiku', text: 'Ancient stones whisper\nMist rises through cedar dark\nOne step then the next' },
    celestial: true, favicon: 'leaf.fill',
  },
  {
    intention: 'Listen more than I speak today',
    weather: { temperature: 14.2, condition: 'partly_cloudy', humidity: 0.72, windSpeed: 2.1 },
    transcriptions: [
      { offsetMin: 15, durationSec: 70, text: 'Reached the first oji shrine. There is a small waterfall beside it, maybe three meters tall. The mist is rising through the trees and the light is coming in sideways through the canopy. I left a coin and rang the bell. The sound hung in the air longer than I expected.' },
      { offsetMin: 40, durationSec: 35, text: 'A Japanese man caught up to me. He has been walking the Kumano Kodo every spring for eleven years. He said the path changes every time because you change. I think about that.' },
    ],
    meditationOffsetMin: 25, meditationDurationSec: 900,
    celestial: true,
  },
  {
    intention: 'Arrive at the grand shrine with gratitude',
    weather: { temperature: 16.0, condition: 'clear', humidity: 0.55, windSpeed: 3.0 },
    transcriptions: [
      { offsetMin: 10, durationSec: 45, text: 'The longest day. Six hours to Hongu Taisha. The trail goes over a mountain pass at 600 meters. My legs remember yesterday but the forest does not care about my legs.' },
      { offsetMin: 50, durationSec: 60, text: 'I can see the torii gate from up here. The biggest torii in Japan, they say. It is standing in a river valley, black against green. Everything I have walked toward for three days is down there. I am not ready to arrive.' },
      { offsetMin: 70, durationSec: 40, text: 'Stood under the torii for a long time. An old woman handed me a cup of amazake. Sweet rice drink. She said nothing. I cried a little. I do not know why.' },
    ],
    meditationOffsetMin: 55, meditationDurationSec: 1200,
    reflection: { style: 'freeform', text: 'The grand shrine was smaller than I expected and larger than I can describe. Three days of walking compressed into a single bow. I understand now that the shrine was never the destination. The path was.' },
    celestial: true, favicon: 'flame.fill',
  },
  {
    intention: 'Walk without expectation',
    weather: { temperature: 13.8, condition: 'rain', humidity: 0.95, windSpeed: 4.2 },
    transcriptions: [
      { offsetMin: 12, durationSec: 50, text: 'Rain since dawn. The trail is a stream in places. My rain jacket is useless past the elbows. But the forest is alive in rain — the moss glows, the stones darken, everything smells of earth and time.' },
    ],
    meditationOffsetMin: 30, meditationDurationSec: 600,
    reflection: { style: 'haiku', text: 'Rain-soaked pilgrim walks\nEach puddle reflects the sky\nWet feet dry heart' },
    celestial: true,
  },
  {
    intention: 'Complete what I began',
    weather: { temperature: 15.5, condition: 'clear', humidity: 0.60, windSpeed: 1.8 },
    transcriptions: [
      { offsetMin: 20, durationSec: 55, text: 'The final pass. I can hear the Nachi waterfall from up here — 133 meters of falling water. The sound builds as I descend. By the time I reach the temple the roar is everywhere.' },
      { offsetMin: 45, durationSec: 70, text: 'Nachi Taisha. The pagoda stands in front of the waterfall. I have seen this image a hundred times in photographs. Standing here is nothing like the photographs. The water is so loud it fills your chest. Five days of walking end here. I am not the same person who started at Takijiri.' },
    ],
    meditationOffsetMin: 50, meditationDurationSec: 900,
    reflection: { style: 'freeform', text: 'Five days, three shrines, one waterfall. The Kumano Kodo is not a hike. It is a conversation between your feet and the earth, and by the end you have said things you did not know you needed to say.' },
    celestial: true, favicon: 'drop.fill',
  },
]

const caminoContent: DayContent[] = [
  {
    intention: 'Begin the last hundred kilometers with humility',
    weather: { temperature: 11.0, condition: 'fog', humidity: 0.88, windSpeed: 1.5 },
    transcriptions: [
      { offsetMin: 15, durationSec: 60, text: 'Sarria at dawn. The albergue was full of pilgrims who started here — the minimum distance for the Compostela certificate. You can tell the 100km pilgrims from the 800km pilgrims by their packs. And their eyes.' },
    ],
    meditationOffsetMin: 25, meditationDurationSec: 600,
    celestial: true, favicon: 'star.fill',
  },
  {
    intention: 'Walk with whoever appears',
    weather: { temperature: 14.5, condition: 'partly_cloudy', humidity: 0.65, windSpeed: 3.0 },
    transcriptions: [
      { offsetMin: 20, durationSec: 90, text: 'Met a Korean woman who has been walking for 30 days from Saint-Jean. She said the hardest part was not the distance, it was learning to be alone with her thoughts. We walked together in silence for a while after that.' },
      { offsetMin: 50, durationSec: 40, text: 'The yellow arrows are everywhere. On rocks, walls, tree trunks. Someone painted them decades ago and they just keep repainting them. The whole country is whispering the way.' },
    ],
    meditationOffsetMin: 35, meditationDurationSec: 900,
    reflection: { style: 'freeform', text: 'Walking in silence with a stranger is one of the most intimate things you can do. No words needed. Just two pairs of feet on the same ancient road.' },
    celestial: true,
  },
  {
    intention: 'Notice what I have been ignoring',
    weather: { temperature: 16.8, condition: 'clear', humidity: 0.55, windSpeed: 4.5 },
    transcriptions: [
      { offsetMin: 10, durationSec: 50, text: 'The Galician countryside is all eucalyptus and granite. Stone walls line every path. The walls are older than any country on this continent. Lichen grows on the lichen that grows on the lichen.' },
      { offsetMin: 40, durationSec: 45, text: 'A farmer offered me water from his well. Cold, sweet, tasting of stone. He asked where I was from. I said America. He said the Camino does not care where you are from. He is right.' },
    ],
    meditationOffsetMin: 50, meditationDurationSec: 600,
    celestial: true,
  },
  {
    intention: 'Release the need to arrive',
    weather: { temperature: 13.2, condition: 'overcast', humidity: 0.78, windSpeed: 5.0 },
    transcriptions: [
      { offsetMin: 25, durationSec: 55, text: 'Tomorrow I reach Santiago. I do not want tomorrow to come. Every pilgrim I have talked to says the same thing — the Camino ending is harder than the Camino walking.' },
    ],
    meditationOffsetMin: 30, meditationDurationSec: 1200,
    reflection: { style: 'freeform', text: 'I understand now why people walk the Camino. It is not about Santiago. It is about the person you become on the way there. Today I stopped trying to arrive anywhere.' },
    celestial: true,
  },
  {
    intention: 'Arrive',
    weather: { temperature: 12.0, condition: 'rain', humidity: 0.90, windSpeed: 2.5 },
    transcriptions: [
      { offsetMin: 15, durationSec: 80, text: 'Walking in the rain through the outskirts of Santiago. Past apartment blocks and roundabouts. The Camino does not give you a dramatic entrance. It makes you earn the last kilometers through suburbs and traffic lights.' },
      { offsetMin: 60, durationSec: 90, text: 'The cathedral. I am standing in the plaza in the rain and I cannot move. A nun is playing the bagpipes by the entrance. A German man next to me is sobbing. I put my hand on the stone wall and it is warm. Eight hundred years of pilgrims hands on this stone. Mine now among them.' },
    ],
    meditationOffsetMin: 70, meditationDurationSec: 900,
    reflection: { style: 'freeform', text: 'The botafumeiro swung across the cathedral nave, filling the air with incense. Six hundred kilometers of walking compressed into a single moment of smoke and light. I am done. I am not done. I will never be done. Buen Camino.' },
    celestial: true, favicon: 'building.columns.fill',
  },
]

const shikokuContent: DayContent[] = [
  {
    intention: 'Begin the circle of 88',
    weather: { temperature: 22.5, condition: 'clear', humidity: 0.60 },
    transcriptions: [
      { offsetMin: 3, durationSec: 55, text: 'Temple 1, Ryozenji. I bought the white vest, the sedge hat, and the walking staff. The priest stamped my book with red ink. Namu Daishi Henjo Kongo. I do not know what it means yet but I will say it at every temple, 88 times, until I do.' },
    ],
    meditationOffsetMin: 8, meditationDurationSec: 420,
    reflection: { style: 'freeform', text: 'This is day one of 1,200 kilometers. The distance is meaningless. What matters is that I began.' },
    celestial: true, favicon: 'figure.walk',
  },
  {
    intention: 'Walk with Kobo Daishi',
    weather: { temperature: 24.0, condition: 'partly_cloudy', humidity: 0.55 },
    transcriptions: [
      { offsetMin: 10, durationSec: 40, text: 'The path follows a small canal through rice paddies. Everything is so green it almost hurts. An old man on a bicycle nodded and said ganbatte — keep going.' },
      { offsetMin: 25, durationSec: 50, text: 'Temple 3, Konsenji. A woman in white was prostrating herself at every step toward the main hall. Full body on the ground, stand up, one step, prostrate again. Her devotion made me ashamed of how casually I had been walking.' },
    ],
    meditationOffsetMin: 20, meditationDurationSec: 600,
    celestial: true,
  },
  {
    intention: 'Accept difficulty as teaching',
    weather: { temperature: 20.0, condition: 'rain', humidity: 0.85, windSpeed: 3.5 },
    transcriptions: [
      { offsetMin: 15, durationSec: 65, text: 'Five temples today. My feet are blistered. The path climbed to 180 meters through bamboo forest. In the rain the bamboo sounds like a thousand whispered conversations. I stopped to listen and forgot I was in pain.' },
    ],
    meditationOffsetMin: 30, meditationDurationSec: 900,
    reflection: { style: 'haiku', text: 'Bamboo bends in rain\nWet henro stumbles upward\nTemple bell ahead' },
    celestial: true,
  },
  {
    intention: 'Climb the burning mountain',
    weather: { temperature: 18.0, condition: 'clear', humidity: 0.50, windSpeed: 6.0 },
    transcriptions: [
      { offsetMin: 20, durationSec: 70, text: 'Temple 12, Shosanji. The mountain temple. 700 meters straight up. The guidebook said four hours. It took me five. The last hour was just putting one foot above the other, grabbing tree roots, breathing. At the top, clouds below me. The temple floats above the world.' },
      { offsetMin: 50, durationSec: 45, text: 'The priest at Shosanji asked if I was walking alone. I said yes. He said no one walks the henro alone. Kobo Daishi walks with every pilgrim. Dogyo ninin. Two traveling together.' },
    ],
    meditationOffsetMin: 55, meditationDurationSec: 1200,
    reflection: { style: 'freeform', text: 'Four days, twelve temples, one mountain. My body is breaking and my mind is quieting. I think that is the trade the Shikoku pilgrimage offers. You give it your comfort. It gives you stillness.' },
    celestial: true, favicon: 'mountain.2.fill',
  },
]

// ── Generate Files ──

async function main() {
  // GPX file — Kumano Kodo full route (all days merged into one track, shows route but no rich data)
  const allKumanoCoords: number[][] = []
  const allKumanoTimestamps: number[] = []
  for (const day of kumanoKodoDays) {
    const route = buildRoute(day)
    if (allKumanoCoords.length > 0) { route.coords.shift(); route.timestamps.shift() }
    allKumanoCoords.push(...route.coords)
    allKumanoTimestamps.push(...route.timestamps)
  }
  const kumanoGpx = generateGPX('Kumano Kodo — Nakahechi Route', allKumanoCoords, allKumanoTimestamps)
  writeFileSync(join(DOWNLOADS, 'kumano-kodo.gpx'), kumanoGpx)
  writeFileSync(join(SAMPLES, 'kumano-kodo.gpx'), kumanoGpx)
  console.log('Created kumano-kodo.gpx (full route, 1 track)')

  // Pilgrim file — Kumano Kodo 5-day journey
  const kumanoWalks: any[] = []
  for (let i = 0; i < kumanoKodoDays.length; i++) {
    const route = buildRoute(kumanoKodoDays[i])
    kumanoWalks.push(buildPilgrimWalk({ coords: route.coords, timestamps: route.timestamps, startDate: kumanoKodoDays[i].startDate, ...kumanoContent[i] }))
  }
  await buildPilgrimFile(kumanoWalks, 'kumano-kodo.pilgrim')

  // Pilgrim file — Camino last 5 days
  const caminoWalks: any[] = []
  for (let i = 0; i < caminoDays.length; i++) {
    const route = buildRoute(caminoDays[i])
    caminoWalks.push(buildPilgrimWalk({ coords: route.coords, timestamps: route.timestamps, startDate: caminoDays[i].startDate, ...caminoContent[i] }))
  }
  await buildPilgrimFile(caminoWalks, 'camino-santiago.pilgrim')

  // Pilgrim file — Shikoku first 4 days
  const shikokuWalks: any[] = []
  for (let i = 0; i < shikokuDays.length; i++) {
    const route = buildRoute(shikokuDays[i])
    shikokuWalks.push(buildPilgrimWalk({ coords: route.coords, timestamps: route.timestamps, startDate: shikokuDays[i].startDate, ...shikokuContent[i] }))
  }
  await buildPilgrimFile(shikokuWalks, 'shikoku-88.pilgrim')

  console.log('\nAll files created in ~/Downloads/ and samples/')
}

main().catch(console.error)
