import type { Walk, WalkPhoto } from '../parsers/types'

// Format a capture timestamp for the thumbnail's aria-label.
// Matches the convention used by photo-marker.ts.
function formatCapturedAt(date: Date): string {
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

// Builds a single thumbnail button for the photos grid. Pure DOM
// function so it can be unit-tested in jsdom. The button carries
// the accessible label and click handler; the inner <img> is
// decorative to avoid duplicate VoiceOver readouts.
function buildPhotoGridItem(
  photo: WalkPhoto,
  onSelect: (photo: WalkPhoto) => void,
): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'photos-grid-item'
  button.setAttribute('aria-label', `Photo, captured ${formatCapturedAt(photo.capturedAt)}`)
  button.addEventListener('click', () => onSelect(photo))

  const img = document.createElement('img')
  img.src = photo.url
  img.alt = ''
  img.setAttribute('role', 'presentation')
  img.loading = 'lazy'

  button.appendChild(img)
  return button
}

// Renders the Photos panel as a thumbnail grid inside `container`.
// Self-hides when the walk has no photos — callers don't need to
// check first, matching the pattern of renderWaypointsPanel.
// Tapping a thumbnail fires `onPhotoSelect(photo)`; the caller is
// expected to pan the map to the photo's coordinates so the user
// can see its marker (and tap it to open the expanded popup).
export function renderPhotosPanel(
  container: HTMLElement,
  walk: Walk,
  onPhotoSelect: (photo: WalkPhoto) => void,
): void {
  if (!walk.photos || walk.photos.length === 0) return

  const panel = document.createElement('div')
  panel.className = 'panel photos-panel'

  const heading = document.createElement('h3')
  heading.className = 'panel-heading'
  heading.textContent = 'Photos'
  panel.appendChild(heading)

  const grid = document.createElement('div')
  grid.className = 'photos-grid'

  for (const photo of walk.photos) {
    grid.appendChild(buildPhotoGridItem(photo, onPhotoSelect))
  }

  panel.appendChild(grid)
  container.appendChild(panel)
}
