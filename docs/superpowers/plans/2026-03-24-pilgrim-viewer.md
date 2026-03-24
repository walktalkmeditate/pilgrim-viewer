# Pilgrim Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static, browser-based viewer for .pilgrim and .gpx walk files, deployed at view.pilgrimapp.org.

**Architecture:** Vanilla TypeScript + Vite single-page app. Two parsers (pilgrim, gpx) normalize into a shared Walk type. Mapbox GL JS renders routes. Sidebar panels show data that exists, hide what doesn't — the visible gap between GPX (2 panels) and .pilgrim (8 panels) markets the Pilgrim iOS app.

**Tech Stack:** TypeScript, Vite, Mapbox GL JS, JSZip, fast-xml-parser, vitest

**Spec:** `docs/superpowers/specs/2026-03-24-pilgrim-viewer-design.md`

**Deviations from spec project structure:** This plan adds `src/parsers/geo.ts` (Haversine/elevation utilities), `src/parsers/units.ts` (unit formatting), and `src/map/token.ts` (Mapbox token resolution) which are not in the spec's directory listing but are beneficial extractions. The spec places `index.html` under `public/`; this plan puts it at the root, which is standard Vite convention.

**Parallelizable tasks:** Tasks 3 and 4 (geo utils, unit formatting) are independent. Tasks 11 and 12 (stats panel, elevation panel) are independent. These can be run as parallel sub-agents.

---

## File Map

| File | Responsibility |
|------|---------------|
| `package.json` | Dependencies and scripts |
| `tsconfig.json` | TypeScript config (strict, ES2020, ESNext modules) |
| `vite.config.ts` | Vite build config |
| `index.html` | Single HTML page (root element, Google Fonts, Mapbox CSS) |
| `src/main.ts` | Entry point — wires dropzone, parsers, map, panels |
| `src/style.css` | All styles — design system tokens, layout, panels, responsive |
| `src/parsers/types.ts` | Walk, WalkStats, Weather, Activity, etc. type definitions |
| `src/parsers/pilgrim.ts` | Unzip .pilgrim, parse manifest + walks, derive activities |
| `src/parsers/gpx.ts` | Parse GPX XML, compute stats from trackpoints |
| `src/parsers/geo.ts` | Haversine distance, elevation gain — shared by both parsers |
| `src/parsers/units.ts` | Format distance/duration/elevation with unit preferences |
| `src/map/renderer.ts` | Single walk: route layer, start/end markers, activity colors |
| `src/map/overlay.ts` | Multi-walk: dark map, season colors, aggregate stats |
| `src/map/token.ts` | Mapbox token resolution (env var, localStorage, prompt) |
| `src/panels/stats.ts` | Distance, duration, elevation, steps panel |
| `src/panels/elevation.ts` | Canvas-drawn elevation sparkline |
| `src/panels/timeline.ts` | Activity segments bar (walk/talk/meditate) |
| `src/panels/transcriptions.ts` | Voice recording transcripts |
| `src/panels/weather.ts` | Temperature, condition, humidity, wind |
| `src/panels/intention.ts` | Intention + reflection text |
| `src/panels/celestial.ts` | Lunar phase, planetary positions, element balance |
| `src/ui/dropzone.ts` | Drag-and-drop + file picker |
| `src/ui/walk-list.ts` | Walk picker list for multi-walk files |
| `src/ui/layout.ts` | Orchestrates sidebar: panels, walk list, mode toggle |
| `tests/parsers/pilgrim.test.ts` | Pilgrim parser tests |
| `tests/parsers/gpx.test.ts` | GPX parser tests |
| `tests/parsers/geo.test.ts` | Geo utility tests |
| `tests/parsers/units.test.ts` | Unit formatting tests |
| `tests/fixtures/sample-walk.json` | Sample .pilgrim walk JSON (from iOS test data) |
| `tests/fixtures/sample-manifest.json` | Sample .pilgrim manifest JSON |
| `tests/fixtures/sample.gpx` | Sample GPX file (from CaminoSantiago.gpx) |
| `tests/fixtures/test.pilgrim` | Test .pilgrim ZIP for manual panel verification |
| `tests/parsers/integration.test.ts` | End-to-end parser pipeline tests |
| `tests/map/token.test.ts` | Mapbox token resolution tests |
| `tests/map/overlay.test.ts` | Season color utility tests |

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/style.css`

- [ ] **Step 1: Initialize package.json**

```json
{
  "name": "pilgrim-viewer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "license": "MIT"
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install mapbox-gl jszip fast-xml-parser`
Run: `npm install -D vite typescript vitest`

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "outDir": "dist",
    "sourceMap": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"]
  },
  "include": ["src", "tests"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create vite.config.ts**

```ts
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
})
```

- [ ] **Step 5: Create index.html**

Single HTML page with Google Fonts (Cormorant Garamond + Lato), Mapbox GL CSS, `<div id="app">`, and module script pointing to `src/main.ts`.

- [ ] **Step 6: Create src/main.ts placeholder**

Imports `style.css`, gets `#app` element, sets `textContent` to "Pilgrim Viewer" for verification.

