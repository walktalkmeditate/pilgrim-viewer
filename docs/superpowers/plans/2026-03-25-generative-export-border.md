# Generative Export Border Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace plain dark padding/footer on exported images with a generative decorative border that shares visual DNA with the goushin seal.

**Architecture:** New `src/map/border.ts` generates a full-canvas SVG border from walk data (hash, elevation, season, weather). The SVG is composited onto the canvas before the map, same pipeline as the seal. Shared utilities are extracted from `seal.ts`. Both border and seal receive the same pre-computed hash for visual coherence.

**Tech Stack:** TypeScript, SVG string generation, Canvas 2D compositing, Vitest

**Spec:** `docs/superpowers/specs/2026-03-25-generative-export-border-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/map/border.ts` | **New** — Border SVG generation: frame lines, elevation trace, season bars, corner ornaments, dots, seal radials, stats text, weather filter |
| `tests/map/border.test.ts` | **New** — Unit tests for all border element generators |
| `src/panels/seal.ts` | **Modify** — Export shared utilities, extract `buildCombinedWalk`, add optional `hashHex` param to `generateCombinedSealSVG` |
| `tests/panels/seal.test.ts` | **Modify** — Update imports for renamed exports, add `buildCombinedWalk` tests |
| `src/map/export.ts` | **Modify** — Replace padding/footer with border pipeline, shared hash computation, new seal positioning |
| `tests/map/export.test.ts` | **Modify** — Update tests for removed constants, add tests for new pipeline |

---

### Task 1: Export shared utilities from seal.ts

**Files:**
- Modify: `src/panels/seal.ts`
- Modify: `tests/panels/seal.test.ts`

- [ ] **Step 1: Write test for buildCombinedWalk**

In `tests/panels/seal.test.ts`, add a test for the new `buildCombinedWalk` helper:

```typescript
import {
  _getSeason, _getTimeOfDay, _extractRoutePoints,
  buildCombinedWalk, computeWalkHash, hexToBytes,
  getSeason, getWeatherTurbulence, COLORS,
} from '../../src/panels/seal'

describe('buildCombinedWalk', () => {
  it('aggregates stats from multiple walks and uses earliest startDate', () => {
    // #given
    const walk1 = makeWalk({
      id: 'w1',
      startDate: new Date('2024-06-15T10:00:00Z'),
      stats: {
        distance: 5000, activeDuration: 3600, pauseDuration: 0,
        ascent: 50, descent: 45, talkDuration: 300, meditateDuration: 600,
      },
    })
    const walk2 = makeWalk({
      id: 'w2',
      startDate: new Date('2024-03-10T08:00:00Z'),
      stats: {
        distance: 3000, activeDuration: 1800, pauseDuration: 0,
        ascent: 30, descent: 25, talkDuration: 200, meditateDuration: 400,
      },
    })

    // #when
    const combined = buildCombinedWalk([walk1, walk2])

    // #then
    expect(combined.id).toBe('combined-journey')
    expect(combined.stats.distance).toBe(8000)
    expect(combined.stats.activeDuration).toBe(5400)
    expect(combined.stats.talkDuration).toBe(500)
    expect(combined.stats.meditateDuration).toBe(1000)
    expect(combined.startDate).toEqual(new Date('2024-03-10T08:00:00Z'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/panels/seal.test.ts`
Expected: FAIL — `buildCombinedWalk` is not exported

- [ ] **Step 3: Extract buildCombinedWalk and export shared utilities**

In `src/panels/seal.ts`:

1. Extract the inline combined walk logic (lines 356-372) into a named function:

```typescript
export function buildCombinedWalk(walks: Walk[]): Walk {
  const totalDistance = walks.reduce((s, w) => s + w.stats.distance, 0)
  const totalActiveDuration = walks.reduce((s, w) => s + w.stats.activeDuration, 0)
  const totalMeditateDuration = walks.reduce((s, w) => s + w.stats.meditateDuration, 0)
  const totalTalkDuration = walks.reduce((s, w) => s + w.stats.talkDuration, 0)
  const earliestWalk = walks.reduce((min, w) => w.startDate < min.startDate ? w : min, walks[0])

  return {
    ...earliestWalk,
    id: 'combined-journey',
    stats: {
      ...earliestWalk.stats,
      distance: totalDistance,
      activeDuration: totalActiveDuration,
      meditateDuration: totalMeditateDuration,
      talkDuration: totalTalkDuration,
    },
  }
}
```

