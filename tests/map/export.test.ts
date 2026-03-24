import { describe, it, expect } from 'vitest'
import { generateFilename, generateStatsText } from '../../src/map/export'
import type { Walk } from '../../src/parsers/types'

describe('generateFilename', () => {
  it('returns base overlay filename for stats variant with no year', () => {
    // #given / #when
    const result = generateFilename('stats', null)

    // #then
    expect(result).toBe('pilgrim-overlay.png')
  })

  it('returns clean overlay filename for clean variant with no year', () => {
    // #given / #when
    const result = generateFilename('clean', null)

    // #then
    expect(result).toBe('pilgrim-overlay-clean.png')
  })

  it('returns year-scoped filename for stats variant with year', () => {
    // #given / #when
    const result = generateFilename('stats', 2026)

    // #then
    expect(result).toBe('pilgrim-2026.png')
  })

  it('returns year-scoped clean filename for clean variant with year', () => {
    // #given / #when
    const result = generateFilename('clean', 2026)

    // #then
    expect(result).toBe('pilgrim-2026-clean.png')
  })
})

describe('generateStatsText', () => {
  it('includes season count for season mode with no year', () => {
    // #given
    const walks = [
      { startDate: new Date(2026, 2, 10), stats: { distance: 5000 } } as Walk,
      { startDate: new Date(2026, 5, 15), stats: { distance: 4000 } } as Walk,
      { startDate: new Date(2026, 9, 20), stats: { distance: 6000 } } as Walk,
    ]

    // #when
    const result = generateStatsText(walks, 'season', null)

    // #then
    expect(result).toContain('3 seasons')
  })

  it('starts with year prefix for season mode with selected year', () => {
    // #given
    const walks = [
      { startDate: new Date(2026, 2, 10), stats: { distance: 5000 } } as Walk,
    ]

    // #when
    const result = generateStatsText(walks, 'season', 2026)

    // #then
    expect(result).toMatch(/^Your 2026/)
  })

  it('includes mostly mornings for timeOfDay mode with 3 morning walks', () => {
    // #given
    const walks = [
      { startDate: new Date(2026, 0, 1, 7, 0, 0), stats: { distance: 3000 } } as Walk,
      { startDate: new Date(2026, 0, 2, 8, 0, 0), stats: { distance: 4000 } } as Walk,
      { startDate: new Date(2026, 0, 3, 6, 30, 0), stats: { distance: 5000 } } as Walk,
    ]

    // #when
    const result = generateStatsText(walks, 'timeOfDay', null)

    // #then
    expect(result).toContain('mostly mornings')
  })

  it('uses singular season for a single walk', () => {
    // #given
    const walks = [
      { startDate: new Date(2026, 6, 15), stats: { distance: 4500 } } as Walk,
    ]

    // #when
    const result = generateStatsText(walks, 'season', null)

    // #then
    expect(result).toContain('1 season')
  })
})