- [ ] **Step 7: Create src/style.css with design system tokens**

CSS custom properties matching pilgrim-landing: `--parchment: #F5F0E8`, `--ink: #2C241E`, `--stone: #8B7355`, `--moss: #7A8B6F`, `--rust: #A0634B`, `--dawn: #C4956A`, `--fog: #B8AFA2`, `--parchment-secondary: #EDE6D8`, `--parchment-tertiary: #E4DBC9`. Font stacks: `--font-display` and `--font-body` as `'Cormorant Garamond', Georgia, serif`, `--font-ui` as `'Lato', 'Helvetica Neue', sans-serif`. Base styles: body background, color, font-family.

- [ ] **Step 8: Verify dev server starts**

Run: `npm run dev`
Expected: Vite dev server starts, page shows "Pilgrim Viewer" at localhost:5173.

- [ ] **Step 9: Verify build works**

Run: `npm run build`
Expected: `dist/` directory created with index.html and JS bundle.

- [ ] **Step 10: Add .gitignore**

```
node_modules
dist
.env.local
```

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src/main.ts src/style.css .gitignore
git commit -m "feat: scaffold project with Vite, TypeScript, and design system tokens"
```

---

### Task 2: Type Definitions

**Files:**
- Create: `src/parsers/types.ts`

- [ ] **Step 1: Create types.ts with all normalized types**

Define all interfaces from the spec: `Walk`, `WalkStats`, `Weather`, `Reflection`, `VoiceRecording`, `Activity`, `Pause`, `CelestialContext` (with nested `LunarPhase`, `PlanetaryPosition`, `PlanetaryHour`, `ElementBalance`). Also define `PilgrimManifest` and `PilgrimPreferences` for the raw .pilgrim format parsing. Export everything.

Key details:
- `Walk.source` is `'pilgrim' | 'gpx'`
- `Activity.type` is `'walk' | 'talk' | 'meditate'` (derived, not raw)
- Dates are `Date` objects (parsed from epoch seconds for .pilgrim, ISO strings for GPX)
- `Walk.route` is typed as `GeoJSONFeatureCollection` — define a minimal GeoJSON type (FeatureCollection, Feature, Geometry, Properties) rather than importing a dependency

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/parsers/types.ts
git commit -m "feat: add normalized Walk type definitions and GeoJSON types"
```

---

### Task 3: Geo Utilities + Tests

**Files:**
- Create: `src/parsers/geo.ts`, `tests/parsers/geo.test.ts`

- [ ] **Step 1: Write failing tests for geo utilities**

Tests to write:
- `haversineDistance` — known distance between two lat/lon pairs (e.g., San Francisco to Oakland, approx 13km)
- `haversineDistance` — zero distance for same point
- `haversineDistance` — antipodal points, approx half Earth circumference
- `totalDistance` — sum of sequential point pairs from a coordinate array
- `elevationGain` — compute ascent and descent from elevation array, ignoring noise below 2m threshold
- `elevationGain` — flat route returns 0/0
- `elevationGain` — empty array returns 0/0

```ts
import { describe, it, expect } from 'vitest'
import { haversineDistance, totalDistance, elevationGain } from '../../src/parsers/geo'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/parsers/geo.test.ts`
Expected: All tests FAIL (module not found).

- [ ] **Step 3: Implement geo.ts**

```ts
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toRad(deg: number): number {
  return deg * Math.PI / 180
}

export function totalDistance(coords: number[][]): number {
  let sum = 0
  for (let i = 1; i < coords.length; i++) {
    sum += haversineDistance(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0])
  }
  return sum
}

export function elevationGain(
  elevations: number[],
  threshold = 2
): { ascent: number; descent: number } {
  let ascent = 0
  let descent = 0
  for (let i = 1; i < elevations.length; i++) {
    const diff = elevations[i] - elevations[i - 1]
    if (diff > threshold) ascent += diff
    else if (diff < -threshold) descent += Math.abs(diff)
  }
  return { ascent, descent }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/parsers/geo.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parsers/geo.ts tests/parsers/geo.test.ts
git commit -m "feat: add Haversine distance and elevation gain utilities with tests"
```

---

### Task 4: Unit Formatting + Tests

**Files:**
- Create: `src/parsers/units.ts`, `tests/parsers/units.test.ts`

- [ ] **Step 1: Write failing tests for unit formatting**

