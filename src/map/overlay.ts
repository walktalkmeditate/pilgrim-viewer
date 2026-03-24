import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Walk } from '../parsers/types'
import { generateStatsText } from './export'

const SEASON_COLORS: Record<string, string> = {
  spring: '#7A8B6F',
  summer: '#C4956A',
  autumn: '#A0634B',
  winter: '#6B8EAE',
}

const DEFAULT_OPACITY = 0.6
const DEFAULT_WIDTH = 1.5
const HIGHLIGHT_OPACITY = 1.0
const HIGHLIGHT_WIDTH = 3
const DIM_OPACITY = 0.3

export function getSeasonColor(date: Date): string {
  const month = date.getMonth()
  if (month >= 2 && month <= 4) return SEASON_COLORS.spring
  if (month >= 5 && month <= 7) return SEASON_COLORS.summer
  if (month >= 8 && month <= 10) return SEASON_COLORS.autumn
  return SEASON_COLORS.winter
}

export type ColorMode = 'season' | 'timeOfDay'

const TIME_COLORS = {
  dawn: '#C4956A',
  midday: '#E8E0D4',
  dusk: '#D4874D',
  night: '#6B8EAE',
}

const TIME_LABELS: Record<string, string> = {
  dawn: 'mornings',
  midday: 'middays',
  dusk: 'evenings',
  night: 'nights',
}

export function getTimeOfDayColor(date: Date): string {
  const hour = date.getHours()
  if (hour >= 5 && hour < 10) return TIME_COLORS.dawn
  if (hour >= 10 && hour < 16) return TIME_COLORS.midday
  if (hour >= 16 && hour < 20) return TIME_COLORS.dusk
  return TIME_COLORS.night
}

function getTimeBucket(date: Date): string {
  const hour = date.getHours()
  if (hour >= 5 && hour < 10) return 'dawn'
  if (hour >= 10 && hour < 16) return 'midday'
  if (hour >= 16 && hour < 20) return 'dusk'
  return 'night'
}

export function getWalkColor(walk: Walk, mode: ColorMode): string {
  return mode === 'timeOfDay' ? getTimeOfDayColor(walk.startDate) : getSeasonColor(walk.startDate)
}

export function getDominantTimeBucket(walks: Walk[]): string {
  const counts: Record<string, number> = { dawn: 0, midday: 0, dusk: 0, night: 0 }
  for (const walk of walks) counts[getTimeBucket(walk.startDate)]++
  const order = ['dawn', 'midday', 'dusk', 'night']
  let best = order[0]
  for (const bucket of order) {
    if (counts[bucket] > counts[best]) best = bucket
  }
  return `mostly ${TIME_LABELS[best]}`
}

function sourceId(index: number): string {
  return `overlay-source-${index}`
}

function layerId(index: number): string {
  return `overlay-layer-${index}`
}

export interface OverlayRenderer {
  showAllWalks(walks: Walk[]): void
  highlightWalk(walk: Walk): void
  clearSelection(): void
  clear(): void
  remove(): void
  getMap(): mapboxgl.Map
  onWalkClick(callback: (walk: Walk) => void): void
  setColorMode(mode: ColorMode): void
  setSelectedYear(year: number | null): void
  getStatsText(): string
}

