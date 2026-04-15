import { describe, it, expect } from 'vitest'
import { parsePilgrimWalkJSON, parsePilgrim, deriveActivities } from '../../src/parsers/pilgrim'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import JSZip from 'jszip'

const sampleWalkRaw = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/sample-walk.json'), 'utf-8')
)

const sampleManifestRaw = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/sample-manifest.json'), 'utf-8')
)

describe('parsePilgrimWalkJSON', () => {
  it('parses all expected fields from walk JSON', () => {
    // #when
    const walk = parsePilgrimWalkJSON(sampleWalkRaw)

    // #then
    expect(walk.id).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    expect(walk.stats.distance).toBe(5432.1)
    expect(walk.stats.steps).toBe(7200)
    expect(walk.stats.activeDuration).toBe(3600)
    expect(walk.stats.pauseDuration).toBe(120)
    expect(walk.stats.ascent).toBe(45.2)
    expect(walk.stats.descent).toBe(38.1)
    expect(walk.stats.burnedEnergy).toBe(320.5)
    expect(walk.stats.talkDuration).toBe(180)
    expect(walk.stats.meditateDuration).toBe(300)
    expect(walk.route.type).toBe('FeatureCollection')
    expect(walk.route.features).toHaveLength(3)
    expect(walk.weather).toEqual({
      temperature: 18.5,
      condition: 'partly_cloudy',
      humidity: 0.65,
      windSpeed: 3.2,
    })
    expect(walk.intention).toBe('Walk with gratitude today')
    expect(walk.favicon).toBe('flame')
    expect(walk.voiceRecordings).toHaveLength(1)
    expect(walk.pauses).toHaveLength(1)
  })

  it('converts epoch seconds to Date objects', () => {
    // #when
    const walk = parsePilgrimWalkJSON(sampleWalkRaw)

    // #then
    expect(walk.startDate).toEqual(new Date(1710000000 * 1000))
    expect(walk.endDate).toEqual(new Date(1710003600 * 1000))
    expect(walk.pauses[0].startDate).toEqual(new Date(1710001800 * 1000))
    expect(walk.pauses[0].endDate).toEqual(new Date(1710001860 * 1000))
    expect(walk.voiceRecordings[0].startDate).toEqual(new Date(1710001200 * 1000))
    expect(walk.voiceRecordings[0].endDate).toEqual(new Date(1710001380 * 1000))
  })

  it('hoists celestialContext from reflection to top-level celestial field', () => {
    // #when
    const walk = parsePilgrimWalkJSON(sampleWalkRaw)

    // #then
    expect(walk.celestial).toBeDefined()
    expect(walk.celestial!.lunarPhase.name).toBe('Waxing Crescent')
    expect(walk.celestial!.planetaryPositions).toHaveLength(2)
    expect(walk.celestial!.planetaryHour.planet).toBe('Jupiter')
    expect(walk.celestial!.elementBalance.dominant).toBe('earth')
    expect(walk.celestial!.seasonalMarker).toBe('Spring Equinox')
    expect(walk.celestial!.zodiacSystem).toBe('tropical')
  })

  it('reflection does not contain celestialContext', () => {
    // #when
    const walk = parsePilgrimWalkJSON(sampleWalkRaw)

    // #then
    expect(walk.reflection).toEqual({ style: 'haiku', text: 'Morning dew glistens...' })
    expect((walk.reflection as Record<string, unknown>)['celestialContext']).toBeUndefined()
  })

  it('has source pilgrim', () => {
    // #when
    const walk = parsePilgrimWalkJSON(sampleWalkRaw)

    // #then
    expect(walk.source).toBe('pilgrim')
  })

  it('missing optional fields result in undefined', () => {
    // #given
    const minimal = {
      id: 'minimal-walk-id',
      startDate: 1710000000,
      endDate: 1710003600,
      stats: {
        distance: 1000,
        activeDuration: 3600,
        pauseDuration: 0,
        ascent: 10,
        descent: 5,
        talkDuration: 0,
        meditateDuration: 0,
      },
      route: { type: 'FeatureCollection', features: [] },
      pauses: [],
      activities: [],
      voiceRecordings: [],
    }

    // #when
    const walk = parsePilgrimWalkJSON(minimal)

    // #then
    expect(walk.weather).toBeUndefined()
    expect(walk.intention).toBeUndefined()
    expect(walk.reflection).toBeUndefined()
    expect(walk.celestial).toBeUndefined()
    expect(walk.favicon).toBeUndefined()
  })

  it('ignored fields are not present on Walk object', () => {
    // #when
    const walk = parsePilgrimWalkJSON(sampleWalkRaw) as unknown as Record<string, unknown>

    // #then
    expect(walk['heartRates']).toBeUndefined()
    expect(walk['workoutEvents']).toBeUndefined()
    expect(walk['isRace']).toBeUndefined()
    expect(walk['isUserModified']).toBeUndefined()
    expect(walk['finishedRecording']).toBeUndefined()
    expect(walk['schemaVersion']).toBeUndefined()
    expect(walk['type']).toBeUndefined()
  })
})

