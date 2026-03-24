# Overlay Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add time-of-day color palette, PNG export (with stats and clean), and Year in Review to the overlay view.

**Architecture:** All three features build on the existing overlay renderer (`src/map/overlay.ts`). Time-of-day adds a second color mapping and `setColorMode()`. Export captures the Mapbox WebGL canvas. Year in Review filters walks before passing to `showAllWalks()`. New file `src/map/export.ts` handles PNG capture. The overlay sidebar in `src/ui/layout.ts` gets three new sections: color switcher, export buttons, year picker.

**Tech Stack:** Mapbox GL JS (preserveDrawingBuffer), Canvas 2D API, existing TypeScript/Vite stack

**Spec:** `docs/superpowers/specs/2026-03-24-overlay-enhancements-design.md`

**Parallelizable tasks:** Tasks 1 and 2 are independent. Task 3 depends on Task 1. Task 4 depends on Tasks 2 and 3. Tasks 5 and 6 depend on Task 4.

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/map/overlay.ts` | Add `preserveDrawingBuffer`, `setColorMode()`, `getStatsText()`, export `getTimeOfDayColor`, `getWalkColor`, `getDominantTimeBucket`, `ColorMode` type |
| `src/map/export.ts` | New — PNG capture (with-stats and clean), download trigger, filename generation |
| `src/ui/layout.ts` | Add color mode switcher, export buttons, year picker to overlay sidebar |
| `src/main.ts` | Wire color mode, export, and year filtering into `renderMultiWalk` |
| `src/style.css` | Styles for color switcher, export buttons, year picker |
| `tests/map/overlay.test.ts` | Tests for `getTimeOfDayColor`, `getDominantTimeBucket` |
| `tests/map/export.test.ts` | Tests for filename generation, stats text formatting |

---

### Task 1: Time-of-Day Color Functions + Tests

**Files:**
- Modify: `src/map/overlay.ts`
- Modify: `tests/map/overlay.test.ts`

- [ ] **Step 1: Write failing tests for `getTimeOfDayColor`**

Add to `tests/map/overlay.test.ts`:

```ts
import { getSeasonColor, getTimeOfDayColor, getWalkColor, getDominantTimeBucket } from '../../src/map/overlay'
```

Tests:
- `getTimeOfDayColor` — 6am → `#C4956A` (dawn)
- `getTimeOfDayColor` — 12pm → `#E8E0D4` (midday)
- `getTimeOfDayColor` — 17pm → `#D4874D` (dusk)
- `getTimeOfDayColor` — 22pm → `#6B8EAE` (night)
- `getTimeOfDayColor` — 5am (boundary) → `#C4956A` (dawn)
- `getTimeOfDayColor` — 4am → `#6B8EAE` (night)
- `getTimeOfDayColor` — 10am (boundary) → `#E8E0D4` (midday)
- `getTimeOfDayColor` — 16pm (boundary) → `#D4874D` (dusk)
- `getWalkColor` — season mode delegates to `getSeasonColor`
- `getWalkColor` — timeOfDay mode delegates to `getTimeOfDayColor`
- `getDominantTimeBucket` — mostly morning walks → "mostly mornings"
- `getDominantTimeBucket` — tie goes to earlier bucket
- `getDominantTimeBucket` — single walk → that walk's bucket name

Use BDD-style `#given`, `#when`, `#then` comments.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/map/overlay.test.ts`

- [ ] **Step 3: Implement color functions in overlay.ts**

Add to `src/map/overlay.ts`:

```ts
export type ColorMode = 'season' | 'timeOfDay'

const TIME_COLORS = {
  dawn: '#C4956A',
  midday: '#E8E0D4',
  dusk: '#D4874D',
  night: '#6B8EAE',
}

const TIME_LABELS: Record<string, string> = {
  dawn: 'mornings',
  midday: 'middays',
  dusk: 'evenings',
  night: 'nights',
}

