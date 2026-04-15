import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import JSZip from 'jszip'
import { parseGPX } from '../../src/parsers/gpx'
import { parsePilgrim } from '../../src/parsers/pilgrim'

const sampleGPX = readFileSync(resolve(__dirname, '../fixtures/sample.gpx'), 'utf-8')
const sampleManifestRaw = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/sample-manifest.json'), 'utf-8')
)
const sampleWalkRaw = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/sample-walk.json'), 'utf-8')
)

async function buildPilgrimBuffer(): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify(sampleManifestRaw))
  zip.folder('walks')!.file(
    `${sampleWalkRaw.id}.json`,
    JSON.stringify(sampleWalkRaw)
  )
  return zip.generateAsync({ type: 'arraybuffer' })
}

describe('GPX pipeline', () => {
  it('returns Walk[] with length 1', () => {
    // #when
    const walks = parseGPX(sampleGPX)

    // #then
    expect(walks).toHaveLength(1)
  })

  it('walk id is a string', () => {
    // #when
    const [walk] = parseGPX(sampleGPX)

    // #then
    expect(typeof walk.id).toBe('string')
  })

  it('walk startDate is a Date instance', () => {
    // #when
    const [walk] = parseGPX(sampleGPX)

    // #then
    expect(walk.startDate).toBeInstanceOf(Date)
  })

  it('walk endDate is a Date instance', () => {
    // #when
    const [walk] = parseGPX(sampleGPX)

    // #then
    expect(walk.endDate).toBeInstanceOf(Date)
  })

  it('stats.distance is greater than 0', () => {
    // #when
    const [walk] = parseGPX(sampleGPX)

    // #then
    expect(walk.stats.distance).toBeGreaterThan(0)
  })

  it('stats.activeDuration is greater than 0', () => {
    // #when
    const [walk] = parseGPX(sampleGPX)

    // #then
    expect(walk.stats.activeDuration).toBeGreaterThan(0)
  })

  it('route is a FeatureCollection with features', () => {
    // #when
    const [walk] = parseGPX(sampleGPX)

    // #then
    expect(walk.route.type).toBe('FeatureCollection')
    expect(walk.route.features.length).toBeGreaterThan(0)
  })

  it('source is gpx', () => {
    // #when
    const [walk] = parseGPX(sampleGPX)

    // #then
    expect(walk.source).toBe('gpx')
  })

  it('weather is undefined', () => {
    // #when
    const [walk] = parseGPX(sampleGPX)

    // #then
    expect(walk.weather).toBeUndefined()
  })

  it('intention is undefined', () => {
    // #when
    const [walk] = parseGPX(sampleGPX)

    // #then
    expect(walk.intention).toBeUndefined()
  })

  it('celestial is undefined', () => {
    // #when
    const [walk] = parseGPX(sampleGPX)

    // #then
    expect(walk.celestial).toBeUndefined()
  })

  it('voiceRecordings is empty', () => {
    // #when
    const [walk] = parseGPX(sampleGPX)

    // #then
    expect(walk.voiceRecordings).toHaveLength(0)
  })

  it('activities is empty', () => {
    // #when
    const [walk] = parseGPX(sampleGPX)

    // #then
    expect(walk.activities).toHaveLength(0)
  })
})

describe('Pilgrim pipeline', () => {
  it('returns walks with length 1', async () => {
    // #given
    const buffer = await buildPilgrimBuffer()

    // #when
    const result = await parsePilgrim(buffer)

    // #then
    expect(result.walks).toHaveLength(1)
  })

  it('manifest has preferences with distanceUnit', async () => {
    // #given
    const buffer = await buildPilgrimBuffer()

    // #when
    const result = await parsePilgrim(buffer)

    // #then
    expect(result.manifest.preferences.distanceUnit).toBe('km')
  })

  it('walk has weather defined', async () => {
    // #given
    const buffer = await buildPilgrimBuffer()

    // #when
    const { walks } = await parsePilgrim(buffer)

    // #then
    expect(walks[0].weather).toBeDefined()
  })

  it('walk has intention defined', async () => {
    // #given
    const buffer = await buildPilgrimBuffer()

    // #when
    const { walks } = await parsePilgrim(buffer)

    // #then
    expect(walks[0].intention).toBeDefined()
  })

  it('walk has celestial defined', async () => {
    // #given
    const buffer = await buildPilgrimBuffer()

    // #when
    const { walks } = await parsePilgrim(buffer)

    // #then
    expect(walks[0].celestial).toBeDefined()
  })

  it('walk has non-empty voiceRecordings', async () => {
    // #given
    const buffer = await buildPilgrimBuffer()

    // #when
    const { walks } = await parsePilgrim(buffer)

    // #then
    expect(walks[0].voiceRecordings.length).toBeGreaterThan(0)
  })

  it('walk has non-empty activities', async () => {
    // #given
    const buffer = await buildPilgrimBuffer()

    // #when
    const { walks } = await parsePilgrim(buffer)

    // #then
    expect(walks[0].activities.length).toBeGreaterThan(0)
  })

  it('source is pilgrim', async () => {
    // #given
    const buffer = await buildPilgrimBuffer()

    // #when
    const { walks } = await parsePilgrim(buffer)

    // #then
    expect(walks[0].source).toBe('pilgrim')
  })
})

