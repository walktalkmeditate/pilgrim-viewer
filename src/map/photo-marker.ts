import mapboxgl from 'mapbox-gl'
import type { WalkPhoto } from '../parsers/types'

// Format a capture timestamp for the marker's aria-label and popup
// caption. Uses the viewer's locale to stay consistent with other
// date formatting in the app.
function formatCapturedAt(date: Date): string {
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

// Builds the DOM element for a photo waypoint marker. Circular
// thumbnail wrapped in a <button> so VoiceOver/keyboard users get
// focus and Enter/Space activation. Pure function — no Mapbox
// dependency so it's easy to unit-test with jsdom.
export function buildPhotoMarkerElement(photo: WalkPhoto): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'photo-marker'
  button.setAttribute('aria-label', `Photo, captured ${formatCapturedAt(photo.capturedAt)}`)

  const img = document.createElement('img')
  img.src = photo.url
  img.alt = ''
  img.setAttribute('role', 'presentation')
  img.loading = 'lazy'

  button.appendChild(img)
  return button
}

// Builds the popup content shown when a photo marker is tapped —
// larger image + capture timestamp caption. Returned as an element
// so Mapbox's `Popup.setDOMContent` can mount it directly.
export function buildPhotoPopupContent(photo: WalkPhoto): HTMLElement {
  const container = document.createElement('div')
  container.className = 'photo-popup'

  const img = document.createElement('img')
  img.src = photo.url
  img.alt = `Photo captured ${formatCapturedAt(photo.capturedAt)}`

  const timestamp = document.createElement('div')
  timestamp.className = 'photo-popup-timestamp'
  timestamp.textContent = formatCapturedAt(photo.capturedAt)

  container.appendChild(img)
  container.appendChild(timestamp)
  return container
}

// Creates a Mapbox marker at `photo.lng/lat` whose click toggles a
// popup with the expanded photo. The returned marker should be
// tracked by the caller (renderer.ts) so it can be torn down during
// map clear alongside the other annotations.
export function createPhotoMarker(photo: WalkPhoto, map: mapboxgl.Map): mapboxgl.Marker {
  const element = buildPhotoMarkerElement(photo)
  const popup = new mapboxgl.Popup({ offset: 28, closeButton: true, maxWidth: '280px' })
    .setDOMContent(buildPhotoPopupContent(photo))

  return new mapboxgl.Marker({ element, anchor: 'center' })
    .setLngLat([photo.lng, photo.lat])
    .setPopup(popup)
    .addTo(map)
}