describe('deriveActivities', () => {
  it('walk with only meditation produces meditate and walk segments', () => {
    // #given
    const start = new Date(1710000000 * 1000)
    const end = new Date(1710003600 * 1000)
    const rawActivities = [
      { type: 'meditation' as const, startDate: new Date(1710001000 * 1000), endDate: new Date(1710001300 * 1000) },
    ]

    // #when
    const activities = deriveActivities(start, end, rawActivities, [], [])

    // #then
    const types = activities.map(a => a.type)
    expect(types).toContain('meditate')
    expect(types).toContain('walk')
    expect(types).not.toContain('talk')
  })

  it('walk with meditation and voice recording produces all three types', () => {
    // #given
    const start = new Date(1710000000 * 1000)
    const end = new Date(1710003600 * 1000)
    const rawActivities = [
      { type: 'meditation' as const, startDate: new Date(1710001000 * 1000), endDate: new Date(1710001300 * 1000) },
    ]
    const voiceRecordings = [
      { startDate: new Date(1710002000 * 1000), endDate: new Date(1710002180 * 1000), duration: 180 },
    ]

    // #when
    const activities = deriveActivities(start, end, rawActivities, voiceRecordings, [])

    // #then
    const types = activities.map(a => a.type)
    expect(types).toContain('walk')
    expect(types).toContain('talk')
    expect(types).toContain('meditate')
  })

  it('overlapping voice recordings are merged before deriving talk segments', () => {
    // #given
    const start = new Date(1710000000 * 1000)
    const end = new Date(1710003600 * 1000)
    const voiceRecordings = [
      { startDate: new Date(1710001000 * 1000), endDate: new Date(1710001200 * 1000), duration: 200 },
      { startDate: new Date(1710001100 * 1000), endDate: new Date(1710001400 * 1000), duration: 300 },
    ]

    // #when
    const activities = deriveActivities(start, end, [], voiceRecordings, [])

    // #then
    const talkSegments = activities.filter(a => a.type === 'talk')
    expect(talkSegments).toHaveLength(1)
    expect(talkSegments[0].startDate).toEqual(new Date(1710001000 * 1000))
    expect(talkSegments[0].endDate).toEqual(new Date(1710001400 * 1000))
  })

  it('meditation at very start of walk: walk segment starts after meditation ends', () => {
    // #given
    const start = new Date(1710000000 * 1000)
    const end = new Date(1710003600 * 1000)
    const rawActivities = [
      { type: 'meditation' as const, startDate: new Date(1710000000 * 1000), endDate: new Date(1710000300 * 1000) },
    ]

    // #when
    const activities = deriveActivities(start, end, rawActivities, [], [])

    // #then
    const walkSegments = activities.filter(a => a.type === 'walk')
    expect(walkSegments.length).toBeGreaterThanOrEqual(1)
    expect(walkSegments[0].startDate).toEqual(new Date(1710000300 * 1000))
  })

  it('no raw activities and no recordings produces single walk segment', () => {
    // #given
    const start = new Date(1710000000 * 1000)
    const end = new Date(1710003600 * 1000)

    // #when
    const activities = deriveActivities(start, end, [], [], [])

    // #then
    expect(activities).toHaveLength(1)
    expect(activities[0].type).toBe('walk')
    expect(activities[0].startDate).toEqual(start)
    expect(activities[0].endDate).toEqual(end)
  })

  it('activities are sorted by startDate', () => {
    // #given
    const start = new Date(1710000000 * 1000)
    const end = new Date(1710003600 * 1000)
    const rawActivities = [
      { type: 'meditation' as const, startDate: new Date(1710002000 * 1000), endDate: new Date(1710002300 * 1000) },
    ]
    const voiceRecordings = [
      { startDate: new Date(1710001000 * 1000), endDate: new Date(1710001180 * 1000), duration: 180 },
    ]

    // #when
    const activities = deriveActivities(start, end, rawActivities, voiceRecordings, [])

    // #then
    for (let i = 1; i < activities.length; i++) {
      expect(activities[i].startDate.getTime()).toBeGreaterThanOrEqual(
        activities[i - 1].startDate.getTime()
      )
    }
  })
})

