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

describe('createStaging — undo by id', () => {
  it('undo removes only the targeted mod', () => {
    const s = createStaging()
    const m1 = s.push(fakeMod('archive_walk', 'w1'))
    const m2 = s.push(fakeMod('archive_walk', 'w2'))
    expect(s.undo(m1.id)).toBe(true)
    expect(s.list()).toHaveLength(1)
    expect(s.list()[0].id).toBe(m2.id)
  })

  it('undo returns false for unknown id', () => {
    const s = createStaging()
    expect(s.undo('does-not-exist')).toBe(false)
  })
})

describe('createStaging — coalescence', () => {
  it('trim_route_start replaces previous trim for same walk', () => {
    const s = createStaging()
    s.push({ op: 'trim_route_start', walkId: 'w1', payload: { meters: 100 } })
    s.push({ op: 'trim_route_start', walkId: 'w1', payload: { meters: 250 } })
    expect(s.list()).toHaveLength(1)
    expect((s.list()[0].payload as { meters: number }).meters).toBe(250)
  })

  it('trim_route_start does not coalesce across walks', () => {
    const s = createStaging()
    s.push({ op: 'trim_route_start', walkId: 'w1', payload: { meters: 100 } })
    s.push({ op: 'trim_route_start', walkId: 'w2', payload: { meters: 200 } })
    expect(s.list()).toHaveLength(2)
  })

  it('edit_intention coalesces per walk', () => {
    const s = createStaging()
    s.push({ op: 'edit_intention', walkId: 'w1', payload: { text: 'one' } })
    s.push({ op: 'edit_intention', walkId: 'w1', payload: { text: 'two' } })
    expect(s.list()).toHaveLength(1)
    expect((s.list()[0].payload as { text: string }).text).toBe('two')
  })

  it('edit_transcription coalesces per (walk, recordingStartDate)', () => {
    const s = createStaging()
    s.push({ op: 'edit_transcription', walkId: 'w1', payload: { recordingStartDate: 1000, text: 'a' } })
    s.push({ op: 'edit_transcription', walkId: 'w1', payload: { recordingStartDate: 2000, text: 'b' } })
    s.push({ op: 'edit_transcription', walkId: 'w1', payload: { recordingStartDate: 1000, text: 'a-revised' } })
    const list = s.list()
    expect(list).toHaveLength(2)
    const r1 = list.find(m => (m.payload as { recordingStartDate: number }).recordingStartDate === 1000)
    expect((r1!.payload as { text: string }).text).toBe('a-revised')
  })

  it('delete_photo does not coalesce — multiple deletes accumulate', () => {
    const s = createStaging()
    s.push({ op: 'delete_photo', walkId: 'w1', payload: { localIdentifier: 'p1' } })
    s.push({ op: 'delete_photo', walkId: 'w1', payload: { localIdentifier: 'p2' } })
    expect(s.list()).toHaveLength(2)
  })
})
