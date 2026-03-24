interface Bounds {
  minLon: number
  maxLon: number
  minLat: number
  maxLat: number
}

interface Route {
  name: string
  color: string
  coords: [number, number][]
}

const ROUTES: Route[] = [
  {
    name: 'Kumano Kodo',
    color: 'rgba(122, 139, 111, 0.12)',
    coords: [
      [135.766, 33.890], [135.769, 33.892], [135.771, 33.896], [135.774, 33.898],
      [135.777, 33.902], [135.780, 33.905], [135.785, 33.909], [135.788, 33.911],
      [135.792, 33.915], [135.796, 33.919], [135.800, 33.923], [135.810, 33.825],
      [135.825, 33.821], [135.840, 33.821], [135.855, 33.818], [135.870, 33.814],
      [135.885, 33.810], [135.890, 33.670],
    ],
  },
  {
    name: 'Camino de Santiago',
    color: 'rgba(160, 99, 75, 0.12)',
    coords: [
      [-7.415, 42.780], [-7.435, 42.768], [-7.470, 42.758], [-7.515, 42.749],
      [-7.540, 42.745], [-7.570, 42.740], [-7.610, 42.734], [-7.650, 42.745],
      [-7.700, 42.760], [-7.750, 42.772], [-7.800, 42.778], [-7.830, 42.785],
      [-7.860, 42.792], [-7.900, 42.800], [-7.940, 42.810], [-7.980, 42.825],
      [-8.020, 42.840], [-8.060, 42.860], [-8.545, 42.878],
    ],
  },
  {
    name: 'Shikoku 88',
    color: 'rgba(196, 149, 106, 0.12)',
    coords: [
      [134.505, 34.159], [134.502, 34.157], [134.498, 34.154], [134.494, 34.151],
      [134.491, 34.149], [134.485, 34.145], [134.478, 34.140], [134.470, 34.135],
      [134.462, 34.130], [134.450, 34.120], [134.435, 34.105], [134.420, 34.090],
      [134.405, 34.075], [134.390, 34.065], [134.375, 34.055], [134.360, 34.045],
    ],
  },
]

const PADDING_FACTOR = 0.1
const LINE_WIDTH = 1.5
const PAUSE_FRAMES = 60

function computeBounds(routes: Route[]): Bounds {
  let minLon = Infinity
  let maxLon = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity

  for (const route of routes) {
    for (const [lon, lat] of route.coords) {
      if (lon < minLon) minLon = lon
      if (lon > maxLon) maxLon = lon
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
  }

  const lonPad = (maxLon - minLon) * PADDING_FACTOR
  const latPad = (maxLat - minLat) * PADDING_FACTOR

  return {
    minLon: minLon - lonPad,
    maxLon: maxLon + lonPad,
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
  }
}

function projectToCanvas(
  lon: number,
  lat: number,
  bounds: Bounds,
  width: number,
  height: number,
): [number, number] {
  const x = ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * width
  const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * height
  return [x, y]
}

export function createRouteAnimation(container: HTMLElement): { stop: () => void } {
  const canvas = document.createElement('canvas')
  canvas.className = 'dropzone-canvas'
  container.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return { stop: () => canvas.remove() }
  }

  let bounds = computeBounds(ROUTES)
  let animationId = 0
  let routeIndex = 0
  let segmentIndex = 0
  let pauseCounter = 0

  function resize(): void {
    const dpr = window.devicePixelRatio || 1
    const rect = container.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    bounds = computeBounds(ROUTES)
    redrawCompleted()
  }

  const completedSegments: { routeIdx: number; upToSegment: number }[] = []

  function redrawCompleted(): void {
    const rect = container.getBoundingClientRect()
    ctx!.clearRect(0, 0, rect.width, rect.height)

    for (const entry of completedSegments) {
      const route = ROUTES[entry.routeIdx]
      ctx!.strokeStyle = route.color
      ctx!.lineWidth = LINE_WIDTH
      ctx!.lineCap = 'round'
      ctx!.lineJoin = 'round'
      ctx!.beginPath()
      const [startX, startY] = projectToCanvas(
        route.coords[0][0], route.coords[0][1], bounds, rect.width, rect.height,
      )
      ctx!.moveTo(startX, startY)
      for (let i = 1; i <= entry.upToSegment; i++) {
        const [x, y] = projectToCanvas(
          route.coords[i][0], route.coords[i][1], bounds, rect.width, rect.height,
        )
        ctx!.lineTo(x, y)
      }
      ctx!.stroke()
    }

    if (segmentIndex > 0) {
      const route = ROUTES[routeIndex]
      ctx!.strokeStyle = route.color
      ctx!.lineWidth = LINE_WIDTH
      ctx!.lineCap = 'round'
      ctx!.lineJoin = 'round'
      ctx!.beginPath()
      const [startX, startY] = projectToCanvas(
        route.coords[0][0], route.coords[0][1], bounds, rect.width, rect.height,
      )
      ctx!.moveTo(startX, startY)
      for (let i = 1; i <= segmentIndex; i++) {
        const [x, y] = projectToCanvas(
          route.coords[i][0], route.coords[i][1], bounds, rect.width, rect.height,
        )
        ctx!.lineTo(x, y)
      }
      ctx!.stroke()
    }
  }

  function drawNextSegment(): void {
    const route = ROUTES[routeIndex]
    const rect = container.getBoundingClientRect()

    if (segmentIndex >= route.coords.length - 1) {
      completedSegments.push({ routeIdx: routeIndex, upToSegment: route.coords.length - 1 })
      routeIndex = (routeIndex + 1) % ROUTES.length
      segmentIndex = 0
      pauseCounter = PAUSE_FRAMES

      if (routeIndex === 0) {
        completedSegments.length = 0
      }
      return
    }

    const [fromX, fromY] = projectToCanvas(
      route.coords[segmentIndex][0], route.coords[segmentIndex][1],
      bounds, rect.width, rect.height,
    )
    const [toX, toY] = projectToCanvas(
      route.coords[segmentIndex + 1][0], route.coords[segmentIndex + 1][1],
      bounds, rect.width, rect.height,
    )

    ctx!.strokeStyle = route.color
    ctx!.lineWidth = LINE_WIDTH
    ctx!.lineCap = 'round'
    ctx!.lineJoin = 'round'
    ctx!.beginPath()
    ctx!.moveTo(fromX, fromY)
    ctx!.lineTo(toX, toY)
    ctx!.stroke()

    segmentIndex++
  }

  function frame(): void {
    if (pauseCounter > 0) {
      pauseCounter--
      animationId = requestAnimationFrame(frame)
      return
    }

    drawNextSegment()
    animationId = requestAnimationFrame(frame)
  }

  resize()
  animationId = requestAnimationFrame(frame)
  window.addEventListener('resize', resize)

  return {
    stop(): void {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
      canvas.remove()
    },
  }
}