export function createOverlayRenderer(
  container: HTMLElement,
  token: string,
): OverlayRenderer {
  mapboxgl.accessToken = token

  const map = new mapboxgl.Map({
    container,
    style: 'mapbox://styles/mapbox/dark-v11',
    preserveDrawingBuffer: true,
    center: [0, 20],
    zoom: 1,
  })

  const activeSourceIds: string[] = []
  const activeLayerIds: string[] = []
  const activeHandlers: Array<{ event: string; layer: string; handler: () => void }> = []
  let statsBar: HTMLElement | null = null
  let walkClickCallback: ((walk: Walk) => void) | null = null
  let currentWalks: Walk[] = []
  let pendingLoadHandler: (() => void) | null = null
  let currentColorMode: ColorMode = 'season'
  let selectedYear: number | null = null

  function removeSourcesAndLayers(): void {
    for (const { event, layer, handler } of activeHandlers) {
      map.off(event as 'click', layer, handler)
    }
    activeHandlers.length = 0
    for (const id of activeLayerIds) {
      if (map.getLayer(id)) map.removeLayer(id)
    }
    for (const id of activeSourceIds) {
      if (map.getSource(id)) map.removeSource(id)
    }
    activeLayerIds.length = 0
    activeSourceIds.length = 0
  }

  function removeStatsBar(): void {
    if (statsBar) {
      statsBar.remove()
      statsBar = null
    }
  }

  function createStatsBar(walks: Walk[]): void {
    removeStatsBar()
    const bar = document.createElement('div')
    bar.className = 'overlay-stats'
    bar.textContent = generateStatsText(walks, currentColorMode, selectedYear)
    container.appendChild(bar)
    statsBar = bar
  }

  function getAllCoords(walk: Walk): number[][] {
    const lineFeatures = walk.route.features.filter(
      (f) => f.geometry.type === 'LineString',
    )
    if (lineFeatures.length === 0) return []
    return lineFeatures[0].geometry.coordinates as number[][]
  }

  function addWalkLayer(walk: Walk, index: number): void {
    const coords = getAllCoords(walk)
    if (coords.length === 0) return

    const sid = sourceId(index)
    const lid = layerId(index)

    map.addSource(sid, {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {},
      } as GeoJSON.Feature,
    })
    activeSourceIds.push(sid)

    map.addLayer({
      id: lid,
      type: 'line',
      source: sid,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': getWalkColor(walk, currentColorMode),
        'line-width': DEFAULT_WIDTH,
        'line-opacity': DEFAULT_OPACITY,
      },
    })
    activeLayerIds.push(lid)

    const clickHandler = () => { if (walkClickCallback) walkClickCallback(walk) }
    const enterHandler = () => { map.getCanvas().style.cursor = 'pointer' }
    const leaveHandler = () => { map.getCanvas().style.cursor = '' }

    map.on('click', lid, clickHandler)
    map.on('mouseenter', lid, enterHandler)
    map.on('mouseleave', lid, leaveHandler)

    activeHandlers.push(
      { event: 'click', layer: lid, handler: clickHandler },
      { event: 'mouseenter', layer: lid, handler: enterHandler },
      { event: 'mouseleave', layer: lid, handler: leaveHandler },
    )
  }

  function fitToAllWalks(walks: Walk[]): void {
    const allCoords: number[][] = []
    for (const walk of walks) {
      allCoords.push(...getAllCoords(walk))
    }
    if (allCoords.length === 0) return

    const bounds = allCoords.reduce(
      (b, coord) => b.extend(coord as [number, number]),
      new mapboxgl.LngLatBounds(
        allCoords[0] as [number, number],
        allCoords[0] as [number, number],
      ),
    )
    map.fitBounds(bounds, { padding: 50 })
  }

  function showAllWalks(walks: Walk[]): void {
    currentWalks = walks

    const render = (): void => {
      removeSourcesAndLayers()

      walks.forEach((walk, index) => {
        addWalkLayer(walk, index)
      })

      fitToAllWalks(walks)
      createStatsBar(walks)
    }

    if (pendingLoadHandler) {
      map.off('load', pendingLoadHandler)
      pendingLoadHandler = null
    }

    if (map.isStyleLoaded()) {
      render()
    } else {
      pendingLoadHandler = render
      map.once('load', () => {
        pendingLoadHandler = null
        render()
      })
    }
  }

  function highlightWalk(walk: Walk): void {
    const walkIndex = currentWalks.indexOf(walk)

    for (let i = 0; i < currentWalks.length; i++) {
      const lid = layerId(i)
      if (!map.getLayer(lid)) continue

      if (i === walkIndex) {
        map.setPaintProperty(lid, 'line-opacity', HIGHLIGHT_OPACITY)
        map.setPaintProperty(lid, 'line-width', HIGHLIGHT_WIDTH)
      } else {
        map.setPaintProperty(lid, 'line-opacity', DIM_OPACITY)
        map.setPaintProperty(lid, 'line-width', DEFAULT_WIDTH)
      }
    }
  }

  function clearSelection(): void {
    for (let i = 0; i < currentWalks.length; i++) {
      const lid = layerId(i)
      if (!map.getLayer(lid)) continue

      map.setPaintProperty(lid, 'line-opacity', DEFAULT_OPACITY)
      map.setPaintProperty(lid, 'line-width', DEFAULT_WIDTH)
    }
  }

  function clear(): void {
    removeSourcesAndLayers()
    removeStatsBar()
    currentWalks = []
  }

  function remove(): void {
    clear()
    map.remove()
  }

  function onWalkClick(callback: (walk: Walk) => void): void {
    walkClickCallback = callback
  }

  function setColorMode(mode: ColorMode): void {
    currentColorMode = mode
    for (let i = 0; i < currentWalks.length; i++) {
      const lid = layerId(i)
      if (!map.getLayer(lid)) continue
      map.setPaintProperty(lid, 'line-color', getWalkColor(currentWalks[i], mode))
    }
    createStatsBar(currentWalks)
  }

  function setSelectedYear(year: number | null): void {
    selectedYear = year
    createStatsBar(currentWalks)
  }

  function getStatsText(): string {
    return generateStatsText(currentWalks, currentColorMode, selectedYear)
  }

  return {
    showAllWalks,
    highlightWalk,
    clearSelection,
    clear,
    remove,
    getMap: () => map,
    onWalkClick,
    setColorMode,
    setSelectedYear,
    getStatsText,
  }
}
