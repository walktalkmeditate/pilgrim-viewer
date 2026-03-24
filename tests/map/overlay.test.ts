import { describe, it, expect } from 'vitest'
import { getSeasonColor } from '../../src/map/overlay'

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
