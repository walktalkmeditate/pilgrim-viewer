// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderPhotosPanel } from '../../src/panels/photos'
import type { Walk, WalkPhoto } from '../../src/parsers/types'

function makePhoto(overrides: Partial<WalkPhoto> = {}): WalkPhoto {
  return {
    localIdentifier: 'id-1',
    capturedAt: new Date('2024-04-15T10:30:00Z'),
    lat: 42.87,
    lng: -8.51,
    url: 'blob:stub-1',
    ...overrides,
  }
}

function makeWalk(photos?: WalkPhoto[]): Walk {
  return {
    id: 'walk-1',
    startDate: new Date('2024-04-15T09:00:00Z'),
    endDate: new Date('2024-04-15T12:00:00Z'),
    stats: {
      distance: 5000,
      activeDuration: 3600,
      pauseDuration: 0,
      ascent: 0,
      descent: 0,
      talkDuration: 0,
      meditateDuration: 0,
    },
    route: { type: 'FeatureCollection', features: [] },
    voiceRecordings: [],
    activities: [],
    pauses: [],
    source: 'pilgrim',
    photos,
  }
}

describe('renderPhotosPanel', () => {
  it('self-hides when walk has no photos field', () => {
    // #given
    const container = document.createElement('div')
    const walk = makeWalk(undefined)
    const onSelect = vi.fn()

    // #when
    renderPhotosPanel(container, walk, onSelect)

    // #then — panel not mounted, container stays empty
    expect(container.children.length).toBe(0)
  })

  it('self-hides when walk.photos is an empty array', () => {
    // #given
    const container = document.createElement('div')
    const walk = makeWalk([])
    const onSelect = vi.fn()

    // #when
    renderPhotosPanel(container, walk, onSelect)

    // #then
    expect(container.children.length).toBe(0)
  })

  it('renders a panel with heading and grid when photos are present', () => {
    // #given
    const container = document.createElement('div')
    const walk = makeWalk([makePhoto()])
    const onSelect = vi.fn()

    // #when
    renderPhotosPanel(container, walk, onSelect)

    // #then
    const panel = container.querySelector('.panel.photos-panel')
    expect(panel).not.toBeNull()
    expect(panel!.querySelector('.panel-heading')!.textContent).toBe('Photos')
    const grid = panel!.querySelector('.photos-grid')
    expect(grid).not.toBeNull()
    expect(grid!.children.length).toBe(1)
  })

  it('renders one button per photo in walk order', () => {
    // #given — three photos, intentionally mixed ordering comes from
    // whatever the caller provides (parser already sorts by capturedAt)
    const container = document.createElement('div')
    const walk = makeWalk([
      makePhoto({ localIdentifier: 'A', url: 'blob:a' }),
      makePhoto({ localIdentifier: 'B', url: 'blob:b' }),
      makePhoto({ localIdentifier: 'C', url: 'blob:c' }),
    ])
    const onSelect = vi.fn()

    // #when
    renderPhotosPanel(container, walk, onSelect)

    // #then
    const buttons = container.querySelectorAll<HTMLButtonElement>('.photos-grid-item')
    expect(buttons).toHaveLength(3)
    const urls = Array.from(buttons).map(b => b.querySelector('img')!.src)
    expect(urls).toEqual([
      expect.stringContaining('blob:a'),
      expect.stringContaining('blob:b'),
      expect.stringContaining('blob:c'),
    ])
  })

  it('each thumbnail is a <button> with aria-label and decorative img', () => {
    // #given
    const container = document.createElement('div')
    const walk = makeWalk([makePhoto()])
    const onSelect = vi.fn()

    // #when
    renderPhotosPanel(container, walk, onSelect)

    // #then
    const button = container.querySelector<HTMLButtonElement>('.photos-grid-item')!
    expect(button.tagName).toBe('BUTTON')
    expect(button.type).toBe('button')
    expect(button.getAttribute('aria-label')).toMatch(/^Photo, captured /)
    expect(button.getAttribute('aria-label')).toMatch(/\d{4}/)

    const img = button.querySelector('img')!
    expect(img.alt).toBe('')
    expect(img.getAttribute('role')).toBe('presentation')
    expect(img.loading).toBe('lazy')
  })

  it('clicking a thumbnail fires onPhotoSelect with the matching photo', () => {
    // #given
    const container = document.createElement('div')
    const photoA = makePhoto({ localIdentifier: 'A', url: 'blob:a' })
    const photoB = makePhoto({ localIdentifier: 'B', url: 'blob:b' })
    const walk = makeWalk([photoA, photoB])
    const onSelect = vi.fn()

    // #when
    renderPhotosPanel(container, walk, onSelect)
    const buttons = container.querySelectorAll<HTMLButtonElement>('.photos-grid-item')
    buttons[1].click()

    // #then
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(photoB)
  })
})
