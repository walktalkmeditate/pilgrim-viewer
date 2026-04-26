import { describe, it, expect } from 'vitest'
import { applyMods } from '../../src/edit/applier'
import type { Walk, Modification } from '../../src/parsers/types'

function makeWalk(): Walk {
  return {
    id: 'w1',
    startDate: new Date(1_000_000),
    endDate: new Date(1_600_000),
    stats: {
      distance: 1000, activeDuration: 540, pauseDuration: 60,
      ascent: 50, descent: 50, steps: 1000, burnedEnergy: 100,
      talkDuration: 0, meditateDuration: 0,
    },
    route: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[0, 0], [0.001, 0], [0.002, 0]] },
        properties: { timestamps: [1000, 2000, 3000] },
      }],
    },
    voiceRecordings: [],
    activities: [],
    pauses: [],
    source: 'pilgrim',
    intention: 'walk slowly',
    reflection: { style: 'gratitude', text: 'good walk' },
    weather: { temperature: 20, condition: 'clear' },
  }
}

function mkMod(op: Modification['op'], payload: unknown, walkId = 'w1'): Modification {
  return { id: `m-${Math.random()}`, at: Date.now(), op, walkId, payload: payload as Modification['payload'] }
}

describe('applyMods — text edits', () => {
  it('edit_intention replaces intention', () => {
    const out = applyMods(makeWalk(), [mkMod('edit_intention', { text: 'rewritten' })])
    expect(out!.intention).toBe('rewritten')
    expect(out!.isUserModified).toBe(true)
  })

  it('edit_reflection_text replaces reflection.text and preserves style', () => {
    const out = applyMods(makeWalk(), [mkMod('edit_reflection_text', { text: 'fixed typo' })])
    expect(out!.reflection!.text).toBe('fixed typo')
    expect(out!.reflection!.style).toBe('gratitude')
  })
})

describe('applyMods — section deletes', () => {
  it('delete_section intention removes the field', () => {
    const out = applyMods(makeWalk(), [mkMod('delete_section', { section: 'intention' })])
    expect(out!.intention).toBeUndefined()
  })

  it('delete_section weather removes the field', () => {
    const out = applyMods(makeWalk(), [mkMod('delete_section', { section: 'weather' })])
    expect(out!.weather).toBeUndefined()
  })

  it('delete_section reflection removes the whole reflection object', () => {
    const out = applyMods(makeWalk(), [mkMod('delete_section', { section: 'reflection' })])
    expect(out!.reflection).toBeUndefined()
  })

  it('delete_section celestial removes the field', () => {
    const w = makeWalk()
    w.celestial = {
      lunarPhase: { name: 'full', illumination: 1, age: 14, isWaxing: false },
      planetaryPositions: [],
      planetaryHour: { planet: 'sol', planetaryDay: 'sun' },
      elementBalance: { fire: 1, earth: 0, air: 0, water: 0 },
      zodiacSystem: 'tropical',
    }
    const out = applyMods(w, [mkMod('delete_section', { section: 'celestial' })])
    expect(out!.celestial).toBeUndefined()
  })
})

describe('applyMods — archive_walk', () => {
  it('returns null when archive_walk is present', () => {
    const out = applyMods(makeWalk(), [mkMod('archive_walk', {})])
    expect(out).toBeNull()
  })
})

describe('applyMods — empty mods', () => {
  it('returns the original walk when no mods apply', () => {
    const walk = makeWalk()
    const out = applyMods(walk, [])
    expect(out).toEqual(walk)
    expect(out!.isUserModified).not.toBe(true)
  })
})

describe('applyMods — replace_walk', () => {
  it('returns the payload walk with isUserModified=true', () => {
    const original = makeWalk()
    const replacement: Walk = { ...original, intention: 'completely new' }
    const out = applyMods(original, [mkMod('replace_walk', { walk: replacement })])
    expect(out).not.toBeNull()
    expect(out!.intention).toBe('completely new')
    expect(out!.isUserModified).toBe(true)
  })
})

import type { WalkPhoto, VoiceRecording, Pause, Activity } from '../../src/parsers/types'

function walkWithLists(): Walk {
  const w = makeWalk()
  w.photos = [
    { localIdentifier: 'p1', capturedAt: new Date(1_100_000), lat: 0, lng: 0, url: 'blob:1' },
    { localIdentifier: 'p2', capturedAt: new Date(1_200_000), lat: 0, lng: 0, url: 'blob:2' },
  ] as WalkPhoto[]
  w.voiceRecordings = [
    { startDate: new Date(1_100_000), endDate: new Date(1_120_000), duration: 20, transcription: 'hello' },
    { startDate: new Date(1_300_000), endDate: new Date(1_320_000), duration: 20, transcription: 'world' },
  ] as VoiceRecording[]
  w.pauses = [
    { startDate: new Date(1_400_000), endDate: new Date(1_460_000), type: 'manual' },
  ] as Pause[]
  w.activities = [
    { type: 'meditate', startDate: new Date(1_100_000), endDate: new Date(1_300_000) },
    { type: 'talk', startDate: new Date(1_300_000), endDate: new Date(1_320_000) },
  ] as Activity[]
  return w
}

describe('applyMods — list-item deletes', () => {
  it('delete_photo removes by localIdentifier', () => {
    const out = applyMods(walkWithLists(), [mkMod('delete_photo', { localIdentifier: 'p1' })])
    expect(out!.photos).toHaveLength(1)
    expect(out!.photos![0].localIdentifier).toBe('p2')
  })

  it('delete_voice_recording removes by epoch-seconds startDate', () => {
    const startSec = Math.floor(1_100_000 / 1000)  // 1100
    const out = applyMods(walkWithLists(), [mkMod('delete_voice_recording', { startDate: startSec })])
    expect(out!.voiceRecordings).toHaveLength(1)
    expect(out!.voiceRecordings[0].transcription).toBe('world')
  })

  it('delete_pause removes by epoch-seconds startDate', () => {
    const startSec = Math.floor(1_400_000 / 1000)  // 1400
    const out = applyMods(walkWithLists(), [mkMod('delete_pause', { startDate: startSec })])
    expect(out!.pauses).toHaveLength(0)
  })

  it('delete_activity removes by epoch-seconds startDate', () => {
    const startSec = Math.floor(1_100_000 / 1000)
    const out = applyMods(walkWithLists(), [mkMod('delete_activity', { startDate: startSec })])
    expect(out!.activities).toHaveLength(1)
    expect(out!.activities[0].type).toBe('talk')
  })

  it('multiple deletes are order-independent', () => {
    const w = walkWithLists()
    const a = applyMods(w, [
      mkMod('delete_photo', { localIdentifier: 'p1' }),
      mkMod('delete_photo', { localIdentifier: 'p2' }),
    ])
    const b = applyMods(w, [
      mkMod('delete_photo', { localIdentifier: 'p2' }),
      mkMod('delete_photo', { localIdentifier: 'p1' }),
    ])
    expect(a!.photos).toEqual(b!.photos)
    expect(a!.photos).toBeUndefined()
  })
})

describe('applyMods — edit_transcription', () => {
  it('replaces transcription text on the matching recording, preserves others', () => {
    const startSec = Math.floor(1_100_000 / 1000)
    const out = applyMods(walkWithLists(), [
      mkMod('edit_transcription', { recordingStartDate: startSec, text: 'corrected' }),
    ])
    expect(out!.voiceRecordings[0].transcription).toBe('corrected')
    expect(out!.voiceRecordings[1].transcription).toBe('world')
  })
})
