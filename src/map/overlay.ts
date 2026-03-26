import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Walk, GeoJSONFeature } from '../parsers/types'
import { generateStatsText } from './export'
import { resolveWaypointIcon, getWaypointIconSvg } from './waypoint-icons'
import { createTerrainToggle } from './terrain'

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

  map.on('error', (e) => {
    const status = (e.error as Error & { status?: number }).status
    if (status === 401 || status === 403) {
      const msg = document.createElement('div')
      msg.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-family:var(--font-ui);font-size:0.875rem;color:var(--fog);text-align:center;'
      msg.textContent = 'Map failed to load. Check your Mapbox token.'
      container.style.position = 'relative'
      container.appendChild(msg)
    }
  })

  container.style.position = 'relative'
  const terrainCtrl = createTerrainToggle(map, container)

  const activeSourceIds: string[] = []
  const activeLayerIds: string[] = []
  const activeMarkers: mapboxgl.Marker[] = []
  const activeHandlers: Array<{ event: string; layer: string; handler: () => void }> = []
  let statsBar: HTMLElement | null = null
  let walkClickCallback: ((walk: Walk) => void) | null = null
  let currentWalks: Walk[] = []
  let pendingLoadHandler: (() => void) | null = null
  let currentColorMode: ColorMode = 'season'
  let selectedYear: number | null = null

  function removeSourcesAndLayers(): void {
    terrainCtrl.reset()
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
    for (const m of activeMarkers) m.remove()
    activeMarkers.length = 0
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

    const privacyMeters = parseInt(localStorage.getItem('pilgrim-viewer-privacy-meters') ?? '0', 10)
    const useFade = privacyMeters > 0

    map.addSource(sid, {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {},
      } as GeoJSON.Feature,
      ...(useFade ? { lineMetrics: true } : {}),
    })
    activeSourceIds.push(sid)

    const color = getWalkColor(walk, currentColorMode)

    if (useFade) {
      const r = parseInt(color.slice(1, 3), 16)
      const g = parseInt(color.slice(3, 5), 16)
      const b = parseInt(color.slice(5, 7), 16)
      const rgba0 = `rgba(${r},${g},${b},0)`
      const rgba30 = `rgba(${r},${g},${b},0.3)`

      map.addLayer({
        id: lid,
        type: 'line',
        source: sid,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-width': [
            'interpolate', ['linear'], ['line-progress'],
            0, 0.5, 0.08, DEFAULT_WIDTH, 0.92, DEFAULT_WIDTH, 1, 0.5,
          ] as any,
          'line-gradient': [
            'interpolate', ['linear'], ['line-progress'],
            0, rgba0,
            0.1, rgba30,
            0.15, color,
            0.85, color,
            0.9, rgba30,
            1, rgba0,
          ] as any,
        },
      })
    } else {
      map.addLayer({
        id: lid,
        type: 'line',
        source: sid,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': color,
          'line-width': DEFAULT_WIDTH,
          'line-opacity': DEFAULT_OPACITY,
        },
      })
    }
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

    const wpFeatures = walk.route.features.filter(
      (f): f is GeoJSONFeature => f.geometry.type === 'Point' && f.properties.markerType === 'waypoint',
    )

    if (wpFeatures.length >= 2) {
      const wpCoords = wpFeatures.map(f => f.geometry.coordinates as number[])
      const ejSid = `emotion-source-${index}`
      const ejLid = `emotion-layer-${index}`
      map.addSource(ejSid, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: wpCoords },
          properties: {},
        } as GeoJSON.Feature,
      })
      activeSourceIds.push(ejSid)
      map.addLayer({
        id: ejLid,
        type: 'line',
        source: ejSid,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#C4956A',
          'line-width': 1,
          'line-opacity': 0.2,
          'line-dasharray': [3, 4],
        },
      })
      activeLayerIds.push(ejLid)
    }

    for (const wp of wpFeatures) {
      const icon = resolveWaypointIcon(wp.properties.icon)
      const svgContent = getWaypointIconSvg(icon).replace(/currentColor/g, '#C4956A')

      const el = document.createElement('div')
      el.className = 'waypoint-marker waypoint-marker-overlay'
      el.replaceChildren()
      el.insertAdjacentHTML('afterbegin', svgContent)
      if (wp.properties.label) {
        const tip = document.createElement('span')
        tip.className = 'waypoint-tooltip'
        tip.textContent = wp.properties.label
        el.appendChild(tip)
      }

      const coords = wp.geometry.coordinates as [number, number]
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat(coords)
        .addTo(map)
      activeMarkers.push(marker)
    }
  }

  function fitToAllWalks(walks: Walk[]): void {
    const allCoords: number[][] = []
    for (const walk of walks) {
      for (const c of getAllCoords(walk)) allCoords.push(c)
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
    terrainCtrl.destroy()
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
