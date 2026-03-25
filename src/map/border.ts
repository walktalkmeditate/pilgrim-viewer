import type { Walk } from '../parsers/types'
import type { UnitSystem } from '../parsers/units'
import {
  computeWalkHash, hexToBytes, extractRoutePoints, buildCombinedWalk,
  getSeason, getWeatherTurbulence, COLORS,
} from '../panels/seal'

const BORDER_COLOR = COLORS.dawn

const SEASON_COLORS: Record<string, string> = {
  Spring: '#7A8B6F',
  Summer: '#C4956A',
  Autumn: '#A0634B',
  Winter: '#B8AFA2',
}

export function generateFrameLines(
  width: number,
  height: number,
  borderWidth: number,
  color: string,
): string {
  const outerMargin = 10
  const outerW = width - outerMargin * 2
  const outerH = height - outerMargin * 2
  const innerX = borderWidth
  const innerY = borderWidth
  const innerW = width - borderWidth * 2
  const innerH = height - borderWidth * 2

  return [
    `<rect x="${outerMargin}" y="${outerMargin}" width="${outerW}" height="${outerH}" rx="3" fill="none" stroke="${color}" stroke-width="0.8" opacity="0.25"/>`,
    `<rect x="${innerX}" y="${innerY}" width="${innerW}" height="${innerH}" rx="2" fill="none" stroke="${color}" stroke-width="1.2" opacity="0.5"/>`,
  ].join('\n')
}
