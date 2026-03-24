interface Route {
  name: string
  distance: string
  lightColor: string
  darkColor: string
  coords: [number, number, number][]
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  opacity: number
  size: number
}

const ROUTES: Route[] = [
  {
    name: 'Kumano Kodo',
    distance: '45 km',
    lightColor: 'rgba(122, 139, 111, 0.15)',
    darkColor: 'rgba(149, 168, 149, 0.12)',
    coords: [
      [135.766, 33.890, 80], [135.769, 33.892, 120], [135.771, 33.896, 200], [135.774, 33.899, 310],
      [135.777, 33.902, 410], [135.780, 33.905, 480], [135.784, 33.908, 530], [135.788, 33.911, 490],
      [135.792, 33.915, 420], [135.796, 33.919, 350], [135.801, 33.923, 280], [135.806, 33.927, 220],
      [135.773, 33.840, 180], [135.779, 33.835, 250], [135.790, 33.830, 340], [135.810, 33.825, 420],
      [135.825, 33.821, 380], [135.840, 33.821, 300], [135.855, 33.818, 240], [135.870, 33.814, 190],
      [135.880, 33.810, 130], [135.885, 33.700, 90], [135.890, 33.670, 60],
    ],
  },
  {
    name: 'Camino de Santiago',
    distance: '110 km',
    lightColor: 'rgba(160, 99, 75, 0.15)',
    darkColor: 'rgba(196, 126, 99, 0.12)',
    coords: [
      [-7.415, 42.780, 450], [-7.430, 42.772, 480], [-7.450, 42.765, 510], [-7.475, 42.758, 470],
      [-7.500, 42.752, 430], [-7.530, 42.748, 460], [-7.560, 42.742, 490], [-7.590, 42.738, 440],
      [-7.620, 42.736, 400], [-7.660, 42.742, 420], [-7.700, 42.755, 380], [-7.740, 42.768, 350],
      [-7.780, 42.776, 370], [-7.810, 42.782, 340], [-7.845, 42.790, 310], [-7.880, 42.796, 330],
      [-7.920, 42.805, 300], [-7.960, 42.818, 320], [-8.000, 42.830, 290], [-8.050, 42.845, 310],
      [-8.100, 42.855, 280], [-8.200, 42.862, 270], [-8.350, 42.870, 265], [-8.545, 42.878, 260],
    ],
  },
  {
    name: 'Shikoku 88',
    distance: '19 km',
    lightColor: 'rgba(196, 149, 106, 0.15)',
    darkColor: 'rgba(212, 168, 122, 0.12)',
    coords: [
      [134.505, 34.159, 15], [134.501, 34.157, 40], [134.496, 34.154, 90], [134.491, 34.149, 160],
      [134.485, 34.145, 230], [134.478, 34.140, 300], [134.470, 34.135, 370], [134.462, 34.130, 430],
      [134.453, 34.123, 480], [134.443, 34.115, 520], [134.432, 34.107, 560], [134.420, 34.098, 590],
      [134.408, 34.088, 620], [134.396, 34.078, 650], [134.384, 34.068, 670], [134.372, 34.058, 690],
      [134.362, 34.050, 695], [134.355, 34.045, 700],
    ],
  },
]

const BASE_LINE_WIDTH = 1.5
const MAX_LINE_WIDTH = 3.5
const FRAMES_PER_SEGMENT = 30
const PAUSE_FRAMES = 120
const ROUTE_PADDING = 0.15
const MAX_PARTICLES = 100
const SEAL_RADIUS = 15
const OVERLAY_FADE_FRAMES = 15

function isDarkMode(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'dark'
}

function getRouteColor(route: Route): string {
  return isDarkMode() ? route.darkColor : route.lightColor
}

function parseRouteRgba(route: Route): [number, number, number] {
  const raw = isDarkMode() ? route.darkColor : route.lightColor
  const m = raw.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!m) return [128, 128, 128]
  return [Number(m[1]), Number(m[2]), Number(m[3])]
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

