import { describe, it, expect } from 'vitest'
import { generateFrameLines } from '../../src/map/border'

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
