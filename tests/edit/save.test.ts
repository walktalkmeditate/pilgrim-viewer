// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { serializeTendedPilgrim } from '../../src/edit/save'
import type { Modification, PilgrimManifest } from '../../src/parsers/types'

async function makeMinimalPilgrimZip(): Promise<{ buf: ArrayBuffer; manifest: PilgrimManifest; rawWalks: unknown[] }> {
  // Manifest must satisfy validatePilgrimManifest's iOS-shape contract
  // (see src/edit/save.ts) — which means the on-disk JSON needs
  // customPromptStyles, intentions, events, and the full preferences set
  // even though our typed PilgrimManifest doesn't model them.
  const fullManifestJson = {
    schemaVersion: '1.0',
    exportDate: 1745000000,
    appVersion: '1.0.0',
    walkCount: 2,
    preferences: {
      distanceUnit: 'km', altitudeUnit: 'm', speedUnit: 'min/km', energyUnit: 'kcal',
      celestialAwareness: true, zodiacSystem: 'tropical', beginWithIntention: true,
    },
    customPromptStyles: [],
    intentions: [],
    events: [],
    archived: [],
    modifications: [],
    archivedCount: 0,
  }
  // The TS-typed view that callers pass into serializeTendedPilgrim.
  const manifest: PilgrimManifest = {
    schemaVersion: '1.0',
    exportDate: 1745000000,
    appVersion: '1.0.0',
    walkCount: 2,
    preferences: { distanceUnit: 'km', altitudeUnit: 'm', speedUnit: 'min/km', energyUnit: 'kcal' },
    archived: [],
    modifications: [],
    archivedCount: 0,
  }
  const walkA = {
    schemaVersion: '1.0', id: 'walk-a', type: 'walking',
    startDate: 1700000000, endDate: 1700000600,
    stats: { distance: 1000, activeDuration: 540, pauseDuration: 60, ascent: 50, descent: 50,
             talkDuration: 0, meditateDuration: 0, steps: 1500 },
    route: { type: 'FeatureCollection', features: [{ type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[0,0,100],[0.001,0,105],[0.002,0,110]] },
      properties: { timestamps: [1700000000, 1700000300, 1700000600] } }] },
    pauses: [], activities: [], voiceRecordings: [],
    intention: 'walk a',
  }
  const walkB = { ...walkA, id: 'walk-b', intention: 'walk b' }
  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify(fullManifestJson))
  zip.file('walks/walk-a.json', JSON.stringify(walkA))
  zip.file('walks/walk-b.json', JSON.stringify(walkB))
  const buf = await zip.generateAsync({ type: 'arraybuffer' })
  return { buf, manifest, rawWalks: [walkA, walkB] }
}

function mkMod(op: Modification['op'], payload: unknown, walkId?: string): Modification {
  return { id: `m-${Math.random()}`, at: Date.now(), op, walkId, payload: payload as Modification['payload'] }
}

