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

// ── Route Data ──

// Kumano Kodo: Takijiri-oji to Chikatsuyu (Japan)
const kumanoKodo: RouteSpec = {
  name: 'Kumano Kodo — Takijiri to Chikatsuyu',
  waypoints: [
    { lat: 33.8897, lon: 135.7656, ele: 80 },
    { lat: 33.8920, lon: 135.7690, ele: 220 },
    { lat: 33.8955, lon: 135.7710, ele: 450 },
    { lat: 33.8980, lon: 135.7740, ele: 380 },
    { lat: 33.9010, lon: 135.7800, ele: 520 },
    { lat: 33.9050, lon: 135.7850, ele: 350 },
    { lat: 33.9085, lon: 135.7880, ele: 180 },
  ],
  pointsPerLeg: 40,
  startDate: new Date('2026-03-15T06:30:00+09:00'),
  intervalSec: 15,
}

// Camino de Santiago: Sarria to Portomarin (Spain)
const caminoSarria: RouteSpec = {
  name: 'Camino de Santiago — Sarria to Portomarin',
  waypoints: [
    { lat: 42.7801, lon: -7.4148, ele: 450 },
    { lat: 42.7750, lon: -7.4200, ele: 480 },
    { lat: 42.7680, lon: -7.4350, ele: 520 },
    { lat: 42.7620, lon: -7.4500, ele: 490 },
    { lat: 42.7580, lon: -7.4700, ele: 430 },
    { lat: 42.7530, lon: -7.4900, ele: 380 },
    { lat: 42.7510, lon: -7.5050, ele: 350 },
    { lat: 42.7490, lon: -7.5150, ele: 390 },
  ],
  pointsPerLeg: 35,
  startDate: new Date('2026-04-22T07:00:00+02:00'),
  intervalSec: 18,
}

// Shikoku Pilgrimage: Temple 1 (Ryozenji) to Temple 2 (Gokurakuji) (Japan)
const shikoku: RouteSpec = {
  name: 'Shikoku 88 — Temple 1 to Temple 2',
  waypoints: [
    { lat: 34.1590, lon: 134.5050, ele: 15 },
    { lat: 34.1570, lon: 134.5020, ele: 20 },
    { lat: 34.1540, lon: 134.4980, ele: 25 },
    { lat: 34.1510, lon: 134.4940, ele: 18 },
    { lat: 34.1485, lon: 134.4905, ele: 12 },
  ],
  pointsPerLeg: 25,
  startDate: new Date('2026-05-01T08:00:00+09:00'),
  intervalSec: 12,
}

// Via Francigena: San Miniato to Gambassi Terme (Italy)
const viaFrancigena: RouteSpec = {
  name: 'Via Francigena — San Miniato to Gambassi Terme',
  waypoints: [
    { lat: 43.6827, lon: 10.8500, ele: 140 },
    { lat: 43.6750, lon: 10.8400, ele: 180 },
    { lat: 43.6650, lon: 10.8250, ele: 250 },
    { lat: 43.6550, lon: 10.8100, ele: 320 },
    { lat: 43.6420, lon: 10.7900, ele: 280 },
    { lat: 43.6300, lon: 10.7750, ele: 200 },
    { lat: 43.6180, lon: 10.7580, ele: 340 },
    { lat: 43.6050, lon: 10.7400, ele: 290 },
    { lat: 43.5930, lon: 10.7250, ele: 330 },
  ],
  pointsPerLeg: 30,
  startDate: new Date('2026-06-10T06:00:00+02:00'),
  intervalSec: 20,
}

// Pilgrim's Way: Canterbury section (England)
const pilgrimsWay: RouteSpec = {
  name: "Pilgrim's Way — Canterbury Approach",
  waypoints: [
    { lat: 51.2600, lon: 1.0200, ele: 50 },
    { lat: 51.2650, lon: 1.0350, ele: 45 },
    { lat: 51.2700, lon: 1.0500, ele: 35 },
    { lat: 51.2740, lon: 1.0650, ele: 25 },
    { lat: 51.2780, lon: 1.0800, ele: 15 },
  ],
  pointsPerLeg: 30,
  startDate: new Date('2026-09-20T09:00:00+01:00'),
  intervalSec: 15,
}

