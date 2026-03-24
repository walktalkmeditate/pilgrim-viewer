import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Walk } from '../parsers/types'
import { formatDistance } from '../parsers/units'

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

function getSeasonName(date: Date): string {
  const month = date.getMonth()
  if (month >= 2 && month <= 4) return 'spring'
  if (month >= 5 && month <= 7) return 'summer'
  if (month >= 8 && month <= 10) return 'autumn'
  return 'winter'
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
  getMap(): mapboxgl.Map
  onWalkClick(callback: (walk: Walk) => void): void
}

export function createOverlayRenderer(
  container: HTMLElement,
  token: string,
): OverlayRenderer {
  mapboxgl.accessToken = token

  const map = new mapboxgl.Map({
    container,
    style: 'mapbox://styles/mapbox/dark-v11',
  })

  const activeSourceIds: string[] = []
  const activeLayerIds: string[] = []
  let statsBar: HTMLElement | null = null
  let walkClickCallback: ((walk: Walk) => void) | null = null
  let currentWalks: Walk[] = []

  function removeSourcesAndLayers(): void {
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

  function countSeasons(walks: Walk[]): number {
    const seasons = new Set(walks.map((w) => getSeasonName(w.startDate)))
    return seasons.size
  }

  function totalDistanceKm(walks: Walk[]): number {
    return walks.reduce((sum, w) => sum + w.stats.distance, 0)
  }

  function createStatsBar(walks: Walk[]): void {
    removeStatsBar()

    const bar = document.createElement('div')
    bar.className = 'overlay-stats'

    const walkCount = walks.length
    const distance = formatDistance(totalDistanceKm(walks))
    const seasons = countSeasons(walks)

    bar.textContent = `${walkCount} walks \u00B7 ${distance} \u00B7 ${seasons} season${seasons !== 1 ? 's' : ''}`

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
        'line-color': getSeasonColor(walk.startDate),
        'line-width': DEFAULT_WIDTH,
        'line-opacity': DEFAULT_OPACITY,
      },
    })
    activeLayerIds.push(lid)

    map.on('click', lid, () => {
      if (walkClickCallback) walkClickCallback(walk)
    })

    map.on('mouseenter', lid, () => {
      map.getCanvas().style.cursor = 'pointer'
    })

    map.on('mouseleave', lid, () => {
      map.getCanvas().style.cursor = ''
    })
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

    if (map.isStyleLoaded()) {
      render()
    } else {
      map.once('load', render)
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

  function onWalkClick(callback: (walk: Walk) => void): void {
    walkClickCallback = callback
  }

  return {
    showAllWalks,
    highlightWalk,
    clearSelection,
    clear,
    getMap: () => map,
    onWalkClick,
  }
}