describe('serializeTendedPilgrim', () => {
  it('archives a walk: removes file from walks/, appends skeletal record to manifest.archived', async () => {
    const { buf, manifest, rawWalks } = await makeMinimalPilgrimZip()
    const result = await serializeTendedPilgrim({
      originalBuffer: buf,
      manifest,
      rawWalks,
      modifications: [mkMod('archive_walk', {}, 'walk-a')],
      includeHistory: true,
      originalFilename: 'sample.pilgrim',
    })

    const reZip = await JSZip.loadAsync(result.blob)
    const newManifest = JSON.parse(await reZip.file('manifest.json')!.async('text'))

    expect(reZip.file('walks/walk-a.json')).toBeNull()
    expect(reZip.file('walks/walk-b.json')).not.toBeNull()
    expect(newManifest.walkCount).toBe(1)
    expect(newManifest.archivedCount).toBe(1)
    expect(newManifest.archived).toHaveLength(1)
    expect(newManifest.archived[0].id).toBe('walk-a')
    expect(newManifest.archived[0].stats.distance).toBe(1000)
    expect(newManifest.archived[0].stats.activeDuration).toBe(540)
    expect(newManifest.modifications.length).toBeGreaterThan(0)
    expect(result.filename).toBe('sample-tended.pilgrim')
    expect(newManifest.schemaVersion).toBe('1.0')
  })

  it('edit_intention rewrites the walk JSON in place', async () => {
    const { buf, manifest, rawWalks } = await makeMinimalPilgrimZip()
    const result = await serializeTendedPilgrim({
      originalBuffer: buf,
      manifest,
      rawWalks,
      modifications: [mkMod('edit_intention', { text: 'rewritten' }, 'walk-a')],
      includeHistory: true,
      originalFilename: 'sample.pilgrim',
    })

    const reZip = await JSZip.loadAsync(result.blob)
    const updated = JSON.parse(await reZip.file('walks/walk-a.json')!.async('text'))
    expect(updated.intention).toBe('rewritten')
    expect(updated.isUserModified).toBe(true)
  })

  it('history toggle off strips both old and new modifications', async () => {
    const seed = await makeMinimalPilgrimZip()
    const seedManifest: PilgrimManifest = {
      ...seed.manifest,
      modifications: [{ id: 'old', at: 1, op: 'archive_walk', walkId: 'walk-x', payload: {} }],
    }
    // The on-disk manifest must satisfy iOS schema requirements.
    const seedFullManifestJson = {
      ...seedManifest,
      preferences: {
        distanceUnit: 'km', altitudeUnit: 'm', speedUnit: 'min/km', energyUnit: 'kcal',
        celestialAwareness: true, zodiacSystem: 'tropical', beginWithIntention: true,
      },
      customPromptStyles: [], intentions: [], events: [],
    }
    const zip = new JSZip()
    zip.file('manifest.json', JSON.stringify(seedFullManifestJson))
    zip.file('walks/walk-a.json', JSON.stringify(seed.rawWalks[0]))
    zip.file('walks/walk-b.json', JSON.stringify(seed.rawWalks[1]))
    const buf = await zip.generateAsync({ type: 'arraybuffer' })

    const result = await serializeTendedPilgrim({
      originalBuffer: buf,
      manifest: seedManifest,
      rawWalks: seed.rawWalks,
      modifications: [mkMod('edit_intention', { text: 'x' }, 'walk-a')],
      includeHistory: false,
      originalFilename: 'sample.pilgrim',
    })

    const reZip = await JSZip.loadAsync(result.blob)
    const newManifest = JSON.parse(await reZip.file('manifest.json')!.async('text'))
    expect(newManifest.modifications).toEqual([])
  })

  it('keeps -tended suffix from already-tended files (no -tended-tended)', async () => {
    const { buf, manifest, rawWalks } = await makeMinimalPilgrimZip()
    const result = await serializeTendedPilgrim({
      originalBuffer: buf,
      manifest,
      rawWalks,
      modifications: [],
      includeHistory: true,
      originalFilename: 'sample-tended.pilgrim',
    })
    expect(result.filename).toBe('sample-tended.pilgrim')
  })
})

