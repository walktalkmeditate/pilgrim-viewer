import { describe, it, expect, vi } from 'vitest'
import { createStaging } from '../../src/edit/staging'
import type { Modification } from '../../src/parsers/types'

function fakeMod(op: Modification['op'] = 'archive_walk', walkId = 'w1'): Omit<Modification, 'id' | 'at'> {
  return { op, walkId, payload: {} as Record<string, never> }
}

describe('createStaging', () => {
  it('starts empty', () => {
    // #when
    const s = createStaging()
    // #then
    expect(s.list()).toEqual([])
    expect(s.count()).toBe(0)
  })

  it('push assigns id + at and returns the stored mod', () => {
    // #when
    const s = createStaging()
    const stored = s.push(fakeMod('archive_walk', 'walk-1'))
    // #then
    expect(stored.id).toMatch(/^[0-9a-f-]+$/) // some uuid-ish string
    expect(typeof stored.at).toBe('number')
    expect(stored.op).toBe('archive_walk')
    expect(s.list()).toHaveLength(1)
    expect(s.count()).toBe(1)
  })

  it('clear empties the staging stack', () => {
    // #when
    const s = createStaging()
    s.push(fakeMod())
    s.push(fakeMod())
    s.clear()
    // #then
    expect(s.list()).toEqual([])
  })

  it('subscribe fires on push and clear', () => {
    // #when
    const s = createStaging()
    const listener = vi.fn()
    s.subscribe(listener)
    s.push(fakeMod())
    s.clear()
    // #then
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