function computeAltitudeRange(route: Route): { minAlt: number; maxAlt: number } {
  let minAlt = Infinity
  let maxAlt = -Infinity
  for (const coord of route.coords) {
    if (coord[2] < minAlt) minAlt = coord[2]
    if (coord[2] > maxAlt) maxAlt = coord[2]
  }
  return { minAlt, maxAlt }
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
  let frameCounter = 0
  let currentOpacity = 1
  let canvasW = 0
  let canvasH = 0
  let particles: Particle[] = []
  let sealFadeCounter = 0
  let captionFadeCounter = 0
  let routeFinished = false

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

  function getSegmentWidth(route: Route, i: number): number {
    if (i <= 0 || i >= route.coords.length) return BASE_LINE_WIDTH
    const dx = route.coords[i][0] - route.coords[i - 1][0]
    const dy = route.coords[i][1] - route.coords[i - 1][1]
    const dist = Math.sqrt(dx * dx + dy * dy)
    const maxDist = 0.05
    const t = Math.min(dist / maxDist, 1)
    return BASE_LINE_WIDTH + (MAX_LINE_WIDTH - BASE_LINE_WIDTH) * (1 - t)
  }

  function drawTerrainShadow(route: Route, bounds: ReturnType<typeof computeRouteBounds>, upToSegment: number): void {
    const { minAlt, maxAlt } = computeAltitudeRange(route)
    const altRange = maxAlt - minAlt || 1
    const [r, g, b] = parseRouteRgba(route)

    for (let i = 1; i <= upToSegment && i < route.coords.length; i++) {
      const [x0, y0] = projectToCanvas(route.coords[i - 1][0], route.coords[i - 1][1], bounds, canvasW, canvasH)
      const [x1, y1] = projectToCanvas(route.coords[i][0], route.coords[i][1], bounds, canvasW, canvasH)
      const midX = (x0 + x1) / 2
      const midY = (y0 + y1) / 2

      const avgAlt = (route.coords[i - 1][2] + route.coords[i][2]) / 2
      const altNorm = (avgAlt - minAlt) / altRange
      const shadowOpacity = 0.03 + altNorm * 0.02

      ctx!.strokeStyle = `rgba(${r}, ${g}, ${b}, ${shadowOpacity})`
      ctx!.lineWidth = 18
      ctx!.lineCap = 'round'
      ctx!.lineJoin = 'round'
      ctx!.globalAlpha = currentOpacity
      ctx!.beginPath()
      ctx!.moveTo(x0, y0)
      ctx!.quadraticCurveTo(midX + (y1 - y0) * 0.1, midY - (x1 - x0) * 0.1, x1, y1)
      ctx!.stroke()
    }
    ctx!.globalAlpha = 1
  }

  function drawSeal(route: Route, bounds: ReturnType<typeof computeRouteBounds>, sealOpacity: number): void {
    const last = route.coords[route.coords.length - 1]
    const [cx, cy] = projectToCanvas(last[0], last[1], bounds, canvasW, canvasH)
    const [r, g, b] = parseRouteRgba(route)
    const alpha = 0.3 * sealOpacity * currentOpacity

    ctx!.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`
    ctx!.lineWidth = 1.5

    ctx!.beginPath()
    ctx!.arc(cx, cy, SEAL_RADIUS, 0, Math.PI * 2)
    ctx!.stroke()

    ctx!.setLineDash([3, 3])
    ctx!.beginPath()
    ctx!.arc(cx, cy, SEAL_RADIUS * 0.7, 0, Math.PI * 2)
    ctx!.stroke()
    ctx!.setLineDash([])

    for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
      const innerR = SEAL_RADIUS * 0.35
      const outerR = SEAL_RADIUS * 0.65
      ctx!.beginPath()
      ctx!.moveTo(cx + Math.cos(a) * innerR, cy + Math.sin(a) * innerR)
      ctx!.lineTo(cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR)
      ctx!.stroke()
    }
  }

  function drawCaption(route: Route, bounds: ReturnType<typeof computeRouteBounds>, captionOpacity: number): void {
    const midIdx = Math.floor(route.coords.length / 2)
    const midCoord = route.coords[midIdx]
    const [mx, my] = projectToCanvas(midCoord[0], midCoord[1], bounds, canvasW, canvasH)
    const [r, g, b] = parseRouteRgba(route)
    const alpha = 0.4 * captionOpacity * currentOpacity

    ctx!.font = '13px system-ui, sans-serif'
    ctx!.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`
    ctx!.textAlign = 'center'
    ctx!.fillText(`${route.name} \u00B7 ${route.distance}`, mx, my + 25)
  }

  function drawParticles(): void {
    const route = ROUTES[routeIndex]
    const [r, g, b] = parseRouteRgba(route)

    for (const p of particles) {
      ctx!.globalAlpha = p.opacity * currentOpacity
      ctx!.fillStyle = `rgba(${r}, ${g}, ${b}, 1)`
      ctx!.beginPath()
      ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx!.fill()
    }
    ctx!.globalAlpha = 1
  }

  function updateParticles(): void {
    for (const p of particles) {
      p.x += p.vx
      p.y += p.vy
      p.opacity -= 0.003
    }
    particles = particles.filter((p) => p.opacity > 0)
  }

  function emitParticles(x: number, y: number): void {
    const count = 2 + Math.floor(Math.random() * 2)
    for (let i = 0; i < count; i++) {
      if (particles.length >= MAX_PARTICLES) break
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 1.2,
        vy: (Math.random() - 0.5) * 1.2,
        opacity: 0.15,
        size: 1 + Math.random(),
      })
    }
  }

  function redrawCurrent(): void {
    ctx!.clearRect(0, 0, canvasW, canvasH)
    if (segmentIndex <= 0 && !routeFinished) return

    const route = ROUTES[routeIndex]
    const bounds = computeRouteBounds(route)
    const drawUpTo = routeFinished ? route.coords.length - 1 : segmentIndex

    drawTerrainShadow(route, bounds, drawUpTo)

    ctx!.strokeStyle = getRouteColor(route)
    ctx!.lineCap = 'round'
    ctx!.lineJoin = 'round'
    ctx!.globalAlpha = currentOpacity

    for (let i = 1; i <= drawUpTo && i < route.coords.length; i++) {
      const [x0, y0] = projectToCanvas(
        route.coords[i - 1][0], route.coords[i - 1][1], bounds, canvasW, canvasH,
      )
      const [x1, y1] = projectToCanvas(
        route.coords[i][0], route.coords[i][1], bounds, canvasW, canvasH,
      )
      const midX = (x0 + x1) / 2
      const midY = (y0 + y1) / 2

      ctx!.lineWidth = getSegmentWidth(route, i)
      ctx!.beginPath()
      ctx!.moveTo(x0, y0)
      ctx!.quadraticCurveTo(midX + (y1 - y0) * 0.1, midY - (x1 - x0) * 0.1, x1, y1)
      ctx!.stroke()
    }
    ctx!.globalAlpha = 1

    drawParticles()

    if (routeFinished) {
      const sealOpacity = Math.min(sealFadeCounter / OVERLAY_FADE_FRAMES, 1)
      const captionOpacity = Math.min(captionFadeCounter / OVERLAY_FADE_FRAMES, 1)
      if (sealOpacity > 0) drawSeal(route, bounds, sealOpacity)
      if (captionOpacity > 0) drawCaption(route, bounds, captionOpacity)
    }
  }

  let prevTipX = 0
  let prevTipY = 0

  function drawFrame(): void {
    const route = ROUTES[routeIndex]
    const bounds = computeRouteBounds(route)

    if (segmentIndex >= route.coords.length - 1) {
      routeFinished = true
      if (sealFadeCounter < OVERLAY_FADE_FRAMES) sealFadeCounter++
      if (captionFadeCounter < OVERLAY_FADE_FRAMES) captionFadeCounter++
      updateParticles()
      redrawCurrent()

      if (sealFadeCounter >= OVERLAY_FADE_FRAMES && captionFadeCounter >= OVERLAY_FADE_FRAMES && particles.length === 0) {
        fadeOutCounter = 60
      }
      return
    }

    const t = frameCounter / FRAMES_PER_SEGMENT

    const [fromX, fromY] = projectToCanvas(
      route.coords[segmentIndex][0], route.coords[segmentIndex][1],
      bounds, canvasW, canvasH,
    )
    const [toX, toY] = projectToCanvas(
      route.coords[segmentIndex + 1][0], route.coords[segmentIndex + 1][1],
      bounds, canvasW, canvasH,
    )

    const tipX = fromX + (toX - fromX) * t
    const tipY = fromY + (toY - fromY) * t

    if (frameCounter > 0 || segmentIndex > 0) {
      const avgAlt = (route.coords[segmentIndex][2] + route.coords[segmentIndex + 1][2]) / 2
      const { minAlt, maxAlt } = computeAltitudeRange(route)
      const altRange = maxAlt - minAlt || 1
      const altNorm = (avgAlt - minAlt) / altRange
      const shadowOpacity = 0.03 + altNorm * 0.02
      const [r, g, b] = parseRouteRgba(route)

      ctx!.strokeStyle = `rgba(${r}, ${g}, ${b}, ${shadowOpacity})`
      ctx!.lineWidth = 18
      ctx!.lineCap = 'round'
      ctx!.globalAlpha = currentOpacity
      ctx!.beginPath()
      ctx!.moveTo(prevTipX, prevTipY)
      ctx!.lineTo(tipX, tipY)
      ctx!.stroke()
      ctx!.globalAlpha = 1

      const lw = BASE_LINE_WIDTH + (getSegmentWidth(route, segmentIndex + 1) - BASE_LINE_WIDTH) * t
      ctx!.strokeStyle = getRouteColor(route)
      ctx!.lineWidth = lw
      ctx!.lineCap = 'round'
      ctx!.globalAlpha = currentOpacity
      ctx!.beginPath()
      ctx!.moveTo(prevTipX, prevTipY)
      ctx!.lineTo(tipX, tipY)
      ctx!.stroke()
      ctx!.globalAlpha = 1

      emitParticles(tipX, tipY)
    }

    updateParticles()
    drawParticles()

    prevTipX = tipX
    prevTipY = tipY

    frameCounter++
    if (frameCounter >= FRAMES_PER_SEGMENT) {
      frameCounter = 0
      segmentIndex++
    }
  }

  function frame(): void {
    if (fadeOutCounter > 0) {
      fadeOutCounter--
      currentOpacity = fadeOutCounter / 60
      updateParticles()
      redrawCurrent()

      if (fadeOutCounter <= 0) {
        routeIndex = (routeIndex + 1) % ROUTES.length
        segmentIndex = 0
        frameCounter = 0
        currentOpacity = 1
        pauseCounter = PAUSE_FRAMES
        particles = []
        sealFadeCounter = 0
        captionFadeCounter = 0
        routeFinished = false
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

    drawFrame()
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
