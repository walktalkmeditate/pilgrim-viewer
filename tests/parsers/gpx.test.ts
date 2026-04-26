import { describe, it, expect } from 'vitest'
import { parseGPX, parseGPXWithAst } from '../../src/parsers/gpx'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SAMPLE_GPX = readFileSync(
  resolve(__dirname, '../fixtures/sample.gpx'),
  'utf-8'
)

const MULTI_TRACK_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Pilgrim Viewer Tests" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Track One</name>
    <trkseg>
      <trkpt lat="42.8872" lon="-8.5108"><ele>370</ele><time>2026-03-20T07:00:00Z</time></trkpt>
      <trkpt lat="42.8850" lon="-8.5160"><ele>350</ele><time>2026-03-20T07:03:00Z</time></trkpt>
      <trkpt lat="42.8828" lon="-8.5212"><ele>315</ele><time>2026-03-20T07:06:00Z</time></trkpt>
    </trkseg>
  </trk>
  <trk>
    <name>Track Two</name>
    <trkseg>
      <trkpt lat="43.1000" lon="-8.7000"><ele>200</ele><time>2026-03-21T08:00:00Z</time></trkpt>
      <trkpt lat="43.0980" lon="-8.7050"><ele>195</ele><time>2026-03-21T08:04:00Z</time></trkpt>
      <trkpt lat="43.0960" lon="-8.7100"><ele>190</ele><time>2026-03-21T08:08:00Z</time></trkpt>
      <trkpt lat="43.0940" lon="-8.7150"><ele>188</ele><time>2026-03-21T08:12:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`

const EMPTY_TRACK_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Empty</name>
    <trkseg></trkseg>
  </trk>
</gpx>`

describe('parseGPX', () => {
  describe('single track', () => {
    it('produces exactly 1 Walk', () => {
      // #when
      const walks = parseGPX(SAMPLE_GPX)
      // #then
      expect(walks).toHaveLength(1)
    })

    it('walk has correct startDate from first trackpoint', () => {
      // #when
      const [walk] = parseGPX(SAMPLE_GPX)
      // #then
      expect(walk.startDate).toEqual(new Date('2026-03-20T07:00:00Z'))
    })

    it('walk has correct endDate from last trackpoint', () => {
      // #when
      const [walk] = parseGPX(SAMPLE_GPX)
      // #then
      expect(walk.endDate).toEqual(new Date('2026-03-20T07:27:00Z'))
    })

    it('walk has source gpx', () => {
      // #when
      const [walk] = parseGPX(SAMPLE_GPX)
      // #then
      expect(walk.source).toBe('gpx')
    })

    it('stats distance is greater than 0', () => {
      // #when
      const [walk] = parseGPX(SAMPLE_GPX)
      // #then
      expect(walk.stats.distance).toBeGreaterThan(0)
    })

    it('stats activeDuration is 1620 seconds (27 minutes)', () => {
      // #when
      const [walk] = parseGPX(SAMPLE_GPX)
      // #then
      expect(walk.stats.activeDuration).toBe(1620)
    })

    it('stats ascent is greater than 0', () => {
      // #when
      const [walk] = parseGPX(SAMPLE_GPX)
      // #then
      expect(walk.stats.ascent).toBeGreaterThan(0)
    })

    it('stats descent is greater than 0', () => {
      // #when
      const [walk] = parseGPX(SAMPLE_GPX)
      // #then
      expect(walk.stats.descent).toBeGreaterThan(0)
    })

    it('stats talkDuration is 0', () => {
      // #when
      const [walk] = parseGPX(SAMPLE_GPX)
      // #then
      expect(walk.stats.talkDuration).toBe(0)
    })

    it('stats meditateDuration is 0', () => {
      // #when
      const [walk] = parseGPX(SAMPLE_GPX)
      // #then
      expect(walk.stats.meditateDuration).toBe(0)
    })
  })

  describe('route GeoJSON', () => {
    it('route is a valid GeoJSON FeatureCollection', () => {
      // #when
      const [walk] = parseGPX(SAMPLE_GPX)
      // #then
      expect(walk.route.type).toBe('FeatureCollection')
    })

    it('route has 1 feature', () => {
      // #when
      const [walk] = parseGPX(SAMPLE_GPX)
      // #then
      expect(walk.route.features).toHaveLength(1)
    })

    it('route feature is a LineString', () => {
      // #when
      const [walk] = parseGPX(SAMPLE_GPX)
      // #then
      expect(walk.route.features[0].geometry.type).toBe('LineString')
    })

    it('first coordinate is [lon, lat, alt] order', () => {
      // #when
      const [walk] = parseGPX(SAMPLE_GPX)
      const coords = walk.route.features[0].geometry.coordinates as number[][]
      // #then
      expect(coords[0]).toEqual([-8.5108, 42.8872, 370])
    })
  })

  describe('pilgrim-only fields', () => {
    it('weather is undefined', () => {
      const [walk] = parseGPX(SAMPLE_GPX)
      expect(walk.weather).toBeUndefined()
    })

    it('intention is undefined', () => {
      const [walk] = parseGPX(SAMPLE_GPX)
      expect(walk.intention).toBeUndefined()
    })

    it('celestial is undefined', () => {
      const [walk] = parseGPX(SAMPLE_GPX)
      expect(walk.celestial).toBeUndefined()
    })

    it('voiceRecordings is empty array', () => {
      const [walk] = parseGPX(SAMPLE_GPX)
      expect(walk.voiceRecordings).toEqual([])
    })

    it('activities is empty array', () => {
      const [walk] = parseGPX(SAMPLE_GPX)
      expect(walk.activities).toEqual([])
    })
  })

  describe('multi-track GPX', () => {
    it('produces one Walk per track', () => {
      // #when
      const walks = parseGPX(MULTI_TRACK_GPX)
      // #then
      expect(walks).toHaveLength(2)
    })

    it('each Walk has its own correct startDate', () => {
      // #when
      const walks = parseGPX(MULTI_TRACK_GPX)
      // #then
      expect(walks[0].startDate).toEqual(new Date('2026-03-20T07:00:00Z'))
      expect(walks[1].startDate).toEqual(new Date('2026-03-21T08:00:00Z'))
    })
  })

  describe('error handling', () => {
    it('throws an error for GPX with no trackpoints', () => {
      expect(() => parseGPX(EMPTY_TRACK_GPX)).toThrow('No trackpoints found in GPX file')
    })
  })
})

describe('parseGPXWithAst', () => {
  it('returns walks AND raw XML AST', () => {
    const xml = `<?xml version="1.0"?>
<gpx version="1.1" creator="test">
  <trk><name>Test</name><trkseg>
    <trkpt lat="0" lon="0"><ele>100</ele><time>2024-01-01T00:00:00Z</time></trkpt>
    <trkpt lat="0.001" lon="0"><ele>105</ele><time>2024-01-01T00:01:00Z</time></trkpt>
  </trkseg></trk>
</gpx>`
    const result = parseGPXWithAst(xml)
    expect(result.walks).toHaveLength(1)
    expect(result.ast).toBeDefined()
    expect(typeof result.ast).toBe('object')
  })
})
