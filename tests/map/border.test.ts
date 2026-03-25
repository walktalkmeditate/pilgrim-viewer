import { describe, it, expect } from 'vitest'
import { generateFrameLines } from '../../src/map/border'
import { generateLinearElevation } from '../../src/map/border'

describe('generateFrameLines', () => {
  it('produces outer and inner rect elements', () => {
    // #given
    const width = 400
    const height = 300
    const borderWidth = 60
    const color = '#C4956A'

    // #when
    const svg = generateFrameLines(width, height, borderWidth, color)

    // #then
    expect(svg).toContain('<rect')
    expect((svg.match(/<rect/g) ?? []).length).toBe(2)
    expect(svg).toContain(color)
  })
})

describe('generateLinearElevation', () => {
  it('produces a polyline with correct point count', () => {
    // #given
    const routePoints = [
      { lat: 37.7, lon: -122.4, alt: 10 },
      { lat: 37.8, lon: -122.3, alt: 50 },
      { lat: 37.9, lon: -122.2, alt: 30 },
      { lat: 38.0, lon: -122.1, alt: 70 },
      { lat: 38.1, lon: -122.0, alt: 20 },
    ]
    const xStart = 100
    const xEnd = 350
    const yBaseline = 270
    const maxAmplitude = 20

    // #when
    const svg = generateLinearElevation(routePoints, xStart, xEnd, yBaseline, maxAmplitude, '#C4956A')

    // #then
    expect(svg).toContain('<polyline')
    const pointsMatch = svg.match(/points="([^"]+)"/)
    expect(pointsMatch).not.toBeNull()
    const points = pointsMatch![1].split(' ')
    expect(points).toHaveLength(5)
  })

  it('returns empty string for fewer than 2 route points', () => {
    // #given
    const routePoints = [{ lat: 37.7, lon: -122.4, alt: 10 }]

    // #when
    const svg = generateLinearElevation(routePoints, 100, 350, 270, 20, '#C4956A')

    // #then
    expect(svg).toBe('')
  })
})
