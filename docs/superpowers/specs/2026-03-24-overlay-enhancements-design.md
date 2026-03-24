# Overlay Enhancements — Design Spec

**Date:** 2026-03-24
**Status:** Approved
**Builds on:** `docs/superpowers/specs/2026-03-24-pilgrim-viewer-design.md`

## Overview

Three enhancements to the existing overlay view: a time-of-day color palette, PNG export (with stats and clean variants), and a Year in Review mode that filters walks by year. No new rendering pipeline — all features build on the existing overlay architecture.

## 1. Time-of-Day Color Palette

### Color Mapping

Walk start hour determines color:

| Time Range | Name | Color | Hex |
|-----------|------|-------|-----|
| 05:00–09:59 | Dawn | Warm gold | `#C4956A` (existing `--dawn`) |
| 10:00–15:59 | Midday | Soft white | `#E8E0D4` |
| 16:00–19:59 | Dusk | Deep amber | `#D4874D` |
| 20:00–04:59 | Night | Cool blue | `#6B8EAE` (same as winter) |

Uses `walk.startDate.getHours()` (local time) to determine the time bucket.

### UI

A "Color by" switcher in the overlay sidebar, below the mode toggle:

```
Color by:  [Season]  [Time of Day]
```

Pill-shaped, same visual pattern as the List/Overlay toggle. "Season" is the default.

### Behavior

- Clicking a color option re-renders all route colors immediately by updating each layer's `line-color` paint property via `map.setPaintProperty()`. No source reload needed.
- The floating stats bar adapts:
  - Season mode: "12 walks · 87 km · 3 seasons"
  - Time-of-day mode: "12 walks · 87 km · mostly mornings"
- "Mostly mornings" is derived from the dominant time bucket (the bucket with the most walks). If tied, show the earlier bucket.

### Implementation

Extract color logic into a function that takes a walk and a mode, returns a hex color:

```ts
type ColorMode = 'season' | 'timeOfDay'

function getWalkColor(walk: Walk, mode: ColorMode): string {
  if (mode === 'timeOfDay') return getTimeOfDayColor(walk.startDate)
  return getSeasonColor(walk.startDate)
}

function getTimeOfDayColor(date: Date): string {
  const hour = date.getHours()
  if (hour >= 5 && hour < 10) return '#C4956A'
  if (hour >= 10 && hour < 16) return '#E8E0D4'
  if (hour >= 16 && hour < 20) return '#D4874D'
  return '#6B8EAE'
}
```

The overlay renderer needs a `setColorMode(mode: ColorMode)` method that iterates all active layers and updates their `line-color`.

## 2. PNG Export

### UI

Two buttons in the overlay sidebar, below the aggregate stats section:

```
[Export with stats]  [Export clean]
```

Styled as subtle outline buttons (same pattern as the "Choose File" button in the dropzone). Lato font, `--stone` color.

### Export with Stats

Produces an image of the map viewport with a dark footer containing stats text.

**Composition:**
1. Capture the map canvas (WebGL)
2. Create an offscreen `<canvas>` sized to map width × (map height + footer height)
3. Draw the map canvas onto the top portion
4. Draw a dark footer bar (`#1C1914`, 60px height) at the bottom
5. Render stats text centered in the footer using Canvas 2D:
   - Font: Lato (loaded via Google Fonts, must be available)
   - Color: `#F0EBE1` (dark mode ink)
   - Size: 14px
   - Text: same as the floating stats bar (adapts to color mode and year filter)
6. Export as PNG via `canvas.toDataURL('image/png')`
7. Trigger download via temporary `<a>` element with `download` attribute

**Filename:** `pilgrim-overlay.png` (or `pilgrim-2026.png` if year filter is active)

### Export Clean

Produces a pure image — just routes on darkness. No text, no UI, no attribution.

**Composition:**
1. Temporarily hide all UI overlays (stats bar, Mapbox controls, attribution logo)
2. Capture `map.getCanvas().toDataURL('image/png')`
3. Restore all UI overlays
4. Trigger download

**Filename:** `pilgrim-overlay-clean.png` (or `pilgrim-2026-clean.png` if year filter active)

### Mapbox Configuration

The overlay map must be initialized with `preserveDrawingBuffer: true` to enable `canvas.toDataURL()` on the WebGL context. This has a minor performance cost (prevents the browser from discarding the back buffer after compositing) but is required for canvas capture.

**Change in `src/map/overlay.ts`:**
```ts
const map = new mapboxgl.Map({
  container,
  style: 'mapbox://styles/mapbox/dark-v11',
  preserveDrawingBuffer: true,  // add this
})
```

### Resolution

Export at the current device pixel ratio (typically 2x on retina displays). A standard viewport produces approximately 2400×1600 at 2x — suitable for wallpaper and social media sharing. Higher resolution (4x) is out of scope for v1.

### During Export

1. Set `pointer-events: none` on export buttons to prevent double-click
2. For clean export: hide stats bar, Mapbox controls (`.mapboxgl-control-container`), attribution
3. Capture
4. Restore visibility
5. Re-enable buttons

No loading spinner needed — canvas capture is synchronous and fast (<100ms).

## 3. Year in Review

### UI

A "Year in Review" section in the overlay sidebar, below the export buttons:

```
── Year in Review ──
[2025]  [2026]  [Show all]
```

- Year buttons derived from unique years in `walks.map(w => w.startDate.getFullYear())`
- If all walks are in one year: show just that year label (no picker needed, no "Show all")
- If walks span multiple years: show year buttons + "Show all"
- Active year is highlighted (same styling as mode toggle active state)

### Behavior

**Selecting a year:**
1. Filter `currentWalks` to only walks where `startDate.getFullYear() === selectedYear`
2. Call `overlayRenderer.showAllWalks(filteredWalks)` — this clears and re-renders with only that year's walks
3. Stats bar updates: "Your 2026 · 47 walks · 312 km · 4 seasons" (prefixed with "Your YYYY")
4. Export buttons capture exactly what's on screen (filtered view)
5. Export filename includes the year: `pilgrim-2026.png`

**"Show all":**
1. Reset to full unfiltered walk list
2. Re-render overlay with all walks
3. Stats bar returns to normal format (no "Your" prefix)

**Interaction with color mode:**
The active color mode (season or time-of-day) applies to the filtered set. Switching color mode while a year is selected re-colors only that year's walks.

### Aggregate Stats

For the stats line (both floating bar and export footer):
- Walk count: number of walks in the filtered set
- Total distance: sum of `stats.distance` from filtered walks, formatted via `formatDistance`
- Season count (if season mode): unique seasons from filtered walks
- Dominant time (if time-of-day mode): most common time bucket from filtered walks

## Files to Create/Modify

| File | Change |
|------|--------|
| `src/map/overlay.ts` | Add `preserveDrawingBuffer`, `setColorMode()`, adapt `showAllWalks` for year filtering, export `getTimeOfDayColor` |
| `src/map/export.ts` | New — PNG capture logic (with-stats and clean variants) |
| `src/ui/layout.ts` | Add color mode switcher, export buttons, year picker to overlay sidebar |
| `src/main.ts` | Wire color mode toggle, export handlers, year filtering |
| `src/style.css` | Styles for color switcher, export buttons, year picker |
| `tests/map/overlay.test.ts` | Add tests for `getTimeOfDayColor`, dominant time bucket calculation |
| `tests/map/export.test.ts` | Test filename generation, stats text formatting |

## Out of Scope

- Animated playback / video export (separate spec)
- Print-quality resolution (4x+)
- Custom map styles or base maps
- Sharing to social media (just download PNG)