describe('parsePilgrim', () => {
  it('accepts ArrayBuffer ZIP and returns manifest and walks', async () => {
    // #given
    const zip = new JSZip()
    zip.file('manifest.json', JSON.stringify(sampleManifestRaw))
    zip.folder('walks')!.file(
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890.json',
      JSON.stringify(sampleWalkRaw)
    )
    const buffer = await zip.generateAsync({ type: 'arraybuffer' })

    // #when
    const result = await parsePilgrim(buffer)

    // #then
    expect(result.manifest.schemaVersion).toBe('1.0')
    expect(result.manifest.walkCount).toBe(1)
    expect(result.manifest.preferences.distanceUnit).toBe('km')
    expect(result.walks).toHaveLength(1)
    expect(result.walks[0].id).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    expect(result.walks[0].source).toBe('pilgrim')
  })

  it('invalid ZIP throws descriptive error', async () => {
    // #given
    const garbage = new ArrayBuffer(16)

    // #then
    await expect(parsePilgrim(garbage)).rejects.toThrow(/invalid.*zip|failed.*parse/i)
  })
})

describe('parsePilgrimWalkJSON photos', () => {
  it('walk without photos key has undefined photos field', () => {
    // #when
    const walk = parsePilgrimWalkJSON(sampleWalkRaw)

    // #then
    expect(walk.photos).toBeUndefined()
  })

  it('attaches photos with filenames that match the URL map', () => {
    // #given
    const raw = {
      ...sampleWalkRaw,
      photos: [
        {
          localIdentifier: 'ABC-123/L0/001',
          capturedAt: 1710001000,
          capturedLat: 42.87,
          capturedLng: -8.51,
          keptAt: 1710002000,
          embeddedPhotoFilename: 'ABC-123_L0_001.jpg',
        },
      ],
    }
    const urls = new Map([['ABC-123_L0_001.jpg', 'blob:mock-url-1']])

    // #when
    const walk = parsePilgrimWalkJSON(raw, urls)

    // #then
    expect(walk.photos).toHaveLength(1)
    expect(walk.photos![0]).toEqual({
      localIdentifier: 'ABC-123/L0/001',
      capturedAt: new Date(1710001000 * 1000),
      lat: 42.87,
      lng: -8.51,
      url: 'blob:mock-url-1',
    })
  })

  it('skips photos with null embeddedPhotoFilename', () => {
    // #given
    const raw = {
      ...sampleWalkRaw,
      photos: [
        {
          localIdentifier: 'A',
          capturedAt: 1710001000,
          capturedLat: 0,
          capturedLng: 0,
          keptAt: 1710002000,
          embeddedPhotoFilename: null,
        },
      ],
    }

    // #when
    const walk = parsePilgrimWalkJSON(raw, new Map())

    // #then
    expect(walk.photos).toBeUndefined()
  })

  it('skips photos whose filename is not in the URL map', () => {
    // #given
    const raw = {
      ...sampleWalkRaw,
      photos: [
        {
          localIdentifier: 'A',
          capturedAt: 1710001000,
          capturedLat: 0,
          capturedLng: 0,
          keptAt: 1710002000,
          embeddedPhotoFilename: 'missing.jpg',
        },
      ],
    }

    // #when
    const walk = parsePilgrimWalkJSON(raw, new Map())

    // #then
    expect(walk.photos).toBeUndefined()
  })

  it('sorts photos by capturedAt ascending', () => {
    // #given
    const raw = {
      ...sampleWalkRaw,
      photos: [
        {
          localIdentifier: 'B',
          capturedAt: 1710002000,
          capturedLat: 0,
          capturedLng: 0,
          keptAt: 0,
          embeddedPhotoFilename: 'b.jpg',
        },
        {
          localIdentifier: 'A',
          capturedAt: 1710001000,
          capturedLat: 0,
          capturedLng: 0,
          keptAt: 0,
          embeddedPhotoFilename: 'a.jpg',
        },
      ],
    }
    const urls = new Map([
      ['a.jpg', 'blob:a'],
      ['b.jpg', 'blob:b'],
    ])

    // #when
    const walk = parsePilgrimWalkJSON(raw, urls)

    // #then
    expect(walk.photos!.map(p => p.localIdentifier)).toEqual(['A', 'B'])
  })
})

