import type { Walk, GeoJSONFeature } from '../parsers/types'
import type { UnitSystem } from '../parsers/units'
import { formatDistance } from '../parsers/units'
import { isFoundPlace } from '../parsers/found-place'
import { resolveWaypointIcon, getWaypointIconSvg } from '../map/waypoint-icons'

export function distanceFromStart(walk: Walk, waypointCoord: number[]): number {
  const lineFeature = walk.route.features.find(f => f.geometry.type === 'LineString')
  if (!lineFeature) return 0

  const coords = lineFeature.geometry.coordinates as number[][]
  const [wpLon, wpLat] = waypointCoord
  let totalDist = 0
  let bestDist = Infinity
  let bestAccum = 0

  for (let i = 0; i < coords.length; i++) {
    if (i > 0) {
      const dlat = (coords[i][1] - coords[i - 1][1]) * 111320
      const dlon = (coords[i][0] - coords[i - 1][0]) * 111320 * Math.cos(coords[i][1] * Math.PI / 180)
      totalDist += Math.sqrt(dlat * dlat + dlon * dlon)
    }
    const dlat = (coords[i][1] - wpLat) * 111320
    const dlon = (coords[i][0] - wpLon) * 111320 * Math.cos(coords[i][1] * Math.PI / 180)
    const d = Math.sqrt(dlat * dlat + dlon * dlon)
    if (d < bestDist) {
      bestDist = d
      bestAccum = totalDist
    }
  }

  return bestAccum
}

function allWaypoints(walk: Walk): GeoJSONFeature[] {
  return walk.route.features.filter(
    (f): f is GeoJSONFeature => f.geometry.type === 'Point' && f.properties.markerType === 'waypoint',
  )
}

function sortedByDistance(
  walk: Walk,
  waypoints: GeoJSONFeature[],
): { wp: GeoJSONFeature; dist: number }[] {
  return waypoints
    .map(wp => ({
      wp,
      dist: distanceFromStart(walk, wp.geometry.coordinates as number[]),
    }))
    .sort((a, b) => a.dist - b.dist)
}

function sortedByTime(waypoints: GeoJSONFeature[]): GeoJSONFeature[] {
  return [...waypoints].sort(
    (a, b) => (a.properties.timestamp ?? Infinity) - (b.properties.timestamp ?? Infinity),
  )
}

// Mirrors the DOM order of `.waypoint-item` rows across the Waypoints
// panel and the Found places panel (rendered in that order by
// ui/layout.ts), so edit affordances can map rows back to features by
// index. Keep in sync with the two render functions below.
export function panelOrderedWaypoints(walk: Walk): GeoJSONFeature[] {
  const waypoints = allWaypoints(walk)
  const ordinary = sortedByDistance(walk, waypoints.filter(wp => !isFoundPlace(wp)))
  return [...ordinary.map(e => e.wp), ...sortedByTime(waypoints.filter(isFoundPlace))]
}

export function renderWaypointsPanel(
  container: HTMLElement,
  walk: Walk,
  unit: UnitSystem = 'metric',
): void {
  const waypoints = allWaypoints(walk).filter(wp => !isFoundPlace(wp))

  if (waypoints.length === 0) return

  const sorted = sortedByDistance(walk, waypoints)

  const panel = document.createElement('div')
  panel.className = 'panel waypoints-panel'

  const heading = document.createElement('h3')
  heading.className = 'panel-heading'
  heading.textContent = 'Waypoints'
  panel.appendChild(heading)

  const list = document.createElement('div')
  list.className = 'waypoints-list'

  for (const { wp, dist } of sorted) {
    const icon = resolveWaypointIcon(wp.properties.icon)
    const svg = getWaypointIconSvg(icon).replace(/currentColor/g, '#8B7355')

    const item = document.createElement('div')
    item.className = 'waypoint-item'

    const iconEl = document.createElement('span')
    iconEl.className = 'waypoint-item-icon'
    iconEl.insertAdjacentHTML('afterbegin', svg)

    const label = document.createElement('span')
    label.className = 'waypoint-item-label'
    label.textContent = wp.properties.label ?? 'Waypoint'

    const distance = document.createElement('span')
    distance.className = 'waypoint-item-dist'
    distance.textContent = formatDistance(dist, unit)

    item.appendChild(iconEl)
    item.appendChild(label)
    item.appendChild(distance)
    list.appendChild(item)
  }

  panel.appendChild(list)
  container.appendChild(panel)
}

function formatClock(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Seek arrivals get their own quiet panel so they read as something
// rarer than a pin. Rows reuse the `.waypoint-item` class on purpose:
// edit affordances find them there and found places stay deletable
// like any other waypoint.
export function renderFoundPlacesPanel(
  container: HTMLElement,
  walk: Walk,
  unit: UnitSystem = 'metric',
): void {
  const found = sortedByTime(allWaypoints(walk).filter(isFoundPlace))

  if (found.length === 0) return

  const panel = document.createElement('div')
  panel.className = 'panel found-places-panel'

  const heading = document.createElement('h3')
  heading.className = 'panel-heading'
  heading.textContent = 'Found places'
  panel.appendChild(heading)

  const list = document.createElement('div')
  list.className = 'waypoints-list'

  for (const wp of found) {
    const item = document.createElement('div')
    item.className = 'waypoint-item found-place-item'

    const iconEl = document.createElement('span')
    iconEl.className = 'waypoint-item-icon'
    const dot = document.createElement('span')
    dot.className = 'found-place-dot'
    iconEl.appendChild(dot)

    const label = document.createElement('span')
    label.className = 'waypoint-item-label'
    label.textContent = wp.properties.label ?? 'Found place'

    const time = document.createElement('span')
    time.className = 'waypoint-item-time'
    time.textContent = wp.properties.timestamp !== undefined
      ? formatClock(wp.properties.timestamp)
      : formatDistance(distanceFromStart(walk, wp.geometry.coordinates as number[]), unit)

    item.appendChild(iconEl)
    item.appendChild(label)
    item.appendChild(time)
    list.appendChild(item)
  }

  panel.appendChild(list)
  container.appendChild(panel)
}
