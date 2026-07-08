// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  renderWaypointsPanel,
  renderFoundPlacesPanel,
  panelOrderedWaypoints,
} from '../../src/panels/waypoints'
import type { Walk, GeoJSONFeature } from '../../src/parsers/types'

function makeWaypoint(
  coordinates: number[],
  label: string,
  icon: string,
  timestamp?: number,
): GeoJSONFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates },
    properties: { markerType: 'waypoint', label, icon, timestamp },
  }
}

function makeWalk(waypoints: GeoJSONFeature[]): Walk {
  const routeLine: GeoJSONFeature = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-8.51, 42.87],
        [-8.52, 42.88],
        [-8.53, 42.89],
      ],
    },
    properties: {},
  }
  return {
    id: 'walk-1',
    startDate: new Date('2024-04-15T09:00:00Z'),
    endDate: new Date('2024-04-15T12:00:00Z'),
    stats: {
      distance: 5000,
      activeDuration: 3600,
      pauseDuration: 0,
      ascent: 0,
      descent: 0,
      talkDuration: 0,
      meditateDuration: 0,
    },
    route: { type: 'FeatureCollection', features: [routeLine, ...waypoints] },
    voiceRecordings: [],
    activities: [],
    pauses: [],
    source: 'pilgrim',
  }
}

const ordinaryNear = makeWaypoint([-8.51, 42.87], 'Peaceful', 'leaf', 1710000720)
const ordinaryFar = makeWaypoint([-8.53, 42.89], 'Grateful', 'heart', 1710002160)
const clearingSecond = makeWaypoint([-8.52, 42.88], 'Second clearing', 'sun.haze', 1710003000)
const clearingFirst = makeWaypoint([-8.53, 42.89], 'First clearing', 'sun.haze', 1710001000)

describe('renderWaypointsPanel', () => {
  it('renders ordinary waypoints exactly as before', () => {
    // #given
    const container = document.createElement('div')
    const walk = makeWalk([ordinaryFar, ordinaryNear])

    // #when
    renderWaypointsPanel(container, walk)

    // #then — distance-sorted rows under the Waypoints heading
    const panel = container.querySelector('.panel.waypoints-panel')!
    expect(panel.querySelector('.panel-heading')!.textContent).toBe('Waypoints')
    const labels = Array.from(panel.querySelectorAll('.waypoint-item-label')).map(el => el.textContent)
    expect(labels).toEqual(['Peaceful', 'Grateful'])
  })

  it('excludes found places from the Waypoints panel', () => {
    // #given
    const container = document.createElement('div')
    const walk = makeWalk([ordinaryNear, clearingFirst])

    // #when
    renderWaypointsPanel(container, walk)

    // #then
    const labels = Array.from(container.querySelectorAll('.waypoint-item-label')).map(el => el.textContent)
    expect(labels).toEqual(['Peaceful'])
  })

  it('self-hides when a walk has only found places', () => {
    // #given
    const container = document.createElement('div')
    const walk = makeWalk([clearingFirst, clearingSecond])

    // #when
    renderWaypointsPanel(container, walk)

    // #then
    expect(container.querySelector('.waypoints-panel')).toBeNull()
  })
})

describe('renderFoundPlacesPanel', () => {
  it('self-hides when a walk has no found places', () => {
    // #given
    const container = document.createElement('div')
    const walk = makeWalk([ordinaryNear, ordinaryFar])

    // #when
    renderFoundPlacesPanel(container, walk)

    // #then
    expect(container.children.length).toBe(0)
  })

  it('groups seek arrivals under a quiet Found places heading', () => {
    // #given
    const container = document.createElement('div')
    const walk = makeWalk([ordinaryNear, clearingFirst, clearingSecond])

    // #when
    renderFoundPlacesPanel(container, walk)

    // #then
    const panel = container.querySelector('.panel.found-places-panel')!
    expect(panel).not.toBeNull()
    expect(panel.querySelector('.panel-heading')!.textContent).toBe('Found places')
    expect(panel.querySelectorAll('.found-place-item')).toHaveLength(2)
  })

  it('lists found places chronologically with label and time', () => {
    // #given — Second clearing has a later timestamp than First clearing
    const container = document.createElement('div')
    const walk = makeWalk([clearingSecond, clearingFirst])

    // #when
    renderFoundPlacesPanel(container, walk)

    // #then
    const labels = Array.from(container.querySelectorAll('.waypoint-item-label')).map(el => el.textContent)
    expect(labels).toEqual(['First clearing', 'Second clearing'])
    const times = Array.from(container.querySelectorAll('.waypoint-item-time')).map(el => el.textContent)
    expect(times).toHaveLength(2)
    for (const t of times) expect(t).toMatch(/\d/)
  })

  it('rows keep the waypoint-item class so edit affordances still find them', () => {
    // #given
    const container = document.createElement('div')
    const walk = makeWalk([clearingFirst])

    // #when
    renderFoundPlacesPanel(container, walk)

    // #then — found places remain deletable like any other waypoint
    const row = container.querySelector('.found-place-item')!
    expect(row.classList.contains('waypoint-item')).toBe(true)
  })
})

describe('panelOrderedWaypoints', () => {
  it('mirrors the DOM order of rows across both panels', () => {
    // #given — a mix of ordinary waypoints and found places
    const container = document.createElement('div')
    const walk = makeWalk([clearingSecond, ordinaryFar, clearingFirst, ordinaryNear])

    // #when — rendered in the same order ui/layout.ts uses
    renderWaypointsPanel(container, walk)
    renderFoundPlacesPanel(container, walk)

    // #then — index i in the returned array is row i in the DOM
    const domLabels = Array.from(container.querySelectorAll('.waypoint-item .waypoint-item-label'))
      .map(el => el.textContent)
    const orderedLabels = panelOrderedWaypoints(walk).map(wp => wp.properties.label)
    expect(orderedLabels).toEqual(domLabels)
    expect(orderedLabels).toEqual(['Peaceful', 'Grateful', 'First clearing', 'Second clearing'])
  })
})
