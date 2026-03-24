// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getMapboxToken, saveMapboxToken } from '../../src/map/token'

beforeEach(() => {
  localStorage.clear()
  vi.unstubAllEnvs()
})

describe('getMapboxToken', () => {
  it('returns env var when VITE_MAPBOX_TOKEN is set', () => {
    // #given
    vi.stubEnv('VITE_MAPBOX_TOKEN', 'pk.env-token')

    // #when
    const token = getMapboxToken()

    // #then
    expect(token).toBe('pk.env-token')
  })

  it('returns localStorage value when no env var', () => {
    // #given
    localStorage.setItem('pilgrim-viewer-mapbox-token', 'pk.stored-token')

    // #when
    const token = getMapboxToken()

    // #then
    expect(token).toBe('pk.stored-token')
  })

  it('returns null when neither source has a token', () => {
    // #when
    const token = getMapboxToken()

    // #then
    expect(token).toBeNull()
  })

  it('env var takes priority over localStorage', () => {
    // #given
    vi.stubEnv('VITE_MAPBOX_TOKEN', 'pk.env-token')
    localStorage.setItem('pilgrim-viewer-mapbox-token', 'pk.stored-token')

    // #when
    const token = getMapboxToken()

    // #then
    expect(token).toBe('pk.env-token')
  })
})

describe('saveMapboxToken', () => {
  it('stores token in localStorage and is retrievable by getMapboxToken', () => {
    // #given
    const token = 'pk.saved-token'

    // #when
    saveMapboxToken(token)

    // #then
    expect(getMapboxToken()).toBe('pk.saved-token')
  })
})
