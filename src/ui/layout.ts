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
import type { ColorMode } from '../map/overlay'

const GITHUB_URL = 'https://github.com/walktalkmeditate/pilgrim-viewer'
const PILGRIM_URL = 'https://pilgrimapp.org'

export interface LayoutResult {
  sidebar: HTMLElement
  mapContainer: HTMLElement
  overlayMapContainer: HTMLElement
  showFileLoaded: (source: 'pilgrim' | 'gpx', onFileSelected: (name: string, buffer: ArrayBuffer) => void) => void
}

export function createLayout(app: HTMLElement, onHomeClick?: () => void): LayoutResult {
  app.textContent = ''

  const header = document.createElement('header')
  header.className = 'app-header'

  const title = document.createElement('button')
  title.className = 'app-title'
  title.textContent = 'Pilgrim Viewer'
  title.addEventListener('click', () => {
    if (onHomeClick) onHomeClick()
  })

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
    onFileSelected: (name: string, buffer: ArrayBuffer) => void,
  ): void {
    openButton.classList.add('visible')

    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = '.pilgrim,.gpx'
    fileInput.className = 'dropzone-input'
    header.appendChild(fileInput)

    openButton.addEventListener('click', () => fileInput.click())
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          onFileSelected(file.name, reader.result)
        }
      }
      reader.readAsArrayBuffer(file)
    })

    if (source === 'pilgrim') {
      pilgrimBadge.classList.add('visible')
    }
  }

  return { sidebar: panelsContainer, mapContainer, overlayMapContainer, showFileLoaded }
}

function makeCollapsible(panel: HTMLElement): void {
  const heading = panel.querySelector<HTMLElement>('.panel-heading')
  if (!heading) return

  const chevron = document.createElement('span')
  chevron.className = 'panel-chevron'
  chevron.textContent = '▾'
  heading.appendChild(chevron)

  const content = document.createElement('div')
  content.className = 'panel-content'

  const children = Array.from(panel.childNodes).filter((node) => node !== heading)
  for (const child of children) {
    content.appendChild(child)
  }
  panel.appendChild(content)

  heading.addEventListener('click', () => {
    const isCollapsed = panel.classList.toggle('collapsed')
    chevron.textContent = isCollapsed ? '▸' : '▾'
  })
}

function makePanelsCollapsible(container: HTMLElement): void {
  const panels = container.querySelectorAll<HTMLElement>('.panel')
  for (const panel of panels) {
    makeCollapsible(panel)
  }
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

  makePanelsCollapsible(panelsContent)
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

    makePanelsCollapsible(panelsContent)

    if (options.onClearSelection) {
      const clearBtn = document.createElement('button')
      clearBtn.className = 'clear-selection'
      clearBtn.textContent = 'Clear selection'
      clearBtn.addEventListener('click', options.onClearSelection)
      panelsContent.appendChild(clearBtn)
    }
  }
}

export function renderColorSwitcher(
  container: HTMLElement,
  onChange: (mode: ColorMode) => void,
): { setMode: (mode: ColorMode) => void } {
  const wrapper = document.createElement('div')
  wrapper.className = 'color-switcher'

  const label = document.createElement('span')
  label.className = 'color-switcher-label'
  label.textContent = 'Color by'

  const seasonBtn = document.createElement('button')
  seasonBtn.className = 'color-switcher-option active'
  seasonBtn.textContent = 'Season'

  const timeBtn = document.createElement('button')
  timeBtn.className = 'color-switcher-option'
  timeBtn.textContent = 'Time of Day'

  function setMode(mode: ColorMode): void {
    seasonBtn.classList.toggle('active', mode === 'season')
    timeBtn.classList.toggle('active', mode === 'timeOfDay')
  }

  seasonBtn.addEventListener('click', () => { setMode('season'); onChange('season') })
  timeBtn.addEventListener('click', () => { setMode('timeOfDay'); onChange('timeOfDay') })

  wrapper.appendChild(label)
  wrapper.appendChild(seasonBtn)
  wrapper.appendChild(timeBtn)
  container.appendChild(wrapper)

  return { setMode }
}

export function renderExportButtons(
  container: HTMLElement,
  onExportStats: () => void,
  onExportClean: () => void,
): void {
  const wrapper = document.createElement('div')
  wrapper.className = 'export-buttons'

  const statsBtn = document.createElement('button')
  statsBtn.className = 'export-button'
  statsBtn.textContent = 'Export with stats'
  statsBtn.addEventListener('click', onExportStats)

  const cleanBtn = document.createElement('button')
  cleanBtn.className = 'export-button'
  cleanBtn.textContent = 'Export clean'
  cleanBtn.addEventListener('click', onExportClean)

  wrapper.appendChild(statsBtn)
  wrapper.appendChild(cleanBtn)
  container.appendChild(wrapper)
}

export function renderYearPicker(
  container: HTMLElement,
  walks: Walk[],
  onYearSelect: (year: number | null) => void,
): { setYear: (year: number | null) => void } {
  const years = [...new Set(walks.map((w) => w.startDate.getFullYear()))].sort()

  if (years.length <= 1) {
    if (years.length === 1) {
      const label = document.createElement('div')
      label.className = 'year-label'
      label.textContent = String(years[0])
      container.appendChild(label)
    }
    return { setYear: () => {} }
  }

  const wrapper = document.createElement('div')
  wrapper.className = 'year-picker'

  const heading = document.createElement('div')
  heading.className = 'year-picker-heading'
  heading.textContent = 'Year in Review'
  wrapper.appendChild(heading)

  const buttons: HTMLButtonElement[] = []
  let activeYear: number | null = null

  for (const year of years) {
    const btn = document.createElement('button')
    btn.className = 'year-picker-btn'
    btn.textContent = String(year)
    btn.addEventListener('click', () => {
      const newYear = year === activeYear ? null : year
      setYear(newYear)
      onYearSelect(newYear)
    })
    wrapper.appendChild(btn)
    buttons.push(btn)
  }

  const showAllBtn = document.createElement('button')
  showAllBtn.className = 'year-picker-btn year-picker-show-all'
  showAllBtn.textContent = 'Show all'
  showAllBtn.addEventListener('click', () => {
    setYear(null)
    onYearSelect(null)
  })
  wrapper.appendChild(showAllBtn)

  container.appendChild(wrapper)

  function setYear(year: number | null): void {
    activeYear = year
    for (const btn of buttons) {
      btn.classList.toggle('active', btn.textContent === String(year))
    }
    showAllBtn.classList.toggle('active', year === null)
  }

  setYear(null)

  return { setYear }
}
