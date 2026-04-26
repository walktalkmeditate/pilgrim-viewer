import mapboxgl from 'mapbox-gl'
import type { Walk } from '../parsers/types'
import type { Staging } from './staging'
import { totalDistance } from '../parsers/geo'

export interface LiveTrim {
  startMeters?: number
  endMeters?: number
}

export interface TrimHandleContext {
  map: mapboxgl.Map
  walk: Walk
  staging: Staging
  // Called continuously during drag with the in-progress trim values
  // (in meters from the corresponding endpoint of the original route).
  // Caller should render the walk with these values applied on TOP of
  // any other staged mods so the preview reflects what dragend will
  // commit. Called with no argument once drag completes / commits.
  refreshPreview: (liveTrim?: LiveTrim) => void
}

export interface TrimHandleManager {
  destroy(): void
}

function getLine(walk: Walk): number[][] {
  for (const f of walk.route.features) {
    if (f.geometry.type === 'LineString') return f.geometry.coordinates as number[][]
  }
  return []
}

function computeTrimMeters(line: number[][], position: 'start' | 'end', dragged: number[]): number {
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < line.length; i++) {
    const dx = line[i][0] - dragged[0]
    const dy = line[i][1] - dragged[1]
    const d = dx * dx + dy * dy
    if (d < bestDist) { bestDist = d; bestIdx = i }
  }
  if (position === 'start') {
    const slice = line.slice(0, bestIdx + 1)
    return totalDistance(slice)
  } else {
    const slice = line.slice(bestIdx)
    return totalDistance(slice)
  }
}

function createMarker(
  ctx: TrimHandleContext,
  position: 'start' | 'end',
  liveState: LiveTrim,
): mapboxgl.Marker {
  const el = document.createElement('div')
  el.className = 'trim-handle'

  const label = document.createElement('div')
  label.className = 'trim-label'
  label.style.position = 'absolute'
  label.style.transform = 'translate(-50%, -150%)'
  label.style.whiteSpace = 'nowrap'
  label.style.pointerEvents = 'none'
  label.textContent = '0m'
  el.appendChild(label)

  const line = getLine(ctx.walk)
  const initialCoord = position === 'start' ? line[0] : line[line.length - 1]
  if (!initialCoord) {
    return new mapboxgl.Marker({ element: el }).setLngLat([0, 0]).addTo(ctx.map)
  }

  const marker = new mapboxgl.Marker({ element: el, draggable: true })
    .setLngLat([initialCoord[0], initialCoord[1]])
    .addTo(ctx.map)

  let lastMeters = 0
  marker.on('drag', () => {
    const lngLat = marker.getLngLat()
    const meters = computeTrimMeters(line, position, [lngLat.lng, lngLat.lat])
    lastMeters = meters
    label.textContent = `−${Math.round(meters)}m from ${position}`
    if (position === 'start') liveState.startMeters = meters
    else liveState.endMeters = meters
    ctx.refreshPreview({ ...liveState })
  })

  marker.on('dragend', () => {
    if (lastMeters <= 0) return
    ctx.staging.push({
      op: position === 'start' ? 'trim_route_start' : 'trim_route_end',
      walkId: ctx.walk.id,
      payload: { meters: Math.round(lastMeters) },
    })
    // Staging push triggers a rerender which destroys this marker
    // and creates fresh ones with empty liveState. No need to reset
    // here — but clear our copy in case the rerender lags.
    if (position === 'start') liveState.startMeters = 0
    else liveState.endMeters = 0
  })

  return marker
}

export function attachTrimHandles(ctx: TrimHandleContext): TrimHandleManager {
  // Shared state between the two markers so refreshPreview gets a
  // consistent view of both endpoints during a drag of either one.
  const liveState: LiveTrim = { startMeters: 0, endMeters: 0 }
  const startMarker = createMarker(ctx, 'start', liveState)
  const endMarker = createMarker(ctx, 'end', liveState)
  return {
    destroy() {
      startMarker.remove()
      endMarker.remove()
    },
  }
}