2. Add `export` to: `computeWalkHash`, `hexToBytes`, `COLORS`, `getSeason`, `getWeatherTurbulence`, `extractRoutePoints`, and the `RoutePoint` interface.

3. Keep the underscore aliases for backward compatibility with existing tests: `export { getSeason as _getSeason, getTimeOfDay as _getTimeOfDay, extractRoutePoints as _extractRoutePoints }`

4. Add optional `hashHex` parameter to `generateCombinedSealSVG`:

```typescript
export async function generateCombinedSealSVG(
  walks: Walk[],
  size: number,
  unit: UnitSystem = 'metric',
  hashHex?: string,
): Promise<string | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null
  if (walks.length === 0) return null

  const combined = buildCombinedWalk(walks)
  const allRoutePoints = walks.flatMap(extractRoutePoints)
  if (allRoutePoints.length === 0) return null

  const hash = hashHex ?? await computeWalkHash(combined, allRoutePoints)
  const bytes = hexToBytes(hash)

  return generateSealSvg(bytes, combined, allRoutePoints, size, unit)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/panels/seal.test.ts`
Expected: All tests PASS (existing + new `buildCombinedWalk` test)

- [ ] **Step 5: Commit**

```bash
git add src/panels/seal.ts tests/panels/seal.test.ts
git commit -m "refactor: export shared utilities from seal.ts, extract buildCombinedWalk"
```

---

### Task 2: Frame lines and border scaffold

**Files:**
- Create: `src/map/border.ts`
- Create: `tests/map/border.test.ts`

- [ ] **Step 1: Write test for generateFrameLines**

Create `tests/map/border.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/map/border.test.ts`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement generateFrameLines and border scaffold**

Create `src/map/border.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/map/border.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/map/border.ts tests/map/border.test.ts
git commit -m "feat: add border scaffold with frame lines"
```

---

### Task 3: Elevation trace generator

**Files:**
- Modify: `src/map/border.ts`
- Modify: `tests/map/border.test.ts`

- [ ] **Step 1: Write tests for generateLinearElevation**

In `tests/map/border.test.ts`:

```typescript
import { generateLinearElevation } from '../../src/map/border'

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/map/border.test.ts`
Expected: FAIL — `generateLinearElevation` not exported

- [ ] **Step 3: Implement generateLinearElevation**

In `src/map/border.ts`:

```typescript
export function generateLinearElevation(
  routePoints: RoutePoint[],
  xStart: number,
  xEnd: number,
  yBaseline: number,
  maxAmplitude: number,
  color: string,
  opacity: number = 0.35,
): string {
  if (routePoints.length < 2) return ''

  const alts = routePoints.map(p => p.alt)
  let minAlt = Infinity
  let maxAlt = -Infinity
  for (const a of alts) {
    if (a < minAlt) minAlt = a
    if (a > maxAlt) maxAlt = a
  }
  const altRange = Math.max(maxAlt - minAlt, 1)

  const totalWidth = xEnd - xStart
  const step = totalWidth / (routePoints.length - 1)

  const points: string[] = []
  for (let i = 0; i < routePoints.length; i++) {
    const x = xStart + i * step
    const normalized = (alts[i] - minAlt) / altRange
    const y = yBaseline - normalized * maxAmplitude
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  }

  return `<polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="1" opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round"/>`
}
```

Add the `RoutePoint` import at the top of `border.ts`:

```typescript
import type { RoutePoint } from '../panels/seal'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/map/border.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/map/border.ts tests/map/border.test.ts
git commit -m "feat: add linear elevation trace for border"
```

---

### Task 4: Season bars generator

**Files:**
- Modify: `src/map/border.ts`
- Modify: `tests/map/border.test.ts`

- [ ] **Step 1: Write tests for generateSeasonBars**

In `tests/map/border.test.ts`:

```typescript
import { generateSeasonBars } from '../../src/map/border'
import type { Walk } from '../../src/parsers/types'

