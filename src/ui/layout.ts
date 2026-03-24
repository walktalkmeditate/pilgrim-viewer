import type { Walk, PilgrimManifest } from '../parsers/types'
import { renderStatsPanel } from '../panels/stats'
import { renderElevationPanel } from '../panels/elevation'
import { renderTimelinePanel } from '../panels/timeline'
import { renderIntentionPanel } from '../panels/intention'
import { renderWeatherPanel } from '../panels/weather'
import { renderTranscriptionsPanel } from '../panels/transcriptions'
import { renderCelestialPanel } from '../panels/celestial'
import { formatDistance } from '../parsers/units'
import { getSeasonColor } from '../map/overlay'

const GITHUB_URL = 'https://github.com/walktalkmeditate/pilgrim-viewer'
const PILGRIM_URL = 'https://pilgrimapp.org'

export interface LayoutResult {
  sidebar: HTMLElement
  mapContainer: HTMLElement
  overlayMapContainer: HTMLElement
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

  const overlayMapContainer = document.createElement('div')
  overlayMapContainer.className = 'map-container overlay-map-container'
  overlayMapContainer.style.display = 'none'

  layout.appendChild(sidebar)
  layout.appendChild(mapContainer)
  layout.appendChild(overlayMapContainer)

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

  return { sidebar: panelsContainer, mapContainer, overlayMapContainer, showFileLoaded }
}

export function renderPanels(
  sidebar: HTMLElement,
  walk: Walk,
  manifest?: PilgrimManifest,
): void {
  let panelsContent = sidebar.querySelector<HTMLElement>('.panels-content')
  if (!panelsContent) {
    panelsContent = document.createElement('div')
    panelsContent.className = 'panels-content'
    sidebar.appendChild(panelsContent)
  }

  panelsContent.textContent = ''

  renderStatsPanel(panelsContent, walk, manifest?.preferences)
  renderElevationPanel(panelsContent, walk)
  renderTimelinePanel(panelsContent, walk)
  renderIntentionPanel(panelsContent, walk)
  renderWeatherPanel(panelsContent, walk)
  renderTranscriptionsPanel(panelsContent, walk)
  renderCelestialPanel(panelsContent, walk)
}

export interface ModeToggleResult {
  setMode: (mode: 'list' | 'overlay') => void
}

export function renderModeToggle(
  container: HTMLElement,
  onToggle: (mode: 'list' | 'overlay') => void,
): ModeToggleResult {
  const toggle = document.createElement('div')
  toggle.className = 'mode-toggle'

  const listBtn = document.createElement('button')
  listBtn.className = 'mode-toggle-option active'
  listBtn.textContent = 'List'

  const overlayBtn = document.createElement('button')
  overlayBtn.className = 'mode-toggle-option'
  overlayBtn.textContent = 'Overlay'

  listBtn.addEventListener('click', () => {
    setMode('list')
    onToggle('list')
  })

  overlayBtn.addEventListener('click', () => {
    setMode('overlay')
    onToggle('overlay')
  })

  toggle.appendChild(listBtn)
  toggle.appendChild(overlayBtn)

  container.insertBefore(toggle, container.firstChild)

  function setMode(mode: 'list' | 'overlay'): void {
    listBtn.classList.toggle('active', mode === 'list')
    overlayBtn.classList.toggle('active', mode === 'overlay')
  }

  return { setMode }
}

function countUniqueSeasons(walks: Walk[]): number {
  const seasons = new Set<string>()
  for (const walk of walks) {
    const month = walk.startDate.getMonth()
    if (month >= 2 && month <= 4) seasons.add('spring')
    else if (month >= 5 && month <= 7) seasons.add('summer')
    else if (month >= 8 && month <= 10) seasons.add('autumn')
    else seasons.add('winter')
  }
  return seasons.size
}

export function renderOverlaySidebar(
  sidebar: HTMLElement,
  walks: Walk[],
  options: {
    onBackToList?: () => void
    onClearSelection?: () => void
    selectedWalk?: Walk
    manifest?: PilgrimManifest
  } = {},
): void {
  let panelsContent = sidebar.querySelector<HTMLElement>('.panels-content')
  if (!panelsContent) {
    panelsContent = document.createElement('div')
    panelsContent.className = 'panels-content'
    sidebar.appendChild(panelsContent)
  }

  panelsContent.textContent = ''

  const aggregate = document.createElement('div')
  aggregate.className = 'overlay-aggregate'

  const totalDistance = walks.reduce((sum, w) => sum + w.stats.distance, 0)
  const seasonCount = countUniqueSeasons(walks)

  const walkStat = document.createElement('div')
  walkStat.className = 'overlay-aggregate-stat'
  walkStat.textContent = String(walks.length)

  const walkLabel = document.createElement('div')
  walkLabel.className = 'overlay-aggregate-label'
  walkLabel.textContent = walks.length === 1 ? 'walk' : 'walks'

  const distStat = document.createElement('div')
  distStat.className = 'overlay-aggregate-stat'
  distStat.textContent = formatDistance(totalDistance)

  const distLabel = document.createElement('div')
  distLabel.className = 'overlay-aggregate-label'
  distLabel.textContent = 'total distance'

  const seasonStat = document.createElement('div')
  seasonStat.className = 'overlay-aggregate-stat'
  seasonStat.textContent = String(seasonCount)

  const seasonLabel = document.createElement('div')
  seasonLabel.className = 'overlay-aggregate-label'
  seasonLabel.textContent = seasonCount === 1 ? 'season' : 'seasons'

  aggregate.appendChild(walkStat)
  aggregate.appendChild(walkLabel)
  aggregate.appendChild(distStat)
  aggregate.appendChild(distLabel)
  aggregate.appendChild(seasonStat)
  aggregate.appendChild(seasonLabel)

  panelsContent.appendChild(aggregate)

  if (options.selectedWalk) {
    if (options.onBackToList) {
      const backBtn = document.createElement('button')
      backBtn.className = 'back-to-list'

      const walkDate = options.selectedWalk.startDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })

      const colorDot = document.createElement('span')
      colorDot.className = 'breakdown-dot'
      colorDot.style.backgroundColor = getSeasonColor(options.selectedWalk.startDate)
      colorDot.style.display = 'inline-block'
      colorDot.style.marginRight = '0.375rem'
      colorDot.style.verticalAlign = 'middle'

      backBtn.appendChild(colorDot)
      backBtn.appendChild(document.createTextNode(walkDate))

      backBtn.addEventListener('click', options.onBackToList)
      panelsContent.appendChild(backBtn)
    }

    renderStatsPanel(panelsContent, options.selectedWalk, options.manifest?.preferences)
    renderElevationPanel(panelsContent, options.selectedWalk)
    renderTimelinePanel(panelsContent, options.selectedWalk)
    renderIntentionPanel(panelsContent, options.selectedWalk)
    renderWeatherPanel(panelsContent, options.selectedWalk)
    renderTranscriptionsPanel(panelsContent, options.selectedWalk)
    renderCelestialPanel(panelsContent, options.selectedWalk)

    if (options.onClearSelection) {
      const clearBtn = document.createElement('button')
      clearBtn.className = 'clear-selection'
      clearBtn.textContent = 'Clear selection'
      clearBtn.addEventListener('click', options.onClearSelection)
      panelsContent.appendChild(clearBtn)
    }
  }
}