Tests to write:
- `formatDistance` — 5432.1m in metric returns "5.43 km", in imperial returns "3.38 mi"
- `formatDistance` — 500m stays in meters under 1km: "500 m"
- `formatDuration` — 3600s returns "1h 0m", 90s returns "1m 30s", 7265s returns "2h 1m"
- `formatElevation` — 45.2m in metric returns "45 m", in imperial returns "148 ft"
- `formatSpeed` — from distance and duration, returns "min/km" or "min/mi"

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/parsers/units.test.ts`
Expected: All tests FAIL.

- [ ] **Step 3: Implement units.ts**

Export functions: `formatDistance(meters, unit)`, `formatDuration(seconds)`, `formatElevation(meters, unit)`, `formatSpeed(meters, seconds, unit)`. The `unit` parameter defaults to `'metric'` and accepts `'imperial'`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/parsers/units.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parsers/units.ts tests/parsers/units.test.ts
git commit -m "feat: add unit formatting (metric/imperial) with tests"
```

---

### Task 5: GPX Parser + Tests

**Files:**
- Create: `src/parsers/gpx.ts`, `tests/parsers/gpx.test.ts`, `tests/fixtures/sample.gpx`

- [ ] **Step 1: Create test fixture**

Copy a trimmed version of `../pilgrim-ios/ScreenshotTests/CaminoSantiago.gpx` into `tests/fixtures/sample.gpx` — keep approximately 10 trackpoints for fast tests. Also create a multi-track GPX string constant in the test file with two `<trk>` elements, each containing a `<trkseg>` with 3-4 `<trkpt>` entries.

- [ ] **Step 2: Write failing tests**

Tests to write:
- `parseGPX` — single track produces one Walk with correct id, dates, route, stats
- `parseGPX` — stats computed correctly (distance via Haversine, ascent/descent from elevation)
- `parseGPX` — route is valid GeoJSON FeatureCollection with one LineString feature
- `parseGPX` — coordinates are [lon, lat, alt] order
- `parseGPX` — Walk has `source: 'gpx'` and no pilgrim-only fields
- `parseGPX` — multi-track GPX produces Walk[] with one Walk per `<trk>`
- `parseGPX` — GPX with no `<trkpt>` elements throws descriptive error
- `parseGPX` — talkDuration and meditateDuration are 0 for GPX walks

```ts
import { describe, it, expect } from 'vitest'
import { parseGPX } from '../../src/parsers/gpx'
import { readFileSync } from 'fs'
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/parsers/gpx.test.ts`
Expected: All tests FAIL.

- [ ] **Step 4: Implement gpx.ts**

```ts
import { XMLParser } from 'fast-xml-parser'
import type { Walk, WalkStats, GeoJSONFeatureCollection, GeoJSONFeature } from './types'
import { totalDistance, elevationGain } from './geo'

export function parseGPX(xmlString: string): Walk[] { ... }
```

