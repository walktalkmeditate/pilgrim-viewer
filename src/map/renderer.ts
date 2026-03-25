import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Walk, Activity, GeoJSONFeature } from '../parsers/types'
import { resolveWaypointIcon, getWaypointIconSvg } from './waypoint-icons'

const ACTIVITY_COLORS: Record<Activity['type'], string> = {
  walk: '#7A8B6F',
  talk: '#C4956A',
  meditate: '#A0634B',
}

const ROUTE_COLOR_DEFAULT = '#8B7355'
const MARKER_START_COLOR = '#7A8B6F'
const MARKER_END_COLOR = '#A0634B'

function findCoordIndex(timestamps: number[], targetTime: number): number {
  let lo = 0
  let hi = timestamps.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (timestamps[mid] < targetTime) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  return lo
}

export function createMapRenderer(
  container: HTMLElement,
  token: string
): { showWalk(walk: Walk): void; clear(): void; remove(): void; getMap(): mapboxgl.Map } {
  mapboxgl.accessToken = token

  const map = new mapboxgl.Map({
    container,
    style: 'mapbox://styles/mapbox/light-v11',
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

  const activeLayers: string[] = []
  const activeSources: string[] = []
  const activeMarkers: mapboxgl.Marker[] = []
  let pendingLoadHandler: (() => void) | null = null

  function clear(): void {
    for (const layerId of activeLayers) {
      if (map.getLayer(layerId)) map.removeLayer(layerId)
    }
    for (const sourceId of activeSources) {
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    }
    for (const m of activeMarkers) m.remove()
    activeLayers.length = 0
    activeSources.length = 0
    activeMarkers.length = 0
  }

  function addSource(id: string, data: GeoJSON.GeoJSON): void {
    map.addSource(id, { type: 'geojson', data })
    activeSources.push(id)
  }

  function addLineLayer(id: string, sourceId: string, color: string): void {
    map.addLayer({
      id,
      type: 'line',
      source: sourceId,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': color, 'line-width': 3 },
    })
    activeLayers.push(id)
  }

  function addCircleLayer(
    id: string,
    sourceId: string,
    color: string
  ): void {
    map.addLayer({
      id,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': 6,
        'circle-color': color,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    })
    activeLayers.push(id)
  }

  function showWalk(walk: Walk): void {
    clear()

    const lineFeatures = walk.route.features.filter(
      (f) => f.geometry.type === 'LineString'
    )

    if (lineFeatures.length === 0) return

    const firstFeature = lineFeatures[0]
    const allCoords = firstFeature.geometry.coordinates as number[][]
    const timestamps = firstFeature.properties.timestamps

    const hasActivities = walk.activities.length > 0
    const hasTimestamps = Array.isArray(timestamps) && timestamps.length === allCoords.length

    const renderOnLoad = (): void => {
      if (hasActivities && hasTimestamps) {
        walk.activities.forEach((activity, i) => {
          const startMs = activity.startDate.getTime()
          const endMs = activity.endDate.getTime()
          const startIdx = findCoordIndex(timestamps!, startMs)
          const endIdx = findCoordIndex(timestamps!, endMs)

          if (startIdx >= endIdx) return

          const segmentCoords = allCoords.slice(startIdx, endIdx + 1)
          const sourceId = `activity-source-${i}`
          const layerId = `activity-layer-${i}`

          addSource(sourceId, {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: segmentCoords },
            properties: {},
          } as GeoJSON.Feature)

          addLineLayer(layerId, sourceId, ACTIVITY_COLORS[activity.type])
        })
      } else {
        addSource('route-source', {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: allCoords },
          properties: {},
        } as GeoJSON.Feature)
        addLineLayer('route-layer', 'route-source', ROUTE_COLOR_DEFAULT)
      }

      const firstCoord = allCoords[0]
      const lastCoord = allCoords[allCoords.length - 1]

      addSource('marker-start-source', {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: firstCoord },
        properties: {},
      } as GeoJSON.Feature)
      addCircleLayer('marker-start-layer', 'marker-start-source', MARKER_START_COLOR)

      addSource('marker-end-source', {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: lastCoord },
        properties: {},
      } as GeoJSON.Feature)
      addCircleLayer('marker-end-layer', 'marker-end-source', MARKER_END_COLOR)

      const waypointFeatures = walk.route.features.filter(
        (f): f is GeoJSONFeature => f.geometry.type === 'Point' && f.properties.markerType === 'waypoint',
      )

      for (const wp of waypointFeatures) {
        const icon = resolveWaypointIcon(wp.properties.icon)
        const svg = getWaypointIconSvg(icon).replace(/currentColor/g, '#8B7355')

        const el = document.createElement('div')
        el.className = 'waypoint-marker'
        el.replaceChildren()
        el.insertAdjacentHTML('afterbegin', svg)
        if (wp.properties.label) el.title = wp.properties.label

        const coords = wp.geometry.coordinates as [number, number]
        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat(coords)
          .addTo(map)
        activeMarkers.push(marker)
      }

      const bounds = allCoords.reduce(
        (b, coord) => b.extend(coord as [number, number]),
        new mapboxgl.LngLatBounds(
          allCoords[0] as [number, number],
          allCoords[0] as [number, number]
        )
      )
      map.fitBounds(bounds, { padding: 50 })
    }

    if (pendingLoadHandler) {
      map.off('load', pendingLoadHandler)
      pendingLoadHandler = null
    }

    if (map.isStyleLoaded()) {
      renderOnLoad()
    } else {
      pendingLoadHandler = renderOnLoad
      map.once('load', () => {
        pendingLoadHandler = null
        renderOnLoad()
      })
    }
  }

  function remove(): void {
    clear()
    map.remove()
  }

  return { showWalk, clear, remove, getMap: () => map }
}