describe('Pilgrim pipeline with embedded photos', () => {
  async function buildPhotoArchive(): Promise<ArrayBuffer> {
    const walkWithPhotos = {
      ...sampleWalkRaw,
      photos: [
        {
          localIdentifier: 'TEST-ID-1',
          capturedAt: 1710001200,
          capturedLat: 42.8872,
          capturedLng: -8.5108,
          keptAt: 1710002000,
          embeddedPhotoFilename: 'TEST-ID-1.jpg',
        },
        {
          localIdentifier: 'TEST-ID-2',
          capturedAt: 1710001800,
          capturedLat: 42.8860,
          capturedLng: -8.5130,
          keptAt: 1710002500,
          embeddedPhotoFilename: 'TEST-ID-2.jpg',
        },
      ],
    }
    const zip = new JSZip()
    zip.file('manifest.json', JSON.stringify(sampleManifestRaw))
    zip.folder('walks')!.file(`${walkWithPhotos.id}.json`, JSON.stringify(walkWithPhotos))
    // Tiny JPEG-like bytes (SOI marker) — enough to look plausible
    zip.folder('photos')!.file('TEST-ID-1.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))
    zip.folder('photos')!.file('TEST-ID-2.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))
    return zip.generateAsync({ type: 'arraybuffer' })
  }

  it('extracts photos/ directory and attaches URLs to the walk', async () => {
    // #given
    const buffer = await buildPhotoArchive()
    let counter = 0
    const urlFactory = (): string => `stub:integration-${counter++}`

    // #when
    const { walks } = await parsePilgrim(buffer, { urlFactory })

    // #then
    expect(walks).toHaveLength(1)
    expect(walks[0].photos).toHaveLength(2)
  })

  it('photos are sorted by capturedAt ascending and carry resolved URLs', async () => {
    // #given
    const buffer = await buildPhotoArchive()
    const urlFactory = (): string => 'blob:stub'

    // #when
    const { walks } = await parsePilgrim(buffer, { urlFactory })

    // #then — ids stay in capturedAt order, both get URLs
    const ids = walks[0].photos!.map(p => p.localIdentifier)
    expect(ids).toEqual(['TEST-ID-1', 'TEST-ID-2'])
    for (const photo of walks[0].photos!) {
      expect(photo.url).toBe('blob:stub')
      expect(photo.capturedAt).toBeInstanceOf(Date)
      expect(Number.isFinite(photo.lat)).toBe(true)
      expect(Number.isFinite(photo.lng)).toBe(true)
    }
  })

  it('archive without photos/ parses identically to pre-v1.3 behavior', async () => {
    // #given — the existing buildPilgrimBuffer has no photos/
    const buffer = await buildPilgrimBuffer()

    // #when
    const { walks } = await parsePilgrim(buffer)

    // #then
    expect(walks[0].photos).toBeUndefined()
  })
})

describe('structural contract', () => {
  it('GPX walk satisfies the Walk structural contract', () => {
    // #when
    const [walk] = parseGPX(sampleGPX)

    // #then
    expect(typeof walk.id).toBe('string')
    expect(walk.startDate).toBeInstanceOf(Date)
    expect(walk.endDate).toBeInstanceOf(Date)
    expect(typeof walk.stats.distance).toBe('number')
    expect(typeof walk.stats.activeDuration).toBe('number')
    expect(walk.route.type).toBe('FeatureCollection')
    expect(walk.route.features.length).toBeGreaterThan(0)
  })

  it('Pilgrim walk satisfies the Walk structural contract', async () => {
    // #given
    const buffer = await buildPilgrimBuffer()

    // #when
    const { walks } = await parsePilgrim(buffer)
    const [walk] = walks

    // #then
    expect(typeof walk.id).toBe('string')
    expect(walk.startDate).toBeInstanceOf(Date)
    expect(walk.endDate).toBeInstanceOf(Date)
    expect(typeof walk.stats.distance).toBe('number')
    expect(typeof walk.stats.activeDuration).toBe('number')
    expect(walk.route.type).toBe('FeatureCollection')
    expect(walk.route.features.length).toBeGreaterThan(0)
  })
})
