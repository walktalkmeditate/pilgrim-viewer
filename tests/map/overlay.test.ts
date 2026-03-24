import { describe, it, expect } from 'vitest'
import { getSeasonColor, getTimeOfDayColor, getWalkColor, getDominantTimeBucket } from '../../src/map/overlay'
import type { Walk } from '../../src/parsers/types'

describe('getSeasonColor', () => {
  it('returns winter blue for January', () => {
    // #given
    const date = new Date(2024, 0, 15)

    // #when
    const color = getSeasonColor(date)

    // #then
    expect(color).toBe('#6B8EAE')
  })

  it('returns winter blue for February', () => {
    // #given
    const date = new Date(2024, 1, 10)

    // #when
    const color = getSeasonColor(date)

    // #then
    expect(color).toBe('#6B8EAE')
  })

  it('returns spring moss for March', () => {
    // #given
    const date = new Date(2024, 2, 20)

    // #when
    const color = getSeasonColor(date)

    // #then
    expect(color).toBe('#7A8B6F')
  })

  it('returns spring moss for April', () => {
    // #given
    const date = new Date(2024, 3, 5)

    // #when
    const color = getSeasonColor(date)

    // #then
    expect(color).toBe('#7A8B6F')
  })

  it('returns spring moss for May', () => {
    // #given
    const date = new Date(2024, 4, 1)

    // #when
    const color = getSeasonColor(date)

    // #then
    expect(color).toBe('#7A8B6F')
  })

  it('returns summer dawn for June', () => {
    // #given
    const date = new Date(2024, 5, 21)

    // #when
    const color = getSeasonColor(date)

    // #then
    expect(color).toBe('#C4956A')
  })

  it('returns summer dawn for July', () => {
    // #given
    const date = new Date(2024, 6, 4)

    // #when
    const color = getSeasonColor(date)

    // #then
    expect(color).toBe('#C4956A')
  })

  it('returns summer dawn for August', () => {
    // #given
    const date = new Date(2024, 7, 15)

    // #when
    const color = getSeasonColor(date)

    // #then
    expect(color).toBe('#C4956A')
  })

  it('returns autumn rust for September', () => {
    // #given
    const date = new Date(2024, 8, 22)

    // #when
    const color = getSeasonColor(date)

    // #then
    expect(color).toBe('#A0634B')
  })

  it('returns autumn rust for October', () => {
    // #given
    const date = new Date(2024, 9, 31)

    // #when
    const color = getSeasonColor(date)

    // #then
    expect(color).toBe('#A0634B')
  })

  it('returns autumn rust for November', () => {
    // #given
    const date = new Date(2024, 10, 11)

    // #when
    const color = getSeasonColor(date)

    // #then
    expect(color).toBe('#A0634B')
  })

  it('returns winter blue for December', () => {
    // #given
    const date = new Date(2024, 11, 25)

    // #when
    const color = getSeasonColor(date)

    // #then
    expect(color).toBe('#6B8EAE')
  })
})

describe('getTimeOfDayColor', () => {
  it('returns dawn gold for 6am', () => {
    // #given
    const date = new Date(2024, 0, 15, 6, 0, 0)

    // #when
    const color = getTimeOfDayColor(date)

    // #then
    expect(color).toBe('#C4956A')
  })

  it('returns midday linen for 12pm', () => {
    // #given
    const date = new Date(2024, 0, 15, 12, 0, 0)

    // #when
    const color = getTimeOfDayColor(date)

    // #then
    expect(color).toBe('#E8E0D4')
  })

  it('returns dusk amber for 5pm', () => {
    // #given
    const date = new Date(2024, 0, 15, 17, 0, 0)

    // #when
    const color = getTimeOfDayColor(date)

    // #then
    expect(color).toBe('#D4874D')
  })

  it('returns night blue for 10pm', () => {
    // #given
    const date = new Date(2024, 0, 15, 22, 0, 0)

    // #when
    const color = getTimeOfDayColor(date)

    // #then
    expect(color).toBe('#6B8EAE')
  })

  it('returns dawn gold at 5am boundary', () => {
    // #given
    const date = new Date(2024, 0, 15, 5, 0, 0)

    // #when
    const color = getTimeOfDayColor(date)

    // #then
    expect(color).toBe('#C4956A')
  })

  it('returns night blue at 4am', () => {
    // #given
    const date = new Date(2024, 0, 15, 4, 0, 0)

    // #when
    const color = getTimeOfDayColor(date)

    // #then
    expect(color).toBe('#6B8EAE')
  })

  it('returns midday linen at 10am boundary', () => {
    // #given
    const date = new Date(2024, 0, 15, 10, 0, 0)

    // #when
    const color = getTimeOfDayColor(date)

    // #then
    expect(color).toBe('#E8E0D4')
  })

  it('returns dusk amber at 4pm boundary', () => {
    // #given
    const date = new Date(2024, 0, 15, 16, 0, 0)

    // #when
    const color = getTimeOfDayColor(date)

    // #then
    expect(color).toBe('#D4874D')
  })
})

describe('getWalkColor', () => {
  it('delegates to getSeasonColor in season mode', () => {
    // #given
    const walk = { startDate: new Date(2024, 2, 15, 9, 0, 0) } as Walk

    // #when
    const color = getWalkColor(walk, 'season')

    // #then
    expect(color).toBe('#7A8B6F')
  })

  it('delegates to getTimeOfDayColor in timeOfDay mode', () => {
    // #given
    const walk = { startDate: new Date(2024, 2, 15, 6, 0, 0) } as Walk

    // #when
    const color = getWalkColor(walk, 'timeOfDay')

    // #then
    expect(color).toBe('#C4956A')
  })
})

describe('getDominantTimeBucket', () => {
  it('returns mostly mornings when 3 morning walks beat 1 evening walk', () => {
    // #given
    const walks = [
      { startDate: new Date(2024, 0, 1, 7, 0, 0) } as Walk,
      { startDate: new Date(2024, 0, 2, 8, 0, 0) } as Walk,
      { startDate: new Date(2024, 0, 3, 6, 0, 0) } as Walk,
      { startDate: new Date(2024, 0, 4, 17, 0, 0) } as Walk,
    ]

    // #when
    const result = getDominantTimeBucket(walks)

    // #then
    expect(result).toBe('mostly mornings')
  })

  it('returns mostly mornings when morning and evening are tied (earlier wins)', () => {
    // #given
    const walks = [
      { startDate: new Date(2024, 0, 1, 7, 0, 0) } as Walk,
      { startDate: new Date(2024, 0, 2, 8, 0, 0) } as Walk,
      { startDate: new Date(2024, 0, 3, 17, 0, 0) } as Walk,
      { startDate: new Date(2024, 0, 4, 18, 0, 0) } as Walk,
    ]

    // #when
    const result = getDominantTimeBucket(walks)

    // #then
    expect(result).toBe('mostly mornings')
  })

  it('returns mostly middays for a single midday walk', () => {
    // #given
    const walks = [
      { startDate: new Date(2024, 0, 1, 13, 0, 0) } as Walk,
    ]

    // #when
    const result = getDominantTimeBucket(walks)

    // #then
    expect(result).toBe('mostly middays')
  })
})