Parse with `fast-xml-parser` (options: `ignoreAttributes: false`, `attributeNamePrefix: '@_'`). Navigate `gpx.trk` (normalize to array). For each track: extract `trkseg.trkpt` array, build GeoJSON LineString, compute stats. Generate deterministic ID from track name + start time. Set `source: 'gpx'`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/parsers/gpx.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/parsers/gpx.ts tests/parsers/gpx.test.ts tests/fixtures/sample.gpx
git commit -m "feat: add GPX parser with stat computation and tests"
```

---

### Task 6: Pilgrim Parser + Tests

**Files:**
- Create: `src/parsers/pilgrim.ts`, `tests/parsers/pilgrim.test.ts`, `tests/fixtures/sample-walk.json`, `tests/fixtures/sample-manifest.json`

- [ ] **Step 1: Create test fixtures**

Create `tests/fixtures/sample-walk.json` — a realistic .pilgrim walk JSON based on the iOS test data shape. Include: route with 5 LineString coordinates, weather, 1 meditation activity, 1 voice recording with transcription, intention, reflection with celestialContext. Dates as epoch seconds.

Create `tests/fixtures/sample-manifest.json` — manifest with schemaVersion "1.0", preferences (distanceUnit: "km"), walkCount: 1.

- [ ] **Step 2: Write failing tests**

Tests to write:
- `parsePilgrimWalkJSON` — parses single walk JSON into normalized Walk type
- `parsePilgrimWalkJSON` — dates converted from epoch seconds to Date objects
- `parsePilgrimWalkJSON` — celestialContext hoisted from reflection to top-level celestial field
- `parsePilgrimWalkJSON` — activities derived: meditation from raw activities, talk from voiceRecordings, walk from remaining time
- `deriveActivities` — walk with only meditation: produces meditate + walk segments, no talk
- `deriveActivities` — walk with meditation and voice recording: produces all three types
- `deriveActivities` — overlapping voice recordings are merged before deriving talk segments
- `deriveActivities` — meditation at very start of walk: walk segment starts after meditation ends
- `deriveActivities` — walk with no raw activities and no recordings: single walk segment spanning full duration
- `parsePilgrimWalkJSON` — Walk has `source: 'pilgrim'`
- `parsePilgrimWalkJSON` — missing optional fields (weather, intention, reflection) result in undefined
- `parsePilgrimWalkJSON` — ignored fields (heartRates, workoutEvents, isRace) not on Walk
- `parsePilgrim` — accepts ArrayBuffer (ZIP), returns { manifest, walks }. Build the ZIP in the test using JSZip: create an ArrayBuffer programmatically from `sample-manifest.json` and `sample-walk.json` fixtures.
- `parsePilgrim` — invalid ZIP throws descriptive error

```ts
import { describe, it, expect } from 'vitest'
import { parsePilgrimWalkJSON, parsePilgrim } from '../../src/parsers/pilgrim'
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/parsers/pilgrim.test.ts`
Expected: All tests FAIL.

- [ ] **Step 4: Implement pilgrim.ts**

Two exported functions:

`parsePilgrimWalkJSON(raw: unknown): Walk` — takes parsed JSON, maps to normalized Walk. Key logic:
- Convert epoch seconds to Date objects for all date fields
- Hoist `raw.reflection?.celestialContext` to `walk.celestial`
- Strip celestialContext from reflection before assigning
- Derive activities: start with raw `activities` (type 'meditation' becomes 'meditate'), add 'talk' from voiceRecordings date ranges, compute 'walk' segments as gaps
- Set `source: 'pilgrim'`

`parsePilgrim(buffer: ArrayBuffer): Promise<{ manifest: PilgrimManifest; walks: Walk[] }>` — uses JSZip to unzip, reads `manifest.json` and `walks/*.json`, parses each.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/parsers/pilgrim.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/parsers/pilgrim.ts tests/parsers/pilgrim.test.ts tests/fixtures/sample-walk.json tests/fixtures/sample-manifest.json
git commit -m "feat: add Pilgrim parser with activity derivation and tests"
```

---

### Task 6b: Parser Integration Test

**Files:**
- Create: `tests/parsers/integration.test.ts`

- [ ] **Step 1: Write integration test**

Test the full parse-to-Walk pipeline for both formats:
- Load `tests/fixtures/sample.gpx`, parse with `parseGPX`, assert Walk array shape (correct number of walks, each has id, startDate, endDate, stats with expected fields, route with FeatureCollection, source === 'gpx', no pilgrim-only fields)
- Build a .pilgrim ZIP from `tests/fixtures/sample-manifest.json` + `tests/fixtures/sample-walk.json` using JSZip, parse with `parsePilgrim`, assert Walk array shape (correct walk count, has weather, intention, activities, celestial, source === 'pilgrim')
- Verify both formats produce walks that satisfy the same structural contract (id, stats, route always present)

- [ ] **Step 2: Run tests**

Run: `npm test -- tests/parsers/integration.test.ts`
Expected: All PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/parsers/integration.test.ts
git commit -m "test: add parser integration tests for both file formats"
```

---

### Task 7: Mapbox Token Resolution + Tests

**Files:**
- Create: `src/map/token.ts`, `tests/map/token.test.ts`

- [ ] **Step 1: Write failing tests**

Tests to write (mock `localStorage` and `import.meta.env` via vitest):
- `getMapboxToken` — returns env var when set
- `getMapboxToken` — returns localStorage value when no env var
- `getMapboxToken` — returns null when neither source has a token
- `getMapboxToken` — env var takes priority over localStorage
- `saveMapboxToken` — stores in localStorage and is retrievable by `getMapboxToken`

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/map/token.test.ts`
Expected: All tests FAIL.

- [ ] **Step 3: Implement token.ts**

Export `getMapboxToken()`: checks `import.meta.env.VITE_MAPBOX_TOKEN` first, then `localStorage` key `'pilgrim-viewer-mapbox-token'`. Returns string or null.

Export `saveMapboxToken(token)`: saves to localStorage.

Export `renderTokenPrompt(container, onToken)`: renders a friendly form explaining how to get a Mapbox token. On submit, calls `saveMapboxToken()` then `onToken()`. Uses `textContent` and safe DOM methods for all text rendering.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/map/token.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/map/token.ts tests/map/token.test.ts
git commit -m "feat: add Mapbox token resolution (env, localStorage, prompt) with tests"
```

---

### Task 8: Drop Zone UI

**Files:**
- Create: `src/ui/dropzone.ts`
- Modify: `src/main.ts`, `src/style.css`

- [ ] **Step 1: Implement dropzone.ts**

Export `createDropZone(container, onFile)` that:
- Creates full-page drop zone with heading text "Drop .pilgrim or .gpx file" (using `textContent`)
- Adds a file picker `<input type="file" accept=".pilgrim,.gpx">` as fallback button
- Listens for `dragover`, `dragleave`, `drop` events on the container
- On drop/select: validates extension, reads as ArrayBuffer, calls `onFile(name, buffer)`
- Shows error inline (using `textContent`) if file has wrong extension
- Styling: centered text, dashed border, highlights on dragover
- All DOM content set via `textContent` or safe DOM creation methods — never use innerHTML with user content

- [ ] **Step 2: Wire into main.ts**

Import `createDropZone`, attach to `#app`. On file received, log to console for now.

- [ ] **Step 3: Add drop zone styles to style.css**

Centered layout, dashed `--fog` border, `--parchment` background, Cormorant Garamond heading, Lato button text. Drag-active state: border changes to `--stone`. File picker button styled as minimal outline button.

- [ ] **Step 4: Manual test**

Run: `npm run dev`
Test: Drag a file onto the page, verify console log. Click the button, verify file picker opens. Drag a .txt file, verify error message.

- [ ] **Step 5: Commit**

```bash
git add src/ui/dropzone.ts src/main.ts src/style.css
git commit -m "feat: add drag-and-drop file zone with file picker fallback"
```

---

### Task 9: File Routing (Detect Format + Parse)

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Wire parsers into the drop zone callback**

On file drop:
- Check extension: `.pilgrim` calls `parsePilgrim(buffer)`, `.gpx` decodes buffer to text and calls `parseGPX(text)`
- Catch errors and show inline error message (using `textContent`)
- Log parsed walks to console for verification

- [ ] **Step 2: Manual test with real files**

Run: `npm run dev`
Test with `../pilgrim-ios/ScreenshotTests/CaminoSantiago.gpx` — verify console shows 1 walk with correct stats.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire file detection and parsing into drop zone"
```

---

### Task 10: Map Renderer (Single Walk)

**Files:**
- Create: `src/map/renderer.ts`
- Modify: `src/style.css`, `src/main.ts`

- [ ] **Step 1: Implement renderer.ts**

Export `createMapRenderer(container)` that:
- Initializes Mapbox GL map with `light-v11` style
- Returns an object with `showWalk(walk: Walk)` and `clear()` methods

`showWalk(walk)`:
- Extract LineString features from `walk.route` (ignore Point features — waypoints)
- Add route as GeoJSON source + line layer (3px, `--stone` color `#8B7355`)
- If walk has activities AND route has timestamps in GeoJSON properties: split the LineString into color-coded segments by matching activity time ranges to coordinate timestamps. The .pilgrim GeoJSON stores `properties.timestamps` as an array parallel to the coordinates array. Use binary search to find the coordinate index for each activity start/end time, then slice the coordinates into sub-LineStrings per activity. Colors: moss `#7A8B6F` (walk), dawn `#C4956A` (talk), rust `#A0634B` (meditate). Add each as a separate layer.
- If walk has activities but NO coordinate timestamps (e.g., GPX without time data): fall back to uniform `--stone` color for the whole route.
- Add start marker (circle, moss) and end marker (circle, rust)
- Fit bounds to route with padding

`clear()`:
- Remove all sources and layers

- [ ] **Step 2: Add map container styles**

CSS: `#map` fills available space (flex-grow: 1, min-height: 400px). Main layout: sidebar (320px) + map (flex).

- [ ] **Step 3: Wire into main.ts**

After parsing, create map container, initialize renderer, call `showWalk(walks[0])`.

- [ ] **Step 4: Manual test**

Run: `npm run dev`
Drop CaminoSantiago.gpx — map shows route with start/end markers, bounds fit.

- [ ] **Step 5: Commit**

```bash
git add src/map/renderer.ts src/main.ts src/style.css
git commit -m "feat: add Mapbox map renderer with route display and markers"
```

---

### Task 11: Stats Panel

**Files:**
- Create: `src/panels/stats.ts`
- Modify: `src/style.css`

- [ ] **Step 1: Implement stats.ts**

Export `renderStatsPanel(container, walk, unitPrefs?)` that:
- Creates a panel section with heading "Stats"
- Shows: distance, active duration, elevation gain/loss, steps (if present), burned energy (if present)
- For .pilgrim walks with walk/talk/meditate durations > 0: show three-way time breakdown as a horizontal stacked bar (moss/dawn/rust) with labels
- Uses `units.ts` formatting functions
- `unitPrefs` comes from manifest preferences; defaults to metric
- Includes a metric/imperial toggle button (small, Lato font, pill-shaped). Clicking re-renders all stat values in the selected unit system. Stores preference in localStorage key `'pilgrim-viewer-units'`.
- All text set via `textContent` — no innerHTML with dynamic data

- [ ] **Step 2: Add panel styles**

Panel container: `--parchment-secondary` background, padding, small border-radius. Stat rows: Lato font, label (fog) + value (ink). Breakdown bar: flex row with proportional widths, rounded corners on ends.

- [ ] **Step 3: Wire into main.ts**

After map renders, create sidebar container, call `renderStatsPanel`.

- [ ] **Step 4: Manual test**

Drop GPX — stats panel shows distance, duration, elevation. No breakdown bar (no activity data).

- [ ] **Step 5: Commit**

```bash
git add src/panels/stats.ts src/main.ts src/style.css
git commit -m "feat: add stats panel with distance, duration, elevation"
```

---

### Task 12: Elevation Profile Panel

**Files:**
- Create: `src/panels/elevation.ts`

- [ ] **Step 1: Implement elevation.ts**

Export `renderElevationPanel(container, walk)` that:
- Extracts elevation values from route coordinates (3rd element of each coordinate)
- If no elevation data: don't render (return early)
- Creates a `<canvas>` element (width: panel width, height: 80px)
- Draws elevation sparkline: fill below the line with translucent `--moss`, stroke with `--stone`
- X axis: evenly spaced points. Y axis: min-max of elevations with small padding
- Label: min and max elevation values at bottom corners (set via `textContent`)

- [ ] **Step 2: Add canvas styles**

Canvas: full panel width, 80px height, `--parchment-secondary` background, small border-radius.

- [ ] **Step 3: Manual test**

Drop CaminoSantiago.gpx — elevation panel shows descending profile (370m to 260m).

- [ ] **Step 4: Commit**

```bash
git add src/panels/elevation.ts src/main.ts src/style.css
git commit -m "feat: add canvas-drawn elevation sparkline panel"
```

---

### Task 13a: Text Panels (Intention, Weather, Transcriptions)

**Files:**
- Create: `src/panels/intention.ts`, `src/panels/weather.ts`, `src/panels/transcriptions.ts`
- Modify: `src/style.css`

These panels render text/data from the Walk object. Each checks if data exists, renders if so, skips if not. All text set via `textContent` or safe DOM methods.

- [ ] **Step 1: Implement intention.ts**

Export `renderIntentionPanel(container, walk)`. Shows intention text (if present) in italic Cormorant Garamond. Below it, reflection text (if present) with reflection style label.

- [ ] **Step 2: Implement weather.ts**

Export `renderWeatherPanel(container, walk)`. Shows temperature (C/F based on unit prefs), condition (human-readable mapping from condition codes like "partly_cloudy" to "Partly Cloudy"), humidity %, wind speed.

- [ ] **Step 3: Implement transcriptions.ts**

Export `renderTranscriptionsPanel(container, walk)`. For each voiceRecording with a transcription: show timestamp (relative to walk start), transcription text, and a subtle "enhanced" indicator if `isEnhanced` is true. Scrollable if many transcriptions.

- [ ] **Step 4: Add styles**

Intention panel: larger italic serif text. Weather: temperature prominent, condition/humidity/wind in smaller text. Transcriptions: scrollable list with timestamps in `--fog` color.

- [ ] **Step 5: Commit**

```bash
git add src/panels/intention.ts src/panels/weather.ts src/panels/transcriptions.ts src/style.css
git commit -m "feat: add intention, weather, and transcriptions panels"
```

---

### Task 13b: Timeline Panel

**Files:**
- Create: `src/panels/timeline.ts`
- Modify: `src/style.css`

- [ ] **Step 1: Implement timeline.ts**

Export `renderTimelinePanel(container, walk)`. Horizontal bar showing activity segments proportional to their duration within the walk timespan. Colors: moss (walk), dawn (talk), rust (meditate). Pauses shown as gaps (parchment background). Time labels at start and end. If no activities, don't render.

- [ ] **Step 2: Add timeline styles**

Fixed-height bar (24px), rounded corners on outer ends. Segments are inline-block divs with proportional widths. Small legend below with color dots + labels.

- [ ] **Step 3: Commit**

```bash
git add src/panels/timeline.ts src/style.css
git commit -m "feat: add activity timeline panel"
```

---

### Task 13c: Celestial Panel

**Files:**
- Create: `src/panels/celestial.ts`
- Modify: `src/style.css`

- [ ] **Step 1: Implement celestial.ts**

Export `renderCelestialPanel(container, walk)`. If no `walk.celestial`, don't render. Shows:
- Lunar phase: name + illumination % + waxing/waning indicator
- Planetary hour: planet + day
- Element balance: four elements with integer counts, dominant highlighted
- Planetary positions: compact table (planet, sign, degree, retrograde indicator)
- Seasonal marker if present
- All text via `textContent`

- [ ] **Step 2: Add celestial styles**

Compact grid layout. Lunar phase section at top. Element balance as four small badges. Planetary positions as a minimal table with alternating row backgrounds.

- [ ] **Step 3: Commit**

```bash
git add src/panels/celestial.ts src/style.css
git commit -m "feat: add celestial context panel"
```

---

### Task 13d: Build Test .pilgrim File + Verify All Panels

**Files:**
- Create: `tests/fixtures/test.pilgrim`

- [ ] **Step 1: Build a test .pilgrim ZIP**

Write a small script or use the test fixtures to create a valid `.pilgrim` ZIP file containing `manifest.json` (from `tests/fixtures/sample-manifest.json`) and `walks/<uuid>.json` (from `tests/fixtures/sample-walk.json`). Save as `tests/fixtures/test.pilgrim`. This can be done with a node script using JSZip, or manually with the `zip` command.

- [ ] **Step 2: Manual test with both file types**

Run: `npm run dev`
1. Drop the test `.pilgrim` file — all 8 panels should render (stats, elevation, timeline, intention, weather, transcriptions, celestial, plus walk/talk/meditate breakdown in stats)
2. Drop a `.gpx` file — only stats and elevation panels should appear. All pilgrim-only panels should NOT render.

- [ ] **Step 3: Commit test fixture**

```bash
git add tests/fixtures/test.pilgrim
git commit -m "test: add test .pilgrim fixture for manual panel verification"
```

---

### Task 14: Layout Orchestration

**Files:**
- Create: `src/ui/layout.ts`
- Modify: `src/main.ts`, `src/style.css`

- [ ] **Step 1: Implement layout.ts**

Export `createLayout(app)` that:
- Creates the page structure: header + main area (sidebar + map)
- Header: "Pilgrim Viewer" wordmark (Cormorant Garamond), GitHub link, "Open another file" button (hidden until file loaded)
- Sidebar: scrollable container for panels
- Returns `{ sidebar, mapContainer, header, showFileLoaded(source) }`
- `showFileLoaded(source)`: shows "Open another file" button in header. Clicking it triggers a hidden file input (reuses the dropzone file picker logic). If `source === 'pilgrim'`, show subtle "Recorded with Pilgrim" badge in the sidebar footer linking to the app.
- All text set via `textContent`, links created via safe DOM methods with hardcoded URLs (repo URL, app URL)

Export `renderPanels(sidebar, walk, manifest?)` that:
- Clears sidebar (sets `textContent = ''`)
- Calls each panel renderer in order: stats, elevation, timeline, intention, weather, transcriptions, celestial
- Each panel self-hides if no data — the function just calls them all

- [ ] **Step 2: Wire everything in main.ts**

Replace the current ad-hoc wiring. On file drop: parse, call `renderPanels(sidebar, walk)` + `mapRenderer.showWalk(walk)`. Show header "open another" button. For single walk: render immediately. For multi-walk: show walk list (next task).

- [ ] **Step 3: Add layout styles**

Header: fixed top, `--parchment` background, `--stone` text. Sidebar: 320px width, `--parchment` background, overflow-y scroll, panel spacing. Map: flex-grow. Footer: small, bottom of sidebar. Mobile: sidebar becomes bottom sheet (position: fixed, bottom: 0, max-height: 50vh).

- [ ] **Step 4: Manual test**

Drop GPX — header shows, sidebar has stats + elevation, map shows route. Everything looks cohesive.

- [ ] **Step 5: Commit**

```bash
git add src/ui/layout.ts src/main.ts src/style.css
git commit -m "feat: add layout orchestration with sidebar, header, and panel rendering"
```

---

### Task 15: Walk List (Multi-Walk)

**Files:**
- Create: `src/ui/walk-list.ts`
- Modify: `src/ui/layout.ts`, `src/main.ts`

- [ ] **Step 1: Implement walk-list.ts**

Export `createWalkList(container, walks, onSelect)` that:
- Renders compact list of walks: formatted date, distance, duration per row (all via `textContent`)
- Highlights selected walk
- Click calls `onSelect(walk)` with the clicked Walk
- Auto-selects first walk on creation

- [ ] **Step 2: Integrate into layout**

In `main.ts`: if `walks.length > 1`, render walk list at top of sidebar. Below it, render panels for the selected walk. On walk select, re-render panels and update map.

- [ ] **Step 3: Add walk list styles**

List items: Lato font, compact rows, hover state (`--parchment-secondary`), selected state (`--parchment-tertiary` + left border in `--stone`).

- [ ] **Step 4: Manual test**

Create a multi-track GPX or multi-walk .pilgrim. Drop it — walk list appears, clicking switches map and panels.

- [ ] **Step 5: Commit**

```bash
git add src/ui/walk-list.ts src/ui/layout.ts src/main.ts src/style.css
git commit -m "feat: add walk list for multi-walk files with selection"
```

---

### Task 16: Overlay View (Multi-Walk Life Map)

**Files:**
- Create: `src/map/overlay.ts`, `tests/map/overlay.test.ts`
- Modify: `src/ui/layout.ts`, `src/main.ts`, `src/style.css`

- [ ] **Step 0: Write tests for season color utility**

Extract `getSeasonColor(date: Date): string` as a testable function. Tests:
- January date returns `#6B8EAE` (winter blue)
- April date returns moss color (spring)
- July date returns dawn color (summer)
- October date returns rust color (autumn)
- Boundary months: March (spring), June (summer), September (autumn), December (winter)

Run: `npm test -- tests/map/overlay.test.ts`

- [ ] **Step 1: Implement overlay.ts**

Export `createOverlayRenderer(container)` that:
- Initializes (or re-styles existing) Mapbox map with `dark-v11`
- Returns `{ showAllWalks(walks), highlightWalk(walk), clear() }`

`showAllWalks(walks)`:
- Add each walk as a GeoJSON source + line layer
- Color by season: month of startDate determines color — moss (Mar-May), dawn (Jun-Aug), rust (Sep-Nov), `#6B8EAE` (Dec-Feb)
- Line width: 1.5px, opacity: 0.6
- Fit bounds to all walks
- Show floating stat bar with walk count, total distance, season count (text via `textContent`)
- Add click handler on route layers for highlighting

`highlightWalk(walk)`:
- Increase opacity/width of selected walk
- Return walk for sidebar to show panels

`clearSelection()`:
- Reset all route styles to default (1.5px, 0.6 opacity)
- Sidebar returns to aggregate stats view
- Triggered by: clicking empty map area, or clicking a "Clear selection" button in the sidebar

- [ ] **Step 2: Add mode toggle**

In `layout.ts`: when multi-walk, add a toggle button at top of sidebar ("List" / "Overlay"). Toggle switches between walk-list mode (single walk map) and overlay mode (dark map, all walks). In overlay mode, when a walk is selected, show a "Back to list" link above the walk panels that switches back to list mode.

- [ ] **Step 3: Wire into main.ts**

Mode switching: create both renderers but only show one. Toggle swaps which is visible and updates sidebar content.

- [ ] **Step 4: Add overlay styles**

Floating stat bar: absolute positioned over map, `--parchment` background at 90% opacity, backdrop blur, Lato font, small border-radius. Mode toggle: pill-shaped toggle button.

- [ ] **Step 5: Manual test**

Multi-walk file: list mode works as before. Click overlay toggle — dark map, all routes visible with season colors, stat bar shown. Click a route — sidebar shows that walk's details. Toggle back — returns to list mode with selection preserved.

- [ ] **Step 6: Commit**

```bash
git add src/map/overlay.ts src/ui/layout.ts src/main.ts src/style.css
git commit -m "feat: add overlay view with season-colored routes and mode toggle"
```

---

### Task 17: Mobile Responsive + Polish

**Files:**
- Modify: `src/style.css`, `src/ui/layout.ts`

- [ ] **Step 1: Add responsive breakpoints**

At `max-width: 768px`:
- Sidebar becomes bottom sheet (fixed, bottom: 0, full width, max-height: 50vh, draggable handle)
- Map goes full width/height
- Drop zone: remove "Drop" language, keep file picker button prominent ("Open file")
- Walk list: horizontal scroll if many walks

- [ ] **Step 2: Add branding footer**

Bottom of sidebar: "Open source / MIT License" with GitHub repo link. Subtle "Recorded with Pilgrim" badge on .pilgrim files with link to app (hardcoded URL). Small Pilgrim Viewer wordmark. All links created via safe DOM methods.

- [ ] **Step 3: Polish interactions**

- Panel expand/collapse: add chevron indicator, `max-height` transition
- Drop zone to loaded state transition: smooth fade
- Error messages: inline, dismissible, `--rust` colored text

- [ ] **Step 4: Manual test on mobile**

Use browser dev tools to test at 375px and 768px widths. Verify: bottom sheet, file picker, panels scroll, map visible.

- [ ] **Step 5: Commit**

```bash
git add src/style.css src/ui/layout.ts
git commit -m "feat: add mobile responsive layout and UI polish"
```

---

### Task 18: Build, Deploy Config, Final Verification

**Files:**
- Create: `.github/workflows/deploy.yml`, `.env.example`

- [ ] **Step 1: Create .env.example**

```
VITE_MAPBOX_TOKEN=your_mapbox_token_here
```

- [ ] **Step 2: Create GitHub Actions workflow**

`.github/workflows/deploy.yml`:
- Trigger: push to main
- Steps: checkout, setup Node 20, npm ci, typecheck, test, build
- Deploy step: placeholder for Cloudflare Pages (wrangler pages deploy dist/)
- Env: `VITE_MAPBOX_TOKEN` from GitHub secrets

- [ ] **Step 3: Final verification**

Run: `npm run typecheck && npm test && npm run build`
Expected: All pass, `dist/` contains index.html + JS/CSS bundle.

- [ ] **Step 4: Manual end-to-end test**

Run: `npm run preview`
Test both file types:
1. Drop a .gpx file — map + stats + elevation panels
2. Drop a .pilgrim file (or test ZIP) — map + all 8 panels
3. Multi-walk file — walk list + overlay toggle
4. No Mapbox token — friendly prompt appears

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy.yml .env.example
git commit -m "feat: add CI/CD workflow and env example"
```

- [ ] **Step 6: Push to remote**

```bash
git push -u origin main
```
