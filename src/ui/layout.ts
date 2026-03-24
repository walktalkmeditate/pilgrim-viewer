import type { Walk, PilgrimManifest } from '../parsers/types'
import { renderStatsPanel } from '../panels/stats'
import { renderElevationPanel } from '../panels/elevation'
import { renderTimelinePanel } from '../panels/timeline'
import { renderIntentionPanel } from '../panels/intention'
import { renderWeatherPanel } from '../panels/weather'
import { renderTranscriptionsPanel } from '../panels/transcriptions'
import { renderCelestialPanel } from '../panels/celestial'

const GITHUB_URL = 'https://github.com/walktalkmeditate/pilgrim-viewer'
const PILGRIM_URL = 'https://pilgrimapp.org'

export interface LayoutResult {
  sidebar: HTMLElement
  mapContainer: HTMLElement
  showFileLoaded: (source: 'pilgrim' | 'gpx', openFilePicker: () => void) => void
}

export function createLayout(app: HTMLElement): LayoutResult {
  app.textContent = ''

  const header = document.createElement('header')
  header.className = 'app-header'

  const title = document.createElement('h1')
  title.className = 'app-title'
  title.textContent = 'Pilgrim Viewer'

  const githubLink = document.createElement('a')
  githubLink.className = 'app-github-link'
  githubLink.href = GITHUB_URL
  githubLink.textContent = 'GitHub'

  const openButton = document.createElement('button')
  openButton.className = 'header-button'
  openButton.textContent = 'Open another file'

  header.appendChild(title)
  header.appendChild(githubLink)
  header.appendChild(openButton)

  const layout = document.createElement('div')
  layout.className = 'app-layout'

  const sidebar = document.createElement('div')
  sidebar.className = 'sidebar'

  const panelsContainer = document.createElement('div')
  panelsContainer.className = 'panels-container'

  const footer = document.createElement('footer')
  footer.className = 'app-footer'

  const footerText = document.createElement('p')
  footerText.className = 'app-footer-text'
  footerText.textContent = 'Open source · '

  const footerLink = document.createElement('a')
  footerLink.href = GITHUB_URL
  footerLink.textContent = 'MIT License'
  footerText.appendChild(footerLink)

  const pilgrimBadge = document.createElement('div')
  pilgrimBadge.className = 'pilgrim-badge'

  const badgeText = document.createTextNode('Recorded with ')
  const badgeLink = document.createElement('a')
  badgeLink.href = PILGRIM_URL
  badgeLink.textContent = 'Pilgrim'

  pilgrimBadge.appendChild(badgeText)
  pilgrimBadge.appendChild(badgeLink)

  footer.appendChild(footerText)
  footer.appendChild(pilgrimBadge)

  sidebar.appendChild(panelsContainer)
  sidebar.appendChild(footer)

  const mapContainer = document.createElement('div')
  mapContainer.className = 'map-container'

  layout.appendChild(sidebar)
  layout.appendChild(mapContainer)

  app.appendChild(header)
  app.appendChild(layout)

  function showFileLoaded(
    source: 'pilgrim' | 'gpx',
    openFilePicker: () => void,
  ): void {
    openButton.classList.add('visible')
    openButton.addEventListener('click', () => openFilePicker())

    if (source === 'pilgrim') {
      pilgrimBadge.classList.add('visible')
    }
  }

  return { sidebar: panelsContainer, mapContainer, showFileLoaded }
}

export function renderPanels(
  sidebar: HTMLElement,
  walk: Walk,
  manifest?: PilgrimManifest,
): void {
  sidebar.textContent = ''

  renderStatsPanel(sidebar, walk, manifest?.preferences)
  renderElevationPanel(sidebar, walk)
  renderTimelinePanel(sidebar, walk)
  renderIntentionPanel(sidebar, walk)
  renderWeatherPanel(sidebar, walk)
  renderTranscriptionsPanel(sidebar, walk)
  renderCelestialPanel(sidebar, walk)
}
