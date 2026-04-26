import { describe, it, expect } from 'vitest'
import { walkToArchived } from '../../src/edit/archive'
import type { Walk } from '../../src/parsers/types'

function makeWalk(): Walk {
  return {
    id: 'walk-id-1',
    startDate: new Date(1_700_000_000_000),  // ms
    endDate:   new Date(1_700_000_600_000),  // +600s
    stats: {
      distance: 5432.1, activeDuration: 540, pauseDuration: 60,
      ascent: 45.2, descent: 38.1, steps: 7200, burnedEnergy: 320,
      talkDuration: 180, meditateDuration: 300,
    },
    route: { type: 'FeatureCollection', features: [] },
    voiceRecordings: [], activities: [], pauses: [],
    source: 'pilgrim',
    intention: 'walk with gratitude',
    favicon: 'flame',
  }
}

describe('walkToArchived', () => {
  it('keeps only skeletal fields; drops route, intention, favicon, etc.', () => {
    const archivedAt = 1_745_000_000  // epoch seconds
    const archived = walkToArchived(makeWalk(), archivedAt)

    expect(archived.id).toBe('walk-id-1')
    expect(archived.archivedAt).toBe(archivedAt)
    expect(archived.startDate).toBe(1_700_000_000)  // seconds
    expect(archived.endDate).toBe(1_700_000_600)
    expect(archived.stats.distance).toBe(5432.1)
    expect(archived.stats.activeDuration).toBe(540)
    expect(archived.stats.talkDuration).toBe(180)
    expect(archived.stats.meditateDuration).toBe(300)
    expect(archived.stats.steps).toBe(7200)

    expect((archived as unknown as Record<string, unknown>).route).toBeUndefined()
    expect((archived as unknown as Record<string, unknown>).intention).toBeUndefined()
    expect((archived as unknown as Record<string, unknown>).favicon).toBeUndefined()
    expect((archived.stats as unknown as Record<string, unknown>).ascent).toBeUndefined()
    expect((archived.stats as unknown as Record<string, unknown>).burnedEnergy).toBeUndefined()
  })

  it('omits steps if walk had no steps', () => {
    const walk = makeWalk()
    walk.stats.steps = undefined
    const archived = walkToArchived(walk, 1)
    expect(archived.stats.steps).toBeUndefined()
  })
})
