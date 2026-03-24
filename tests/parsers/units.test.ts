import { describe, it, expect } from 'vitest'
import { formatDistance, formatDuration, formatElevation, formatSpeed } from '../../src/parsers/units'

describe('formatDistance', () => {
  it('formats meters to km for metric when >= 1000m', () => {
    expect(formatDistance(5432.1, 'metric')).toBe('5.43 km')
  })

  it('formats meters to miles for imperial', () => {
    expect(formatDistance(5432.1, 'imperial')).toBe('3.38 mi')
  })

  it('stays in meters for metric when < 1000m', () => {
    expect(formatDistance(500, 'metric')).toBe('500 m')
  })

  it('always uses miles for imperial regardless of distance', () => {
    expect(formatDistance(500, 'imperial')).toBe('0.31 mi')
  })
})

describe('formatDuration', () => {
  it('formats exactly 1 hour', () => {
    expect(formatDuration(3600)).toBe('1h 0m')
  })

  it('formats 90 seconds as minutes and seconds', () => {
    expect(formatDuration(90)).toBe('1m 30s')
  })

  it('formats hours and minutes for > 1 hour', () => {
    expect(formatDuration(7265)).toBe('2h 1m')
  })

  it('formats seconds only when under 1 minute', () => {
    expect(formatDuration(45)).toBe('0m 45s')
  })
})

describe('formatElevation', () => {
  it('rounds to integer meters for metric', () => {
    expect(formatElevation(45.2, 'metric')).toBe('45 m')
  })

  it('converts to feet for imperial', () => {
    expect(formatElevation(45.2, 'imperial')).toBe('148 ft')
  })
})

describe('formatSpeed', () => {
  it('formats pace per km for metric', () => {
    expect(formatSpeed(5000, 1800, 'metric')).toBe('6:00 /km')
  })

  it('formats pace per mile for imperial', () => {
    expect(formatSpeed(5000, 1800, 'imperial')).toBe('9:39 /mi')
  })

  it('returns -- when seconds is 0', () => {
    expect(formatSpeed(5000, 0, 'metric')).toBe('--')
  })

  it('returns -- when meters is 0', () => {
    expect(formatSpeed(0, 1800, 'metric')).toBe('--')
  })
})
