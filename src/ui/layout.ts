import type { Walk, PilgrimManifest } from '../parsers/types'
import { renderStatsPanel } from '../panels/stats'
import { renderElevationPanel } from '../panels/elevation'
import { renderTimelinePanel } from '../panels/timeline'
import { renderIntentionPanel } from '../panels/intention'
import { renderWeatherPanel } from '../panels/weather'
import { renderTranscriptionsPanel } from '../panels/transcriptions'
import { renderCelestialPanel } from '../panels/celestial'
import { formatDistance, formatDuration } from '../parsers/units'
import { getWalkColor } from '../map/overlay'
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

  const openButton = document.createElement('button')
  openButton.className = 'header-button'
  openButton.textContent = 'Open another file'

  header.appendChild(title)
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

  const footerLicense = document.createElement('a')
  footerLicense.href = GITHUB_URL
  footerLicense.textContent = 'MIT License'
  footerText.appendChild(footerLicense)

  footerText.appendChild(document.createTextNode(' · '))

  const footerGithub = document.createElement('a')
  footerGithub.href = GITHUB_URL
  footerGithub.textContent = 'GitHub'
  footerText.appendChild(footerGithub)

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

export function renderOverlaySidebar(
  sidebar: HTMLElement,
  walks: Walk[],
  options: {
    onBackToList?: () => void
    onClearSelection?: () => void
    onWalkClick?: (walk: Walk) => void
    selectedWalk?: Walk
    manifest?: PilgrimManifest
    colorMode?: ColorMode
  } = {},
): void {
  let panelsContent = sidebar.querySelector<HTMLElement>('.panels-content')
  if (!panelsContent) {
    panelsContent = document.createElement('div')
    panelsContent.className = 'panels-content'
    sidebar.appendChild(panelsContent)
  }

  panelsContent.textContent = ''

  const totalDist = walks.reduce((s, w) => s + w.stats.distance, 0)
  const totalDuration = walks.reduce((s, w) => s + w.stats.activeDuration, 0)
  const avgDist = walks.length > 0 ? totalDist / walks.length : 0
  const longestWalk = walks.reduce((max, w) => w.stats.distance > max ? w.stats.distance : max, 0)
  const earliestDate = walks.length > 0 ? walks.reduce((min, w) => w.startDate < min ? w.startDate : min, walks[0].startDate) : null
  const latestDate = walks.length > 0 ? walks.reduce((max, w) => w.startDate > max ? w.startDate : max, walks[0].startDate) : null

  const dateFmt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const dateRange = earliestDate && latestDate
    ? `${earliestDate.toLocaleDateString('en-US', dateFmt)} – ${latestDate.toLocaleDateString('en-US', dateFmt)}`
    : ''

  const statsGrid = document.createElement('div')
  statsGrid.className = 'overlay-stats-grid'

  const statEntries: Array<{ value: string; label: string }> = [
    { value: `${walks.length} ${walks.length === 1 ? 'walk' : 'walks'}`, label: 'count' },
    { value: formatDistance(totalDist), label: 'total distance' },
    { value: formatDuration(totalDuration), label: 'total time' },
    { value: dateRange, label: 'date range' },
    { value: formatDistance(avgDist), label: 'avg per walk' },
    { value: formatDistance(longestWalk), label: 'longest walk' },
  ]

  for (const entry of statEntries) {
    const cell = document.createElement('div')
    cell.className = 'overlay-stat-cell'

    const val = document.createElement('div')
    val.className = 'overlay-stat-value'
    val.textContent = entry.value

    const lbl = document.createElement('div')
    lbl.className = 'overlay-stat-label'
    lbl.textContent = entry.label

    cell.appendChild(val)
    cell.appendChild(lbl)
    statsGrid.appendChild(cell)
  }

  panelsContent.appendChild(statsGrid)

  const colorMode = options.colorMode ?? 'season'

  const legendItems: Array<{ color: string; label: string }> = colorMode === 'season'
    ? [
        { color: '#7A8B6F', label: 'spring' },
        { color: '#C4956A', label: 'summer' },
        { color: '#A0634B', label: 'autumn' },
        { color: '#6B8EAE', label: 'winter' },
      ]
    : [
        { color: '#C4956A', label: 'dawn' },
        { color: '#E8E0D4', label: 'midday' },
        { color: '#D4874D', label: 'dusk' },
        { color: '#6B8EAE', label: 'night' },
      ]

  const legend = document.createElement('div')
  legend.className = 'color-legend'

  for (const item of legendItems) {
    const el = document.createElement('div')
    el.className = 'color-legend-item'

    const dot = document.createElement('span')
    dot.className = 'color-legend-dot'
    dot.style.backgroundColor = item.color

    const lbl = document.createElement('span')
    lbl.textContent = item.label

    el.appendChild(dot)
    el.appendChild(lbl)
    legend.appendChild(el)
  }

  panelsContent.appendChild(legend)

  const timeline = document.createElement('div')
  timeline.className = 'overlay-timeline'

  for (const walk of walks) {
    const row = document.createElement('div')
    row.className = 'overlay-timeline-row'

    const dot = document.createElement('span')
    dot.className = 'overlay-timeline-dot'
    dot.style.backgroundColor = getWalkColor(walk, colorMode)

    const date = document.createElement('span')
    date.className = 'overlay-timeline-date'
    date.textContent = walk.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    const dist = document.createElement('span')
    dist.className = 'overlay-timeline-dist'
    dist.textContent = formatDistance(walk.stats.distance)

    row.appendChild(dot)
    row.appendChild(date)
    row.appendChild(dist)

    row.addEventListener('click', () => {
      if (options.onWalkClick) options.onWalkClick(walk)
    })

    timeline.appendChild(row)
  }

  panelsContent.appendChild(timeline)

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
      colorDot.style.backgroundColor = getWalkColor(options.selectedWalk, options.colorMode ?? 'season')
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
