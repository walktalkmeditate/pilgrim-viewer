import mapboxgl from 'mapbox-gl'

const DEM_SOURCE_ID = 'mapbox-dem'
const TERRAIN_EXAGGERATION = 1.5
const TERRAIN_PITCH = 60
const FLAT_PITCH = 0

export function createTerrainToggle(
  map: mapboxgl.Map,
  container: HTMLElement,
): { destroy(): void } {
  let enabled = false

  const btn = document.createElement('button')
  btn.className = 'terrain-toggle'
  btn.title = '3D Terrain'
  btn.textContent = '\u26F0'
  container.appendChild(btn)

  function addDemSource(): void {
    if (!map.getSource(DEM_SOURCE_ID)) {
      map.addSource(DEM_SOURCE_ID, {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14,
      })
    }
  }

  function enable(): void {
    addDemSource()
    map.setTerrain({ source: DEM_SOURCE_ID, exaggeration: TERRAIN_EXAGGERATION })
    map.easeTo({ pitch: TERRAIN_PITCH, duration: 600 })
    btn.classList.add('active')
    enabled = true
  }

  function disable(): void {
    map.setTerrain(null)
    map.easeTo({ pitch: FLAT_PITCH, duration: 600 })
    btn.classList.remove('active')
    enabled = false
  }

  btn.addEventListener('click', () => {
    if (!map.isStyleLoaded()) return
    if (enabled) {
      disable()
    } else {
      enable()
    }
  })

  return {
    destroy(): void {
      btn.remove()
    },
  }
}