// ── Generate Files ──

async function main() {
  // GPX files (simple route data)
  const kumanoRoute = buildRoute(kumanoKodo)
  const kumanoGpx = generateGPX(kumanoKodo.name, kumanoRoute.coords, kumanoRoute.timestamps)
  writeFileSync(join(DOWNLOADS, 'kumano-kodo-takijiri.gpx'), kumanoGpx)
  writeFileSync(join(SAMPLES, 'kumano-kodo-takijiri.gpx'), kumanoGpx)
  console.log('Created kumano-kodo-takijiri.gpx')

  const francigenaRoute = buildRoute(viaFrancigena)
  const francigenaGpx = generateGPX(viaFrancigena.name, francigenaRoute.coords, francigenaRoute.timestamps)
  writeFileSync(join(DOWNLOADS, 'via-francigena-san-miniato.gpx'), francigenaGpx)
  writeFileSync(join(SAMPLES, 'via-francigena-san-miniato.gpx'), francigenaGpx)
  console.log('Created via-francigena-san-miniato.gpx')

  const pilgrimsRoute = buildRoute(pilgrimsWay)
  const pilgrimsGpx = generateGPX(pilgrimsWay.name, pilgrimsRoute.coords, pilgrimsRoute.timestamps)
  writeFileSync(join(DOWNLOADS, 'pilgrims-way-canterbury.gpx'), pilgrimsGpx)
  writeFileSync(join(SAMPLES, 'pilgrims-way-canterbury.gpx'), pilgrimsGpx)
  console.log('Created pilgrims-way-canterbury.gpx')

  // Pilgrim files (rich data)

  // 1. Kumano Kodo — single walk with full data
  const kumanoWalk = buildPilgrimWalk({
    coords: kumanoRoute.coords,
    timestamps: kumanoRoute.timestamps,
    startDate: kumanoKodo.startDate,
    intention: 'Walk the ancient path with an open heart',
    weather: { temperature: 14.2, condition: 'partly_cloudy', humidity: 0.72, windSpeed: 2.1 },
    transcriptions: [
      {
        offsetMin: 8,
        durationSec: 55,
        text: 'The cedar trees here must be hundreds of years old. The path is so narrow, just moss-covered stones leading up through the forest. I can hear a stream somewhere below. Every few minutes there is a small stone marker with kanji I cannot read.',
      },
      {
        offsetMin: 22,
        durationSec: 40,
        text: 'There is a clearing here with a wooden bench. An old woman passed me going down. She bowed. I bowed. Neither of us spoke. That was enough.',
      },
      {
        offsetMin: 38,
        durationSec: 70,
        text: "Reached the first oji shrine. There is a small waterfall beside it, maybe three meters tall. The mist is rising through the trees and the light is coming in sideways through the canopy. I left a coin and rang the bell. The sound hung in the air longer than I expected. This is the most beautiful morning I have had on any trail, anywhere.",
      },
      {
        offsetMin: 52,
        durationSec: 35,
        text: 'A Japanese man caught up to me. He has been walking the Kumano Kodo every spring for eleven years. He said the path changes every time because you change. I think about that.',
      },
      {
        offsetMin: 62,
        durationSec: 30,
        text: 'The descent is steep. My knees are feeling it. But the valley below is glowing in the morning light and I can see Chikatsuyu village. Smoke rising from someone cooking breakfast.',
      },
    ],
    meditationOffsetMin: 30,
    meditationDurationSec: 900,
    reflection: {
      style: 'haiku',
      text: 'Ancient stones whisper\nMist rises through cedar dark\nOne step then the next',
    },
    celestial: true,
    favicon: 'leaf.fill',
  })
  await buildPilgrimFile([kumanoWalk], 'kumano-kodo.pilgrim')

  // 2. Camino — single walk
  const caminoRoute = buildRoute(caminoSarria)
  const caminoWalk = buildPilgrimWalk({
    coords: caminoRoute.coords,
    timestamps: caminoRoute.timestamps,
    startDate: caminoSarria.startDate,
    intention: 'Each step a prayer, each breath a thanksgiving',
    weather: { temperature: 16.8, condition: 'clear', humidity: 0.55, windSpeed: 4.5 },
    transcriptions: [
      {
        offsetMin: 20,
        durationSec: 90,
        text: "Met a Korean woman who's been walking for 30 days from Saint-Jean. She said the hardest part wasn't the distance, it was learning to be alone with her thoughts. We walked together in silence for a while after that.",
      },
      {
        offsetMin: 45,
        durationSec: 40,
        text: 'The yellow arrows are everywhere. On rocks, walls, tree trunks. Someone painted them decades ago and they just keep repainting them. The whole country is whispering the way.',
      },
    ],
    meditationOffsetMin: 60,
    meditationDurationSec: 900,
    reflection: {
      style: 'freeform',
      text: "I understand now why people walk the Camino. It's not about Santiago. It's about the person you become on the way there. Today I stopped trying to arrive anywhere.",
    },
    celestial: true,
    favicon: 'star.fill',
  })
  await buildPilgrimFile([caminoWalk], 'camino-sarria.pilgrim')

  // 3. Multi-walk .pilgrim: Shikoku + Canterbury (two walks in one export)
  const shikokuRoute = buildRoute(shikoku)
  const shikokuWalk = buildPilgrimWalk({
    coords: shikokuRoute.coords,
    timestamps: shikokuRoute.timestamps,
    startDate: shikoku.startDate,
    intention: 'Begin the circle of 88',
    weather: { temperature: 22.5, condition: 'clear', humidity: 0.60 },
    transcriptions: [
      {
        offsetMin: 3,
        durationSec: 55,
        text: "Temple 1, Ryozenji. I bought the white vest, the sedge hat, and the walking staff. The priest stamped my book with red ink. Namu Daishi Henjo Kongo. I do not know what it means yet but I will say it at every temple, 88 times, until I do.",
      },
      {
        offsetMin: 12,
        durationSec: 40,
        text: "Walking between the first two temples. It is flat rice paddy country. The path follows a small canal. Everything is so green it almost hurts. An old man on a bicycle nodded and said something. I think it was 'ganbatte' — keep going.",
      },
    ],
    meditationOffsetMin: 8,
    meditationDurationSec: 420,
    reflection: {
      style: 'freeform',
      text: 'This is day one of 1,200 kilometers. The distance is meaningless. What matters is that I began.',
    },
    celestial: true,
    favicon: 'figure.walk',
  })

  const canterburyWalk = buildPilgrimWalk({
    coords: pilgrimsRoute.coords,
    timestamps: pilgrimsRoute.timestamps,
    startDate: pilgrimsWay.startDate,
    intention: 'Follow the old way to the cathedral',
    weather: { temperature: 13.0, condition: 'overcast', humidity: 0.80, windSpeed: 6.2 },
    transcriptions: [
      {
        offsetMin: 10,
        durationSec: 50,
        text: "The North Downs are gentle rolling hills, nothing dramatic. But there is a quietness to English countryside that gets inside you. Sheep watching me walk past their field like I am the strange one.",
      },
      {
        offsetMin: 22,
        durationSec: 45,
        text: "Passed a small Norman church, unlocked. Sat inside for a while. Stone walls, wooden pews worn smooth. A visitors' book going back to 1987. People write the most honest things when they think no one is reading.",
      },
    ],
    meditationOffsetMin: 18,
    meditationDurationSec: 480,
    reflection: {
      style: 'freeform',
      text: 'Chaucer walked this path. That was 600 years ago and the hills look the same. There is something humbling about walking where so many feet have gone before. The cathedral spire appeared through the trees at the end, and I stood there for a long time before I walked the last mile.',
    },
    celestial: true,
  })

  await buildPilgrimFile([shikokuWalk, canterburyWalk], 'pilgrimages-collection.pilgrim')

  console.log('\nAll files created in ~/Downloads/')
}

main().catch(console.error)
