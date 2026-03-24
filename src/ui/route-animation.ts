interface Route {
  name: string
  lightColor: string
  darkColor: string
  coords: [number, number][]
}

const ROUTES: Route[] = [
  {
    name: 'Kumano Kodo',
    lightColor: 'rgba(122, 139, 111, 0.15)',
    darkColor: 'rgba(149, 168, 149, 0.12)',
    coords: [
      [135.766, 33.890], [135.769, 33.892], [135.771, 33.896], [135.774, 33.899],
      [135.777, 33.902], [135.780, 33.905], [135.784, 33.908], [135.788, 33.911],
      [135.792, 33.915], [135.796, 33.919], [135.801, 33.923], [135.806, 33.927],
      [135.773, 33.840], [135.779, 33.835], [135.790, 33.830], [135.810, 33.825],
      [135.825, 33.821], [135.840, 33.821], [135.855, 33.818], [135.870, 33.814],
      [135.880, 33.810], [135.885, 33.700], [135.890, 33.670],
    ],
  },
  {
    name: 'Camino de Santiago',
    lightColor: 'rgba(160, 99, 75, 0.15)',
    darkColor: 'rgba(196, 126, 99, 0.12)',
    coords: [
      [-7.415, 42.780], [-7.430, 42.772], [-7.450, 42.765], [-7.475, 42.758],
      [-7.500, 42.752], [-7.530, 42.748], [-7.560, 42.742], [-7.590, 42.738],
      [-7.620, 42.736], [-7.660, 42.742], [-7.700, 42.755], [-7.740, 42.768],
      [-7.780, 42.776], [-7.810, 42.782], [-7.845, 42.790], [-7.880, 42.796],
      [-7.920, 42.805], [-7.960, 42.818], [-8.000, 42.830], [-8.050, 42.845],
      [-8.100, 42.855], [-8.200, 42.862], [-8.350, 42.870], [-8.545, 42.878],
    ],
  },
  {
    name: 'Shikoku 88',
    lightColor: 'rgba(196, 149, 106, 0.15)',
    darkColor: 'rgba(212, 168, 122, 0.12)',
    coords: [
      [134.505, 34.159], [134.501, 34.157], [134.496, 34.154], [134.491, 34.149],
      [134.485, 34.145], [134.478, 34.140], [134.470, 34.135], [134.462, 34.130],
      [134.453, 34.123], [134.443, 34.115], [134.432, 34.107], [134.420, 34.098],
      [134.408, 34.088], [134.396, 34.078], [134.384, 34.068], [134.372, 34.058],
      [134.362, 34.050], [134.355, 34.045],
    ],
  },
]

const LINE_WIDTH = 2
const PAUSE_FRAMES = 90
const ROUTE_PADDING = 0.15

function isDarkMode(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'dark'
}

function getRouteColor(route: Route): string {
  return isDarkMode() ? route.darkColor : route.lightColor
}

function computeRouteBounds(route: Route): { minLon: number; maxLon: number; minLat: number; maxLat: number } {
  let minLon = Infinity
  let maxLon = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity

  for (const [lon, lat] of route.coords) {
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }

  const lonRange = maxLon - minLon
  const latRange = maxLat - minLat
  const lonPad = lonRange * ROUTE_PADDING
  const latPad = latRange * ROUTE_PADDING

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
  bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number },
  width: number,
  height: number,
): [number, number] {
  const lonRange = bounds.maxLon - bounds.minLon
  const latRange = bounds.maxLat - bounds.minLat

  const aspectRoute = lonRange / latRange
  const aspectCanvas = width / height

  let drawW = width
  let drawH = height
  let offsetX = 0
  let offsetY = 0

  if (aspectRoute > aspectCanvas) {
    drawH = width / aspectRoute
    offsetY = (height - drawH) / 2
  } else {
    drawW = height * aspectRoute
    offsetX = (width - drawW) / 2
  }

  const x = offsetX + ((lon - bounds.minLon) / lonRange) * drawW
  const y = offsetY + ((bounds.maxLat - lat) / latRange) * drawH
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

  let animationId = 0
  let routeIndex = 0
  let segmentIndex = 0
  let pauseCounter = 0
  let fadeOutCounter = 0
  let currentOpacity = 1
  let canvasW = 0
  let canvasH = 0

  function resize(): void {
    const dpr = window.devicePixelRatio || 1
    const rect = container.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    canvasW = rect.width
    canvasH = rect.height
    redrawCurrent()
  }

  function redrawCurrent(): void {
    ctx!.clearRect(0, 0, canvasW, canvasH)
    if (segmentIndex <= 0) return

    const route = ROUTES[routeIndex]
    const bounds = computeRouteBounds(route)

    ctx!.strokeStyle = getRouteColor(route)
    ctx!.lineWidth = LINE_WIDTH
    ctx!.lineCap = 'round'
    ctx!.lineJoin = 'round'
    ctx!.globalAlpha = currentOpacity
    ctx!.beginPath()

    const [startX, startY] = projectToCanvas(
      route.coords[0][0], route.coords[0][1], bounds, canvasW, canvasH,
    )
    ctx!.moveTo(startX, startY)

    for (let i = 1; i <= segmentIndex && i < route.coords.length; i++) {
      const [x, y] = projectToCanvas(
        route.coords[i][0], route.coords[i][1], bounds, canvasW, canvasH,
      )
      ctx!.lineTo(x, y)
    }
    ctx!.stroke()
    ctx!.globalAlpha = 1
  }

  function drawNextSegment(): void {
    const route = ROUTES[routeIndex]
    const bounds = computeRouteBounds(route)

    if (segmentIndex >= route.coords.length - 1) {
      fadeOutCounter = 30
      return
    }

    const [fromX, fromY] = projectToCanvas(
      route.coords[segmentIndex][0], route.coords[segmentIndex][1],
      bounds, canvasW, canvasH,
    )
    const [toX, toY] = projectToCanvas(
      route.coords[segmentIndex + 1][0], route.coords[segmentIndex + 1][1],
      bounds, canvasW, canvasH,
    )

    ctx!.strokeStyle = getRouteColor(route)
    ctx!.lineWidth = LINE_WIDTH
    ctx!.lineCap = 'round'
    ctx!.lineJoin = 'round'
    ctx!.globalAlpha = currentOpacity
    ctx!.beginPath()
    ctx!.moveTo(fromX, fromY)
    ctx!.lineTo(toX, toY)
    ctx!.stroke()
    ctx!.globalAlpha = 1

    segmentIndex++
  }

  function frame(): void {
    if (fadeOutCounter > 0) {
      fadeOutCounter--
      currentOpacity = fadeOutCounter / 30
      redrawCurrent()

      if (fadeOutCounter <= 0) {
        routeIndex = (routeIndex + 1) % ROUTES.length
        segmentIndex = 0
        currentOpacity = 1
        pauseCounter = PAUSE_FRAMES
        ctx!.clearRect(0, 0, canvasW, canvasH)
      }

      animationId = requestAnimationFrame(frame)
      return
    }

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
