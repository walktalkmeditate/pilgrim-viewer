// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { buildPhotoMarkerElement, buildPhotoPopupContent } from '../../src/map/photo-marker'
import type { WalkPhoto } from '../../src/parsers/types'

const samplePhoto: WalkPhoto = {
  localIdentifier: 'test-id-1',
  capturedAt: new Date('2024-04-15T10:30:00Z'),
  lat: 42.87,
  lng: -8.51,
  url: 'blob:fake-url-1',
}

describe('buildPhotoMarkerElement', () => {
  it('returns a button element with photo-marker class', () => {
    // #when
    const el = buildPhotoMarkerElement(samplePhoto)

    // #then
    expect(el.tagName).toBe('BUTTON')
    expect(el.type).toBe('button')
    expect(el.className).toBe('photo-marker')
  })

  it('sets an aria-label that includes "Photo, captured"', () => {
    // #when
    const el = buildPhotoMarkerElement(samplePhoto)

    // #then
    const label = el.getAttribute('aria-label')
    expect(label).toMatch(/^Photo, captured /)
    expect(label).toMatch(/\d{4}/)
  })

  it('contains an img pointing at the photo URL', () => {
    // #when
    const el = buildPhotoMarkerElement(samplePhoto)

    // #then
    const img = el.querySelector('img')
    expect(img).not.toBeNull()
    expect(img!.src).toContain('blob:fake-url-1')
  })

  it('inner img is marked decorative (empty alt + role presentation)', () => {
    // #given — the <button> parent already carries the accessible label,
    // so the <img> is decorative to avoid a duplicate VoiceOver readout.

    // #when
    const el = buildPhotoMarkerElement(samplePhoto)

    // #then
    const img = el.querySelector('img')!
    expect(img.alt).toBe('')
    expect(img.getAttribute('role')).toBe('presentation')
  })

  it('img uses loading="lazy" so offscreen markers do not fetch eagerly', () => {
    // #when
    const el = buildPhotoMarkerElement(samplePhoto)

    // #then
    const img = el.querySelector('img')!
    expect(img.loading).toBe('lazy')
  })
})

describe('buildPhotoPopupContent', () => {
  it('returns a div with photo-popup class', () => {
    // #when
    const el = buildPhotoPopupContent(samplePhoto)

    // #then
    expect(el.tagName).toBe('DIV')
    expect(el.className).toBe('photo-popup')
  })

  it('contains a larger img with the photo URL and descriptive alt', () => {
    // #when
    const el = buildPhotoPopupContent(samplePhoto)

    // #then
    const img = el.querySelector('img')!
    expect(img.src).toContain('blob:fake-url-1')
    expect(img.alt).toMatch(/captured/i)
    expect(img.alt).toMatch(/\d{4}/)
  })

  it('contains a timestamp element inside .photo-popup-timestamp', () => {
    // #when
    const el = buildPhotoPopupContent(samplePhoto)

    // #then
    const ts = el.querySelector('.photo-popup-timestamp')
    expect(ts).not.toBeNull()
    expect(ts!.textContent).toMatch(/\d{4}/)
  })

  it('timestamp element is rendered after the img (visual order)', () => {
    // #when
    const el = buildPhotoPopupContent(samplePhoto)

    // #then — popup layout is image-first, caption-below; the test
    // locks that ordering so future changes don't silently reorder.
    const children = Array.from(el.children)
    expect(children[0].tagName).toBe('IMG')
    expect(children[1].className).toBe('photo-popup-timestamp')
  })
})