export function getTimeOfDayColor(date: Date): string {
  const hour = date.getHours()
  if (hour >= 5 && hour < 10) return TIME_COLORS.dawn
  if (hour >= 10 && hour < 16) return TIME_COLORS.midday
  if (hour >= 16 && hour < 20) return TIME_COLORS.dusk
  return TIME_COLORS.night
}

function getTimeBucket(date: Date): string {
  const hour = date.getHours()
  if (hour >= 5 && hour < 10) return 'dawn'
  if (hour >= 10 && hour < 16) return 'midday'
  if (hour >= 16 && hour < 20) return 'dusk'
  return 'night'
}

export function getWalkColor(walk: Walk, mode: ColorMode): string {
  return mode === 'timeOfDay' ? getTimeOfDayColor(walk.startDate) : getSeasonColor(walk.startDate)
}

export function getDominantTimeBucket(walks: Walk[]): string {
  const counts: Record<string, number> = { dawn: 0, midday: 0, dusk: 0, night: 0 }
  for (const walk of walks) counts[getTimeBucket(walk.startDate)]++
  const order = ['dawn', 'midday', 'dusk', 'night']
  let best = order[0]
  for (const bucket of order) {
    if (counts[bucket] > counts[best]) best = bucket
  }
  return `mostly ${TIME_LABELS[best]}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/map/overlay.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/map/overlay.ts tests/map/overlay.test.ts
git commit -m "feat: add time-of-day color palette functions with tests"
```

---

### Task 2: PNG Export Module + Tests

**Files:**
- Create: `src/map/export.ts`
- Create: `tests/map/export.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { generateFilename, generateStatsText } from '../../src/map/export'
```

Tests:
- `generateFilename('stats', null)` → `'pilgrim-overlay.png'`
- `generateFilename('clean', null)` → `'pilgrim-overlay-clean.png'`
- `generateFilename('stats', 2026)` → `'pilgrim-2026.png'`
- `generateFilename('clean', 2026)` → `'pilgrim-2026-clean.png'`
- `generateStatsText` with season mode, no year → `'5 walks · 12.3 km · 3 seasons'`
- `generateStatsText` with season mode, year 2026 → `'Your 2026 · 5 walks · 12.3 km · 3 seasons'`
- `generateStatsText` with timeOfDay mode → `'5 walks · 12.3 km · mostly mornings'`

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement export.ts**

```ts
import type { Walk } from '../parsers/types'
import type { ColorMode } from './overlay'
import { formatDistance } from '../parsers/units'
import { getDominantTimeBucket } from './overlay'

export function generateFilename(
  variant: 'stats' | 'clean',
  selectedYear: number | null,
): string {
  const base = selectedYear ? `pilgrim-${selectedYear}` : 'pilgrim-overlay'
  return variant === 'clean' ? `${base}-clean.png` : `${base}.png`
}

export function generateStatsText(
  walks: Walk[],
  colorMode: ColorMode,
  selectedYear: number | null,
): string {
  const count = walks.length
  const distance = formatDistance(walks.reduce((s, w) => s + w.stats.distance, 0))

  let detail: string
  if (colorMode === 'timeOfDay') {
    detail = getDominantTimeBucket(walks)
  } else {
    const seasons = new Set(walks.map((w) => {
      const m = w.startDate.getMonth()
      if (m >= 2 && m <= 4) return 'spring'
      if (m >= 5 && m <= 7) return 'summer'
      if (m >= 8 && m <= 10) return 'autumn'
      return 'winter'
    }))
    detail = `${seasons.size} season${seasons.size !== 1 ? 's' : ''}`
  }

  const prefix = selectedYear ? `Your ${selectedYear} \u00B7 ` : ''
  return `${prefix}${count} walks \u00B7 ${distance} \u00B7 ${detail}`
}

const FOOTER_HEIGHT = 60
const FOOTER_BG = '#1C1914'
const FOOTER_TEXT_COLOR = '#F0EBE1'
const FOOTER_FONT_SIZE = 14
const FOOTER_FONT = 'Lato, Helvetica Neue, sans-serif'

export function exportWithStats(
  map: mapboxgl.Map,
  statsText: string,
  filename: string,
): void {
  const mapCanvas = map.getCanvas()
  const width = mapCanvas.width
  const height = mapCanvas.height
  const dpr = window.devicePixelRatio || 1
  const footerH = FOOTER_HEIGHT * dpr

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height + footerH

  const ctx = canvas.getContext('2d')!
  ctx.drawImage(mapCanvas, 0, 0)

  ctx.fillStyle = FOOTER_BG
  ctx.fillRect(0, height, width, footerH)

  ctx.fillStyle = FOOTER_TEXT_COLOR
  ctx.font = `${FOOTER_FONT_SIZE * dpr}px ${FOOTER_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(statsText, width / 2, height + footerH / 2)

  triggerDownload(canvas.toDataURL('image/png'), filename)
}

export function exportClean(
  map: mapboxgl.Map,
  container: HTMLElement,
  filename: string,
): void {
  const statsBar = container.querySelector<HTMLElement>('.overlay-stats')
  const controls = container.querySelector<HTMLElement>('.mapboxgl-control-container')

  if (statsBar) statsBar.style.display = 'none'
  if (controls) controls.style.display = 'none'

  const dataUrl = map.getCanvas().toDataURL('image/png')

  if (statsBar) statsBar.style.display = ''
  if (controls) controls.style.display = ''

  triggerDownload(dataUrl, filename)
}

function triggerDownload(dataUrl: string, filename: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
```

Note: `exportWithStats` and `exportClean` use DOM/canvas APIs and are not unit-testable without jsdom + canvas mocking. Only `generateFilename` and `generateStatsText` get unit tests.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add src/map/export.ts tests/map/export.test.ts
git commit -m "feat: add PNG export module with filename and stats text generation"
```

---

### Task 3: Overlay Renderer — setColorMode + preserveDrawingBuffer

**Files:**
- Modify: `src/map/overlay.ts`

- [ ] **Step 1: Add `preserveDrawingBuffer: true` to map initialization**

In `createOverlayRenderer`, change:
```ts
const map = new mapboxgl.Map({
  container,
  style: 'mapbox://styles/mapbox/dark-v11',
})
```
To:
```ts
const map = new mapboxgl.Map({
  container,
  style: 'mapbox://styles/mapbox/dark-v11',
  preserveDrawingBuffer: true,
})
```

- [ ] **Step 2: Add `setColorMode` method**

Track current color mode in a module-level variable. When `setColorMode` is called, iterate all active layers and update `line-color` via `map.setPaintProperty()`. Also update the stats bar text.

```ts
let currentColorMode: ColorMode = 'season'

function setColorMode(mode: ColorMode): void {
  currentColorMode = mode
  for (let i = 0; i < currentWalks.length; i++) {
    const lid = layerId(i)
    if (!map.getLayer(lid)) continue
    map.setPaintProperty(lid, 'line-color', getWalkColor(currentWalks[i], mode))
  }
  createStatsBar(currentWalks)
}
```

- [ ] **Step 3: Update `addWalkLayer` to use `currentColorMode`**

Change line 150 from:
```ts
'line-color': getSeasonColor(walk.startDate),
```
To:
```ts
'line-color': getWalkColor(walk, currentColorMode),
```

- [ ] **Step 4: Update `createStatsBar` to use `currentColorMode`**

Update the stats text to adapt based on color mode. Import `generateStatsText` from `./export` and use it, or inline the logic. Pass the current `selectedYear` (initially null — will be wired in Task 5).

Add a `selectedYear` variable:
```ts
let selectedYear: number | null = null
```

Update `createStatsBar`:
```ts
function createStatsBar(walks: Walk[]): void {
  removeStatsBar()
  const bar = document.createElement('div')
  bar.className = 'overlay-stats'
  bar.textContent = generateStatsText(walks, currentColorMode, selectedYear)
  container.appendChild(bar)
  statsBar = bar
}
```

- [ ] **Step 5: Update `OverlayRenderer` interface and return**

Add to interface:
```ts
setColorMode(mode: ColorMode): void
getStatsText(): string
```

Add `getStatsText` that returns the current stats bar text for export:
```ts
function getStatsText(): string {
  return generateStatsText(currentWalks, currentColorMode, selectedYear)
}
```

Add both to the return object.

- [ ] **Step 6: Verify typecheck and existing tests still pass**

Run: `npm run typecheck && npm test`

- [ ] **Step 7: Commit**

```bash
git add src/map/overlay.ts
git commit -m "feat: add setColorMode, preserveDrawingBuffer, and stats text generation to overlay"
```

---

### Task 4: Overlay Sidebar — Color Switcher + Export Buttons

**Files:**
- Modify: `src/ui/layout.ts`
- Modify: `src/style.css`

- [ ] **Step 1: Add `renderColorSwitcher` function to layout.ts**

```ts
export function renderColorSwitcher(
  container: HTMLElement,
  onChange: (mode: ColorMode) => void,
): { setMode: (mode: ColorMode) => void } {
  const wrapper = document.createElement('div')
  wrapper.className = 'color-switcher'

  const label = document.createElement('span')
  label.className = 'color-switcher-label'
  label.textContent = 'Color by'

  const seasonBtn = document.createElement('button')
  seasonBtn.className = 'color-switcher-option active'
  seasonBtn.textContent = 'Season'

  const timeBtn = document.createElement('button')
  timeBtn.className = 'color-switcher-option'
  timeBtn.textContent = 'Time of Day'

  seasonBtn.addEventListener('click', () => { setMode('season'); onChange('season') })
  timeBtn.addEventListener('click', () => { setMode('timeOfDay'); onChange('timeOfDay') })

  wrapper.appendChild(label)
  wrapper.appendChild(seasonBtn)
  wrapper.appendChild(timeBtn)
  container.appendChild(wrapper)

  function setMode(mode: ColorMode): void {
    seasonBtn.classList.toggle('active', mode === 'season')
    timeBtn.classList.toggle('active', mode === 'timeOfDay')
  }

  return { setMode }
}
```

Import `ColorMode` from `../map/overlay`.

- [ ] **Step 2: Add `renderExportButtons` function to layout.ts**

```ts
export function renderExportButtons(
  container: HTMLElement,
  onExportStats: () => void,
  onExportClean: () => void,
): void {
  const wrapper = document.createElement('div')
  wrapper.className = 'export-buttons'

  const statsBtn = document.createElement('button')
  statsBtn.className = 'export-button'
  statsBtn.textContent = 'Export with stats'
  statsBtn.addEventListener('click', onExportStats)

  const cleanBtn = document.createElement('button')
  cleanBtn.className = 'export-button'
  cleanBtn.textContent = 'Export clean'
  cleanBtn.addEventListener('click', onExportClean)

  wrapper.appendChild(statsBtn)
  wrapper.appendChild(cleanBtn)
  container.appendChild(wrapper)
}
```

- [ ] **Step 3: Add styles to style.css**

```css
/* Color Switcher */
.color-switcher {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-bottom: 0.75rem;
}

.color-switcher-label {
  font-family: var(--font-ui);
  font-size: 0.6875rem;
  color: var(--fog);
  margin-right: 0.25rem;
}

.color-switcher-option {
  font-family: var(--font-ui);
  font-size: 0.6875rem;
  padding: 0.1875rem 0.5rem;
  border-radius: 10px;
  border: none;
  background: var(--parchment-tertiary);
  color: var(--fog);
  cursor: pointer;
  transition: all 0.15s;
}

.color-switcher-option.active {
  background: var(--parchment);
  color: var(--ink);
  font-weight: 700;
}

/* Export Buttons */
.export-buttons {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.export-button {
  font-family: var(--font-ui);
  font-size: 0.6875rem;
  color: var(--stone);
  background: transparent;
  border: 1px solid var(--parchment-tertiary);
  border-radius: 4px;
  padding: 0.375rem 0.75rem;
  cursor: pointer;
  transition: border-color 0.15s;
  flex: 1;
}

.export-button:hover {
  border-color: var(--stone);
}
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npm run typecheck`

- [ ] **Step 5: Commit**

```bash
git add src/ui/layout.ts src/style.css
git commit -m "feat: add color switcher and export buttons to overlay sidebar"
```

---

### Task 5: Year Picker UI + Sidebar Integration

**Files:**
- Modify: `src/ui/layout.ts`
- Modify: `src/style.css`

- [ ] **Step 1: Add `renderYearPicker` function to layout.ts**

```ts
export function renderYearPicker(
  container: HTMLElement,
  walks: Walk[],
  onYearSelect: (year: number | null) => void,
): { setYear: (year: number | null) => void } {
  const years = [...new Set(walks.map((w) => w.startDate.getFullYear()))].sort()

  if (years.length <= 1) {
    // Single year — just show the label, no picker needed
    if (years.length === 1) {
      const label = document.createElement('div')
      label.className = 'year-label'
      label.textContent = String(years[0])
      container.appendChild(label)
    }
    return { setYear: () => {} }
  }

  const wrapper = document.createElement('div')
  wrapper.className = 'year-picker'

  const heading = document.createElement('div')
  heading.className = 'year-picker-heading'
  heading.textContent = 'Year in Review'
  wrapper.appendChild(heading)

  const buttons: HTMLButtonElement[] = []
  let activeYear: number | null = null

  for (const year of years) {
    const btn = document.createElement('button')
    btn.className = 'year-picker-btn'
    btn.textContent = String(year)
    btn.addEventListener('click', () => {
      setYear(year === activeYear ? null : year)
      onYearSelect(activeYear)
    })
    wrapper.appendChild(btn)
    buttons.push(btn)
  }

  const showAllBtn = document.createElement('button')
  showAllBtn.className = 'year-picker-btn year-picker-show-all'
  showAllBtn.textContent = 'Show all'
  showAllBtn.addEventListener('click', () => {
    setYear(null)
    onYearSelect(null)
  })
  wrapper.appendChild(showAllBtn)
  buttons.push(showAllBtn)

  container.appendChild(wrapper)

  function setYear(year: number | null): void {
    activeYear = year
    for (const btn of buttons) {
      const isShowAll = btn.classList.contains('year-picker-show-all')
      if (isShowAll) {
        btn.classList.toggle('active', year === null)
      } else {
        btn.classList.toggle('active', btn.textContent === String(year))
      }
    }
  }

  setYear(null) // default: show all

  return { setYear }
}
```

- [ ] **Step 2: Add year picker styles to style.css**

```css
/* Year Picker */
.year-picker {
  margin-bottom: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--parchment-tertiary);
}

.year-picker-heading {
  font-family: var(--font-ui);
  font-size: 0.6875rem;
  color: var(--fog);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.375rem;
}

.year-picker-btn {
  font-family: var(--font-ui);
  font-size: 0.75rem;
  padding: 0.25rem 0.625rem;
  border-radius: 12px;
  border: none;
  background: var(--parchment-tertiary);
  color: var(--fog);
  cursor: pointer;
  margin-right: 0.375rem;
  margin-bottom: 0.25rem;
  transition: all 0.15s;
}

.year-picker-btn.active {
  background: var(--parchment);
  color: var(--ink);
  font-weight: 700;
}

.year-label {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 300;
  color: var(--fog);
  text-align: center;
  margin-bottom: 0.5rem;
}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add src/ui/layout.ts src/style.css
git commit -m "feat: add year picker UI for Year in Review"
```

---

### Task 6: Wire Everything in main.ts

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Import new functions**

Add imports:
```ts
import { renderColorSwitcher, renderExportButtons, renderYearPicker } from './ui/layout'
import type { ColorMode } from './map/overlay'
import { exportWithStats, exportClean, generateFilename, generateStatsText } from './map/export'
```

- [ ] **Step 2: Update `showOverlayMode` and `renderOverlaySidebarContent`**

In `renderMultiWalk`, add state variables:
```ts
let colorMode: ColorMode = 'season'
let selectedYear: number | null = null
```

Update `renderOverlaySidebarContent` to add the new UI elements after the mode toggle and before the aggregate stats:

1. After `modeToggle.setMode('overlay')`, add color switcher:
```ts
const colorSwitcher = renderColorSwitcher(layout.sidebar, (mode) => {
  colorMode = mode
  if (overlayRenderer) overlayRenderer.setColorMode(mode)
})
colorSwitcher.setMode(colorMode)
```

2. After aggregate stats, add export buttons:
```ts
renderExportButtons(layout.sidebar,
  () => {
    if (!overlayRenderer) return
    const text = overlayRenderer.getStatsText()
    const filename = generateFilename('stats', selectedYear)
    exportWithStats(overlayRenderer.getMap(), text, filename)
  },
  () => {
    if (!overlayRenderer) return
    const filename = generateFilename('clean', selectedYear)
    exportClean(overlayRenderer.getMap(), layout.overlayMapContainer, filename)
  },
)
```

3. After export buttons, add year picker:
```ts
renderYearPicker(layout.sidebar, currentWalks, (year) => {
  selectedYear = year
  if (!overlayRenderer) return
  const filtered = year
    ? currentWalks.filter((w) => w.startDate.getFullYear() === year)
    : currentWalks
  overlayRenderer.showAllWalks(filtered)
})
```

- [ ] **Step 3: Update `showOverlayMode` to pass filtered walks**

When entering overlay mode, respect the current year filter:
```ts
const filtered = selectedYear
  ? currentWalks.filter((w) => w.startDate.getFullYear() === selectedYear)
  : currentWalks
overlayRenderer.showAllWalks(filtered)
```

- [ ] **Step 4: Update overlay renderer's selectedYear tracking**

The overlay renderer needs to know the selected year for stats text. Add a `setSelectedYear(year: number | null)` method to the overlay renderer, or pass the year via `generateStatsText` in the export module.

Simplest approach: the overlay renderer tracks `selectedYear` internally. Add:
```ts
// In OverlayRenderer interface:
setSelectedYear(year: number | null): void

// In implementation:
function setSelectedYear(year: number | null): void {
  selectedYear = year
  createStatsBar(currentWalks)
}
```

Wire in main.ts year picker callback:
```ts
overlayRenderer.setSelectedYear(year)
```

- [ ] **Step 5: Verify full flow**

Run: `npm run typecheck && npm test && npm run build`
All should pass.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/map/overlay.ts
git commit -m "feat: wire color mode, PNG export, and year filtering into overlay"
```

---

### Task 7: Manual Verification + Final Polish

**Files:**
- Possibly modify: `src/style.css`, `src/ui/layout.ts`, `src/main.ts`

- [ ] **Step 1: Manual test with multi-day sample**

Run: `npm run dev`

Load `kumano-kodo.pilgrim` (5 walks). Switch to overlay mode. Verify:
1. Season colors render (default)
2. Color switcher toggles to time-of-day → colors update
3. Stats bar text updates ("mostly mornings" vs "3 seasons")
4. "Export with stats" downloads a PNG with footer
5. "Export clean" downloads a PNG without any UI
6. Year picker shows (if walks span multiple years — the samples are single-year, so just the year label)

Load `camino-santiago.gpx` (5 walks). Switch to overlay. Verify same behavior with GPX data.

- [ ] **Step 2: Fix any visual issues found**

Adjust spacing, alignment, or colors as needed.

- [ ] **Step 3: Run full verification**

Run: `npm run typecheck && npm test && npm run build`

- [ ] **Step 4: Commit and push**

```bash
git add -A
git commit -m "feat: overlay enhancements — time-of-day colors, PNG export, Year in Review"
git push
```