describe('parsePilgrim photos', () => {
  it('extracts photos/ directory and attaches to walks', async () => {
    // #given
    const walkRaw = {
      ...sampleWalkRaw,
      photos: [
        {
          localIdentifier: 'ABC-123/L0/001',
          capturedAt: 1710001000,
          capturedLat: 42.87,
          capturedLng: -8.51,
          keptAt: 1710002000,
          embeddedPhotoFilename: 'ABC-123_L0_001.jpg',
        },
      ],
    }
    const zip = new JSZip()
    zip.file('manifest.json', JSON.stringify(sampleManifestRaw))
    zip.folder('walks')!.file('walk.json', JSON.stringify(walkRaw))
    zip.folder('photos')!.file(
      'ABC-123_L0_001.jpg',
      new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
    )
    const buffer = await zip.generateAsync({ type: 'arraybuffer' })

    let urlCounter = 0
    const urlFactory = (): string => `stub:url-${urlCounter++}`

    // #when
    const result = await parsePilgrim(buffer, { urlFactory })

    // #then
    expect(result.walks).toHaveLength(1)
    expect(result.walks[0].photos).toHaveLength(1)
    expect(result.walks[0].photos![0].url).toBe('stub:url-0')
    expect(result.walks[0].photos![0].localIdentifier).toBe('ABC-123/L0/001')
  })

  it('archive without photos/ directory still parses, walks have no photos', async () => {
    // #given
    const zip = new JSZip()
    zip.file('manifest.json', JSON.stringify(sampleManifestRaw))
    zip.folder('walks')!.file('walk.json', JSON.stringify(sampleWalkRaw))
    const buffer = await zip.generateAsync({ type: 'arraybuffer' })

    // #when
    const result = await parsePilgrim(buffer)

    // #then
    expect(result.walks[0].photos).toBeUndefined()
  })

  it('orphan photos/ directory without matching JSON references is ignored', async () => {
    // #given — photos/ exists, but the walk JSON has no `photos` field
    const zip = new JSZip()
    zip.file('manifest.json', JSON.stringify(sampleManifestRaw))
    zip.folder('walks')!.file('walk.json', JSON.stringify(sampleWalkRaw))
    zip.folder('photos')!.file('orphan.jpg', new Uint8Array([0xff]))
    const buffer = await zip.generateAsync({ type: 'arraybuffer' })

    const urlFactory = (): string => 'stub:orphan'

    // #when
    const result = await parsePilgrim(buffer, { urlFactory })

    // #then
    expect(result.walks[0].photos).toBeUndefined()
  })

  it('walk photo whose filename is missing from photos/ dir is skipped', async () => {
    // #given — walk JSON references `missing.jpg` but the ZIP photos/ dir is empty
    const walkRaw = {
      ...sampleWalkRaw,
      photos: [
        {
          localIdentifier: 'A',
          capturedAt: 1710001000,
          capturedLat: 0,
          capturedLng: 0,
          keptAt: 1710002000,
          embeddedPhotoFilename: 'missing.jpg',
        },
      ],
    }
    const zip = new JSZip()
    zip.file('manifest.json', JSON.stringify(sampleManifestRaw))
    zip.folder('walks')!.file('walk.json', JSON.stringify(walkRaw))
    zip.folder('photos') // empty photos/ dir
    const buffer = await zip.generateAsync({ type: 'arraybuffer' })

    // #when
    const result = await parsePilgrim(buffer)

    // #then
    expect(result.walks[0].photos).toBeUndefined()
  })
})
