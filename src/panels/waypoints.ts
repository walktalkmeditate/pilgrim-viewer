import type { Walk, GeoJSONFeature } from '../parsers/types'
import type { UnitSystem } from '../parsers/units'
import { formatDistance } from '../parsers/units'
import { resolveWaypointIcon, getWaypointIconSvg } from '../map/waypoint-icons'

function distanceFromStart(walk: Walk, waypointCoord: number[]): number {
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

export function renderWaypointsPanel(
  container: HTMLElement,
  walk: Walk,
  unit: UnitSystem = 'metric',
): void {
  const waypoints = walk.route.features.filter(
    (f): f is GeoJSONFeature => f.geometry.type === 'Point' && f.properties.markerType === 'waypoint',
  )

  if (waypoints.length === 0) return

  const sorted = waypoints
    .map(wp => ({
      wp,
      dist: distanceFromStart(walk, wp.geometry.coordinates as number[]),
    }))
    .sort((a, b) => a.dist - b.dist)

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
