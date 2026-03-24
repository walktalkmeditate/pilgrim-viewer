import type { Walk } from '../parsers/types'
import { formatElevation, type UnitSystem } from '../parsers/units'

const CANVAS_HEIGHT = 80
const DEFAULT_CANVAS_WIDTH = 288
const Y_PADDING_FACTOR = 0.1
const FILL_COLOR = 'rgba(122, 139, 111, 0.2)'
const STROKE_COLOR = '#8B7355'
const STROKE_WIDTH = 1.5

function extractElevations(walk: Walk): number[] {
  const lineString = walk.route.features.find((f) => f.geometry.type === 'LineString')
  if (!lineString) return []

  const coords = lineString.geometry.coordinates as number[][]
  return coords.map((c) => c[2]).filter((e) => e !== undefined)
}

function drawSparkline(canvas: HTMLCanvasElement, elevations: number[]): void {
  const dpr = window.devicePixelRatio ?? 1
  const cssWidth = canvas.width
  const cssHeight = canvas.height

  canvas.width = cssWidth * dpr
  canvas.height = cssHeight * dpr

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.scale(dpr, dpr)

  let minElev = Infinity
  let maxElev = -Infinity
  for (const e of elevations) {
    if (e < minElev) minElev = e
    if (e > maxElev) maxElev = e
  }
  const range = maxElev - minElev

  if (range === 0) {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio ?? 1
    canvas.width = cssWidth * dpr
    canvas.height = cssHeight * dpr
    ctx.scale(dpr, dpr)
    ctx.strokeStyle = STROKE_COLOR
    ctx.lineWidth = STROKE_WIDTH
    ctx.beginPath()
    ctx.moveTo(0, cssHeight / 2)
    ctx.lineTo(cssWidth, cssHeight / 2)
    ctx.stroke()
    return
  }

  const yPad = range * Y_PADDING_FACTOR
  const yMin = minElev - yPad
  const yMax = maxElev + yPad
  const yRange = yMax - yMin

  function xAt(index: number): number {
    return (index / (elevations.length - 1)) * cssWidth
  }

  function yAt(elev: number): number {
    return cssHeight - ((elev - yMin) / yRange) * cssHeight
  }

  ctx.beginPath()
  ctx.moveTo(0, cssHeight)
  for (let i = 0; i < elevations.length; i++) {
    ctx.lineTo(xAt(i), yAt(elevations[i]))
  }
  ctx.lineTo(cssWidth, cssHeight)
  ctx.closePath()
  ctx.fillStyle = FILL_COLOR
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(0, yAt(elevations[0]))
  for (let i = 1; i < elevations.length; i++) {
    ctx.lineTo(xAt(i), yAt(elevations[i]))
  }
  ctx.strokeStyle = STROKE_COLOR
  ctx.lineWidth = STROKE_WIDTH
  ctx.stroke()
}

export function renderElevationPanel(container: HTMLElement, walk: Walk, unit: UnitSystem = 'metric'): void {
  const elevations = extractElevations(walk)
  if (elevations.length < 2) return

  const panel = document.createElement('div')
  panel.className = 'panel'

  const heading = document.createElement('h3')
  heading.className = 'panel-heading'
  heading.textContent = 'Elevation'

  const canvas = document.createElement('canvas')
  canvas.className = 'elevation-canvas'
  canvas.width = container.clientWidth > 0 ? container.clientWidth : DEFAULT_CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT

  drawSparkline(canvas, elevations)

  let minElevLabel = Infinity
  let maxElevLabel = -Infinity
  for (const e of elevations) {
    if (e < minElevLabel) minElevLabel = e
    if (e > maxElevLabel) maxElevLabel = e
  }

  const labels = document.createElement('div')
  labels.className = 'elevation-labels'

  const minLabel = document.createElement('span')
  minLabel.className = 'elevation-label'
  minLabel.textContent = formatElevation(minElevLabel, unit)

  const maxLabel = document.createElement('span')
  maxLabel.className = 'elevation-label'
  maxLabel.textContent = formatElevation(maxElevLabel, unit)

  labels.appendChild(minLabel)
  labels.appendChild(maxLabel)

  panel.appendChild(heading)
  panel.appendChild(canvas)
  panel.appendChild(labels)
  container.appendChild(panel)
}