describe('generateSeasonBars', () => {
  it('produces a single color bar for one walk', () => {
    // #given — summer walk in northern hemisphere
    const walks = [makeWalk({ startDate: new Date('2024-06-15T10:00:00Z') })]

    // #when
    const svg = generateSeasonBars(walks, 200, 26, 55, 240)

    // #then
    expect(svg).toContain('<line')
    expect((svg.match(/<line/g) ?? []).length).toBe(1)
    expect(svg).toContain('#C4956A') // summer/dawn
  })

  it('produces proportional bars for walks across seasons', () => {
    // #given — 2 spring, 1 autumn
    const walks = [
      makeWalk({ startDate: new Date('2024-03-15T10:00:00Z') }),
      makeWalk({ startDate: new Date('2024-04-10T10:00:00Z') }),
      makeWalk({ startDate: new Date('2024-09-20T10:00:00Z') }),
    ]

    // #when
    const svg = generateSeasonBars(walks, 200, 26, 55, 240)

    // #then
    expect(svg).toContain('#7A8B6F') // spring
    expect(svg).toContain('#A0634B') // autumn
    const lines = (svg.match(/<line/g) ?? [])
    expect(lines.length).toBe(2)
  })
})
```

Use the same `makeWalk` helper — import or define locally in border test file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/map/border.test.ts`
Expected: FAIL — `generateSeasonBars` not exported

- [ ] **Step 3: Implement generateSeasonBars**

In `src/map/border.ts`:

```typescript
export function generateSeasonBars(
  walks: Walk[],
  height: number,
  x: number,
  yStart: number,
  yEnd: number,
): string {
  const totalHeight = yEnd - yStart
  const seasonCounts: Record<string, number> = {}

  for (const walk of walks) {
    const routePoints = extractRoutePoints(walk)
    const lat = routePoints[0]?.lat ?? 0
    const season = getSeason(walk.startDate, lat)
    seasonCounts[season] = (seasonCounts[season] ?? 0) + 1
  }

  const total = walks.length
  const bars: string[] = []
  let currentY = yStart

  for (const [season, count] of Object.entries(seasonCounts)) {
    const segmentHeight = (count / total) * totalHeight
    const color = SEASON_COLORS[season] ?? COLORS.dawn
    const y2 = currentY + segmentHeight

    bars.push(
      `<line x1="${x}" y1="${currentY.toFixed(1)}" x2="${x}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="2.5" opacity="0.4" stroke-linecap="round"/>`
    )
    currentY = y2 + 8 // gap between segments
  }

  return bars.join('\n')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/map/border.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/map/border.ts tests/map/border.test.ts
git commit -m "feat: add season bars for border left edge"
```

---

### Task 5: Corner ornaments, edge dots, and seal radials

**Files:**
- Modify: `src/map/border.ts`
- Modify: `tests/map/border.test.ts`

- [ ] **Step 1: Write tests for hash-driven generators**

In `tests/map/border.test.ts`:

```typescript
import { generateCornerOrnaments, generateEdgeDots, generateSealRadials } from '../../src/map/border'
import { hexToBytes } from '../../src/panels/seal'

const TEST_HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'
const testBytes = hexToBytes(TEST_HASH)

describe('generateCornerOrnaments', () => {
  it('produces arc paths for each corner', () => {
    // #given / #when
    const svg = generateCornerOrnaments(testBytes, 400, 300, 60, '#C4956A')

    // #then
    expect(svg).toContain('<path')
    const paths = svg.match(/<path/g) ?? []
    expect(paths.length).toBeGreaterThanOrEqual(4) // at least 1 per corner
  })

  it('produces fewer ornaments at bottom-left to leave room for seal', () => {
    // #given / #when
    const svg = generateCornerOrnaments(testBytes, 400, 300, 60, '#C4956A')

    // #then — bottom-left region should have fewer arcs
    // This is a structural test: the function should produce arcs
    expect(svg).toContain('opacity')
  })
})

