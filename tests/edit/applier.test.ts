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