describe('serializeTendedGpx', () => {
  const sampleGpx = `<?xml version="1.0"?>
<gpx version="1.1" creator="test">
  <wpt lat="0.001" lon="0"><name>WP1</name></wpt>
  <wpt lat="0.005" lon="0"><name>WP2</name></wpt>
  <trk><name>Test</name><trkseg>
    <trkpt lat="0" lon="0"><ele>100</ele><time>2024-01-01T00:00:00Z</time></trkpt>
    <trkpt lat="0.001" lon="0"><ele>105</ele><time>2024-01-01T00:01:00Z</time></trkpt>
    <trkpt lat="0.002" lon="0"><ele>110</ele><time>2024-01-01T00:02:00Z</time></trkpt>
    <trkpt lat="0.003" lon="0"><ele>115</ele><time>2024-01-01T00:03:00Z</time></trkpt>
  </trkseg></trk>
</gpx>`

  async function blobToText(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsText(blob)
    })
  }

  it('removes a deleted waypoint by lat/lng', async () => {
    const { serializeTendedGpx } = await import('../../src/edit/save')
    const result = await serializeTendedGpx({
      originalXml: sampleGpx,
      modifications: [mkMod('delete_waypoint', { lat: 0.001, lng: 0 })],
      originalFilename: 'route.gpx',
    })
    const text = await blobToText(result.blob)
    expect(text).not.toContain('WP1')
    expect(text).toContain('WP2')
    expect(result.filename).toBe('route-tended.gpx')
  })

  it('trims route start (drops leading trkpts)', async () => {
    const { serializeTendedGpx } = await import('../../src/edit/save')
    const result = await serializeTendedGpx({
      originalXml: sampleGpx,
      modifications: [mkMod('trim_route_start', { meters: 50 })],
      originalFilename: 'route.gpx',
    })
    const text = await blobToText(result.blob)
    expect((text.match(/<trkpt/g) ?? []).length).toBeLessThan(4)
  })

  // fast-xml-parser returns a single object (not an array) when the
  // XML has only one <wpt>. The serializer must handle both shapes
  // via asArray — a regression here would silently drop or duplicate
  // the lone waypoint.
  it('handles a single-waypoint GPX (fast-xml-parser returns object, not array)', async () => {
    const { serializeTendedGpx } = await import('../../src/edit/save')
    const singleWpGpx = `<?xml version="1.0"?>
<gpx version="1.1" creator="test">
  <wpt lat="0.001" lon="0"><name>OnlyWP</name></wpt>
  <trk><name>Test</name><trkseg>
    <trkpt lat="0" lon="0"><ele>100</ele></trkpt>
    <trkpt lat="0.001" lon="0"><ele>105</ele></trkpt>
  </trkseg></trk>
</gpx>`
    // Round-trip with no mods — single wpt should survive verbatim.
    const noopResult = await serializeTendedGpx({
      originalXml: singleWpGpx,
      modifications: [],
      originalFilename: 'single.gpx',
    })
    const noopText = await blobToText(noopResult.blob)
    expect(noopText).toContain('OnlyWP')

    // Delete the single wpt — no remaining <wpt> should appear.
    const delResult = await serializeTendedGpx({
      originalXml: singleWpGpx,
      modifications: [mkMod('delete_waypoint', { lat: 0.001, lng: 0 })],
      originalFilename: 'single.gpx',
    })
    const delText = await blobToText(delResult.blob)
    expect(delText).not.toContain('OnlyWP')
    expect(delText).not.toContain('<wpt')
  })

  // Multi-segment GPX: previously the trim was applied to EVERY trkseg
  // (which over-trimmed 5x for a 5-segment walk and tore segment joins).
  // Now: startMeters applies only to the first seg, endMeters only to
  // the last. Middle segments survive intact.
  it('multi-trkseg trim: startMeters → first seg, endMeters → last seg, middle untouched', async () => {
    const { serializeTendedGpx } = await import('../../src/edit/save')
    const xml = `<?xml version="1.0"?>
<gpx version="1.1" creator="test">
  <trk><name>Multi</name>
    <trkseg>
      <trkpt lat="0" lon="0"><ele>100</ele></trkpt>
      <trkpt lat="0.001" lon="0"><ele>105</ele></trkpt>
      <trkpt lat="0.002" lon="0"><ele>110</ele></trkpt>
    </trkseg>
    <trkseg>
      <trkpt lat="0.010" lon="0"><ele>115</ele></trkpt>
      <trkpt lat="0.011" lon="0"><ele>120</ele></trkpt>
      <trkpt lat="0.012" lon="0"><ele>125</ele></trkpt>
    </trkseg>
    <trkseg>
      <trkpt lat="0.020" lon="0"><ele>130</ele></trkpt>
      <trkpt lat="0.021" lon="0"><ele>135</ele></trkpt>
      <trkpt lat="0.022" lon="0"><ele>140</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`
    const result = await serializeTendedGpx({
      originalXml: xml,
      modifications: [
        mkMod('trim_route_start', { meters: 50 }),
        mkMod('trim_route_end', { meters: 50 }),
      ],
      originalFilename: 'multi.gpx',
    })
    const text = await blobToText(result.blob)
    // Middle segment (lat 0.010 / 0.011 / 0.012) must be entirely intact.
    expect(text).toContain('lat="0.01"')
    expect(text).toContain('lat="0.011"')
    expect(text).toContain('lat="0.012"')
    // First seg should have lost its leading point (~111m > 50m trim).
    expect(text).not.toMatch(/<trkpt lat="0"\s+lon="0">/)
    // Last seg should have lost its trailing point.
    expect(text).not.toContain('lat="0.022"')
  })

  // Same array-vs-object concern for trkseg/trkpt — fast-xml-parser
  // returns a single object when there's only one. trimTrkpts must
  // still receive a workable list via asArray.
  it('handles a single-trkseg-with-multiple-trkpts (object-shaped trkseg)', async () => {
    const { serializeTendedGpx } = await import('../../src/edit/save')
    const xml = `<?xml version="1.0"?>
<gpx version="1.1" creator="test">
  <trk><name>One</name><trkseg>
    <trkpt lat="0" lon="0"><ele>100</ele></trkpt>
    <trkpt lat="0.001" lon="0"><ele>105</ele></trkpt>
    <trkpt lat="0.002" lon="0"><ele>110</ele></trkpt>
    <trkpt lat="0.003" lon="0"><ele>115</ele></trkpt>
  </trkseg></trk>
</gpx>`
    const result = await serializeTendedGpx({
      originalXml: xml,
      modifications: [mkMod('trim_route_start', { meters: 50 })],
      originalFilename: 'one-trk.gpx',
    })
    const text = await blobToText(result.blob)
    // Trim should drop at least the first trkpt (∼111m segment > 50m).
    expect((text.match(/<trkpt/g) ?? []).length).toBeLessThan(4)
    expect((text.match(/<trkpt/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })
})