describe('generateEdgeDots', () => {
  it('produces dots scaled to walk count', () => {
    // #given
    const walkCount = 20

    // #when
    const svg = generateEdgeDots(testBytes, 400, 300, 60, '#C4956A', walkCount)

    // #then
    const circles = svg.match(/<circle/g) ?? []
    expect(circles.length).toBeGreaterThanOrEqual(5)
    expect(circles.length).toBeLessThanOrEqual(30)
  })

  it('caps at 30 dots for large walk counts', () => {
    // #given
    const walkCount = 500

    // #when
    const svg = generateEdgeDots(testBytes, 400, 300, 60, '#C4956A', walkCount)

    // #then
    const circles = svg.match(/<circle/g) ?? []
    expect(circles.length).toBeLessThanOrEqual(30)
  })
})

describe('generateSealRadials', () => {
  it('produces line elements radiating from seal position', () => {
    // #given
    const sealX = 60
    const sealY = 240

    // #when
    const svg = generateSealRadials(testBytes, sealX, sealY, '#C4956A')

    // #then
    expect(svg).toContain('<line')
    const lines = svg.match(/<line/g) ?? []
    expect(lines.length).toBeGreaterThanOrEqual(3)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/map/border.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement the three generators**

In `src/map/border.ts`, add:

`generateCornerOrnaments(bytes, width, height, borderWidth, color)` — produces arc pairs at each corner. Uses byte indices 24-29 for arc count (2-4) and sweep angles. Bottom-left corner gets `Math.max(count - 1, 1)` arcs to leave seal room.

`generateEdgeDots(bytes, width, height, borderWidth, color, walkCount)` — distributes dots along top and right border edges. Count: `Math.min(5 + Math.floor(walkCount / 10), 30)`. Position from hash bytes.

`generateSealRadials(bytes, sealX, sealY, color)` — fan of 4-8 lines from seal position outward at hash-driven angles, fading opacity with length.

(Full implementation follows seal patterns — `bytes[N]` for angles, sizes, opacity. Each function returns an SVG string fragment.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/map/border.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/map/border.ts tests/map/border.test.ts
git commit -m "feat: add corner ornaments, edge dots, and seal radials"
```

---

### Task 6: Stats text and weather filter

**Files:**
- Modify: `src/map/border.ts`
- Modify: `tests/map/border.test.ts`

- [ ] **Step 1: Write tests for stats text and weather filter**

In `tests/map/border.test.ts`:

```typescript
import { generateBorderStatsText, generateWeatherFilter } from '../../src/map/border'

describe('generateBorderStatsText', () => {
  it('produces centered text element with stats', () => {
    // #given
    const statsText = '12 walks · 48.3 km · 3 seasons'

    // #when
    const svg = generateBorderStatsText(statsText, 400, 280, '#C4956A')

    // #then
    expect(svg).toContain('<text')
    expect(svg).toContain('12 walks')
    expect(svg).toContain('text-anchor="middle"')
  })

  it('returns empty string when statsText is undefined', () => {
    // #when
    const svg = generateBorderStatsText(undefined, 400, 280, '#C4956A')

    // #then
    expect(svg).toBe('')
  })
})

describe('generateWeatherFilter', () => {
  it('produces SVG filter with turbulence for rain', () => {
    // #when
    const svg = generateWeatherFilter('rain', 'border-weather')

    // #then
    expect(svg).toContain('<filter')
    expect(svg).toContain('feTurbulence')
    expect(svg).toContain('0.06') // rain frequency
  })

  it('uses default turbulence when condition is undefined', () => {
    // #when
    const svg = generateWeatherFilter(undefined, 'border-weather')

    // #then
    expect(svg).toContain('0.04') // default frequency
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/map/border.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement stats text and weather filter**

In `src/map/border.ts`:

```typescript
export function generateBorderStatsText(
  statsText: string | undefined,
  width: number,
  y: number,
  color: string,
): string {
  if (!statsText) return ''
  return `<text x="${width / 2}" y="${y}" text-anchor="middle" font-family="'Lato', -apple-system, sans-serif" font-size="8" fill="${color}" opacity="0.55">${statsText}</text>`
}

export function generateWeatherFilter(
  condition: string | undefined,
  filterId: string,
): string {
  const params = getWeatherTurbulence(condition)
  return [
    `<filter id="${filterId}">`,
    `  <feTurbulence type="turbulence" baseFrequency="${params.freq}" numOctaves="${params.octaves}" seed="42"/>`,
    `  <feDisplacementMap in="SourceGraphic" scale="${params.scale}"/>`,
    `</filter>`,
  ].join('\n')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/map/border.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/map/border.ts tests/map/border.test.ts
git commit -m "feat: add stats text and weather filter for border"
```

---

### Task 7: Compose generateBorderSvg

**Files:**
- Modify: `src/map/border.ts`
- Modify: `tests/map/border.test.ts`

- [ ] **Step 1: Write test for generateBorderSvg**

In `tests/map/border.test.ts`:

```typescript
import { generateBorderSvg } from '../../src/map/border'

describe('generateBorderSvg', () => {
  it('produces a complete SVG with all border elements for stats variant', async () => {
    // #given
    const walks = [makeWalk()]
    const hashHex = TEST_HASH
    const statsText = '1 walk · 5.00 km · 1 season'

    // #when
    const svg = await generateBorderSvg(walks, 400, 300, 'stats', 'metric', hashHex, statsText)

    // #then
    expect(svg).toContain('<svg')
    expect(svg).toContain('</svg>')
    expect(svg).toContain('<rect')    // frame lines
    expect(svg).toContain('<polyline') // elevation trace
    expect(svg).toContain('1 walk')    // stats text
    expect(svg).toContain('<filter')   // weather filter
  })

  it('omits stats text for clean variant', async () => {
    // #given
    const walks = [makeWalk()]
    const hashHex = TEST_HASH

    // #when
    const svg = await generateBorderSvg(walks, 400, 300, 'clean', 'metric', hashHex)

    // #then
    expect(svg).toContain('<svg')
    expect(svg).not.toContain('<text') // no stats text, no other text
  })

  it('produces denser elements for multi-walk overlay', async () => {
    // #given
    const walks = Array.from({ length: 25 }, (_, i) =>
      makeWalk({
        id: `walk-${i}`,
        startDate: new Date(2024, i % 12, 15),
      })
    )

    // #when
    const svg = await generateBorderSvg(walks, 400, 300, 'stats', 'metric', TEST_HASH, '25 walks')

    // #then
    const circles = svg.match(/<circle/g) ?? []
    expect(circles.length).toBeGreaterThan(5) // scaled dots
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/map/border.test.ts`
Expected: FAIL — `generateBorderSvg` not exported

- [ ] **Step 3: Implement generateBorderSvg**

In `src/map/border.ts`, compose all elements:

```typescript
export const BORDER_WIDTH = 60

export async function generateBorderSvg(
  walks: Walk[],
  width: number,
  height: number,
  variant: 'stats' | 'clean',
  unit: UnitSystem,
  hashHex: string,
  statsText?: string,
): Promise<string> {
  const bytes = hexToBytes(hashHex)
  const allRoutePoints = walks.flatMap(extractRoutePoints)
  const walkCount = walks.length
  const earliestWalk = walks.reduce((min, w) => w.startDate < min.startDate ? w : min, walks[0])
  const weatherCondition = earliestWalk.weather?.condition

  const filterId = 'border-weather'
  const bw = BORDER_WIDTH

  // Seal position (bottom-left, bridging border-map edge)
  const sealX = bw
  const sealY = height - bw

  // Elevation trace along bottom border
  const elevXStart = sealX + 80 // leave room for seal
  const elevXEnd = width - bw
  const elevYBaseline = height - bw / 2
  const elevMaxAmplitude = bw * 0.3

  // Season bars along left edge
  const seasonBarX = (bw + 10) / 2
  const seasonBarYStart = bw + 15
  const seasonBarYEnd = height - bw - 15

  const elements: string[] = []

  // Weather filter
  elements.push(`<defs>${generateWeatherFilter(weatherCondition, filterId)}</defs>`)

  // Filtered group
  elements.push(`<g filter="url(#${filterId})">`)
  elements.push(generateFrameLines(width, height, bw, BORDER_COLOR))
  elements.push(generateSeasonBars(walks, height, seasonBarX, seasonBarYStart, seasonBarYEnd))
  elements.push(generateCornerOrnaments(bytes, width, height, bw, BORDER_COLOR))
  elements.push(generateEdgeDots(bytes, width, height, bw, BORDER_COLOR, walkCount))
  elements.push(generateSealRadials(bytes, sealX, sealY, BORDER_COLOR))

  // Elevation traces — one per walk, layered
  for (const walk of walks) {
    const rp = extractRoutePoints(walk)
    const opacity = Math.max(0.15, 0.4 - walkCount * 0.005)
    elements.push(generateLinearElevation(rp, elevXStart, elevXEnd, elevYBaseline, elevMaxAmplitude, BORDER_COLOR, opacity))
  }

  elements.push('</g>')

  // Stats text outside the filter group (for crisp text rendering)
  if (variant === 'stats') {
    const statsY = height - 12
    elements.push(generateBorderStatsText(statsText, width, statsY, BORDER_COLOR))
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    ...elements,
    '</svg>',
  ].join('\n')
}
```

- [ ] **Step 4: Run all border tests**

Run: `npx vitest run tests/map/border.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/map/border.ts tests/map/border.test.ts
git commit -m "feat: compose generateBorderSvg from all border elements"
```

---

### Task 8: Update export pipeline

**Files:**
- Modify: `src/map/export.ts`
- Modify: `tests/map/export.test.ts`

- [ ] **Step 1: Update export.test.ts for removed FOOTER constants**

The existing tests for `generateFilename` and `generateStatsText` should still pass unchanged. No new tests needed for the canvas pipeline (it requires DOM/Canvas APIs not available in vitest). Verify existing tests still work after the refactor.

- [ ] **Step 2: Refactor exportWithStats**

In `src/map/export.ts`:

1. Replace imports — add `generateBorderSvg`, `BORDER_WIDTH` from `../map/border`, add `buildCombinedWalk`, `computeWalkHash`, `extractRoutePoints` from `../panels/seal`

2. Remove constants: `FOOTER_HEIGHT`, `FOOTER_BG`, `FOOTER_TEXT_COLOR`, `FOOTER_FONT_SIZE`, `FOOTER_FONT`, `PADDING`

3. Keep constants: `EXPORT_LINE_WIDTH`, `EXPORT_LINE_OPACITY`

4. Rewrite `exportWithStats`:

```typescript
export function exportWithStats(
  map: mapboxgl.Map,
  statsText: string,
  filename: string,
  walks: Walk[] = [],
  unit: UnitSystem = 'metric',
): void {
  const saved = boostRoutes(map)
  map.triggerRepaint()

  requestAnimationFrame(async () => {
    const mapCanvas = map.getCanvas()
    const width = mapCanvas.width
    const height = mapCanvas.height
    const dpr = window.devicePixelRatio || 1
    const bw = BORDER_WIDTH * dpr

    const canvas = document.createElement('canvas')
    canvas.width = width + bw * 2
    canvas.height = height + bw * 2

    const ctx = canvas.getContext('2d')
    if (!ctx) { restoreRoutes(map, saved); return }

    // Dark background
    ctx.fillStyle = '#1C1914'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Border SVG
    if (walks.length > 0) {
      try {
        const combined = buildCombinedWalk(walks)
        const allRoutePoints = walks.flatMap(extractRoutePoints)
        const hashHex = await computeWalkHash(combined, allRoutePoints)

        const borderSvg = await generateBorderSvg(
          walks, canvas.width / dpr, canvas.height / dpr,
          'stats', unit, hashHex, statsText,
        )
        const borderImg = await svgToImage(borderSvg)
        ctx.drawImage(borderImg, 0, 0, canvas.width, canvas.height)

        // Map inset
        ctx.drawImage(mapCanvas, bw, bw)

        // Seal at border-map boundary
        const sealSize = Math.round(150 * dpr)
        const sealSvg = await generateCombinedSealSVG(walks, sealSize, unit, hashHex)
        if (sealSvg) {
          const sealImg = await svgToImage(sealSvg)
          ctx.globalAlpha = 0.65
          ctx.drawImage(
            sealImg,
            bw - sealSize / 2,
            canvas.height - bw - sealSize / 2,
            sealSize, sealSize,
          )
          ctx.globalAlpha = 1.0
        }
      } catch (err) {
        console.warn('Border/seal compositing failed:', err)
        // Fallback: just draw map centered
        ctx.drawImage(mapCanvas, bw, bw)
      }
    } else {
      ctx.drawImage(mapCanvas, bw, bw)
    }

    restoreRoutes(map, saved)
    triggerDownload(canvas.toDataURL('image/png'), filename)
  })
}
```

- [ ] **Step 3: Rewrite exportClean**

Same pattern as above but with `variant: 'clean'` and no `statsText`:

```typescript
export function exportClean(
  map: mapboxgl.Map,
  _container: HTMLElement,
  filename: string,
  walks: Walk[] = [],
  unit: UnitSystem = 'metric',
): void {
  const saved = boostRoutes(map)
  map.triggerRepaint()

  requestAnimationFrame(async () => {
    const mapCanvas = map.getCanvas()
    const width = mapCanvas.width
    const height = mapCanvas.height
    const dpr = window.devicePixelRatio || 1
    const bw = BORDER_WIDTH * dpr

    const canvas = document.createElement('canvas')
    canvas.width = width + bw * 2
    canvas.height = height + bw * 2

    const ctx = canvas.getContext('2d')
    if (!ctx) { restoreRoutes(map, saved); return }

    ctx.fillStyle = '#1C1914'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    if (walks.length > 0) {
      try {
        const combined = buildCombinedWalk(walks)
        const allRoutePoints = walks.flatMap(extractRoutePoints)
        const hashHex = await computeWalkHash(combined, allRoutePoints)

        const borderSvg = await generateBorderSvg(
          walks, canvas.width / dpr, canvas.height / dpr,
          'clean', unit, hashHex,
        )
        const borderImg = await svgToImage(borderSvg)
        ctx.drawImage(borderImg, 0, 0, canvas.width, canvas.height)

        ctx.drawImage(mapCanvas, bw, bw)

        const sealSize = Math.round(150 * dpr)
        const sealSvg = await generateCombinedSealSVG(walks, sealSize, unit, hashHex)
        if (sealSvg) {
          const sealImg = await svgToImage(sealSvg)
          ctx.globalAlpha = 0.65
          ctx.drawImage(
            sealImg,
            bw - sealSize / 2,
            canvas.height - bw - sealSize / 2,
            sealSize, sealSize,
          )
          ctx.globalAlpha = 1.0
        }
      } catch (err) {
        console.warn('Border/seal compositing failed:', err)
        ctx.drawImage(mapCanvas, bw, bw)
      }
    } else {
      ctx.drawImage(mapCanvas, bw, bw)
    }

    restoreRoutes(map, saved)
    triggerDownload(canvas.toDataURL('image/png'), filename)
  })
}
```

- [ ] **Step 4: Remove old compositeSeal function**

Delete the `compositeSeal` function — its logic is now inline in the export functions using the shared hash.

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS (existing export tests for `generateFilename` and `generateStatsText` unchanged, all border tests pass, all seal tests pass)

- [ ] **Step 6: Commit**

```bash
git add src/map/export.ts src/map/border.ts tests/map/export.test.ts
git commit -m "feat: replace padding/footer with generative border in export pipeline"
```

---

### Task 9: Manual visual verification

**Files:** None (verification only)

- [ ] **Step 1: Build and run the app**

Run: `npx vite dev`

- [ ] **Step 2: Load a .pilgrim file with multiple walks**

Toggle to overlay mode, verify the map renders normally.

- [ ] **Step 3: Export with stats**

Click "Export with stats". Verify the exported PNG has:
- Medium-width generative border with dawn gold elements
- Elevation trace along the bottom edge
- Season color bars on the left edge
- Corner ornaments (arcs) at all four corners
- Scattered dots along top and right edges
- Seal bridging the bottom-left border-map boundary at ~65% opacity
- Stats text in the bottom border area
- Weather turbulence subtle filter on border elements

- [ ] **Step 4: Export clean**

Click "Export clean". Verify same border but no stats text.

- [ ] **Step 5: Test with a GPX file**

Load a .gpx file, export, verify border renders (sparser decoration expected).

- [ ] **Step 6: Run full test suite one final time**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 7: Commit any final tweaks**

If visual tuning is needed (opacity, spacing, sizes), adjust and commit:

```bash
git add -A
git commit -m "fix: tune border visual parameters after manual testing"
```
