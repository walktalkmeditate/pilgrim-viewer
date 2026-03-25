# Generative Export Border

## Summary

Replace the plain dark padding and footer on exported images with a generative decorative border that shares visual DNA with the goushin seal. The border is driven by walk data (hash, elevation, season, weather) so every export is unique. The seal bridges the border-map boundary, creating a unified stamp-card keepsake.

## Decisions

- **Approach**: SVG generation → Canvas compositing (same pipeline as the seal)
- **Scope**: Both export variants (stats + clean), overlay mode only
- **Theme**: Dark only — overlay always uses dark-v11 tiles, no extra Mapbox API calls
- **Frame thickness**: Medium — ~60px border area, double-line frame, room for decorative elements without overwhelming the map
- **Color palette**: Dawn gold (`#C4956A`) primary on dark (`#1C1914`), season accents for bars
- **Text treatment**: Stats variant gets stats text in bottom border, clean variant has no text
- **Overlay composites**: Elements layer and transition across walks, not averaged
- **GPX compatibility**: Degrades gracefully — fewer rings/radials (meditation/talk data absent), default weather turbulence, everything else works

## Architecture

### New file: `src/map/border.ts`

Main entry:

```typescript
export async function generateBorderSvg(
  walks: Walk[],
  width: number,
  height: number,
  variant: 'stats' | 'clean',
  unit: UnitSystem,
  hashHex: string,
  statsText?: string,
): Promise<string>
```

Takes the pre-computed hash (shared with the seal) and returns a full-size SVG string matching the export canvas dimensions. The SVG contains all border elements layered in a single `<g>` group with a weather turbulence filter.

### Modified: `src/panels/seal.ts`

Export shared utilities that `border.ts` needs:

- `computeWalkHash` — already exists, just needs `export`
- `hexToBytes` — already exists, just needs `export`
- `extractRoutePoints` — already exported via the test alias, make it a proper export
- `COLORS` — export the color constants
- `getSeason` — export for season bar logic
- `getWeatherTurbulence` — export for border filter

Additionally, refactor `generateCombinedSealSVG` to accept an optional pre-computed `hashHex` parameter. When provided, it skips internal hash computation and uses the supplied value. This allows `export.ts` to compute the hash once and pass it to both the border and seal generators, ensuring identical DNA. The combined walk construction logic (currently inline at lines 356-372) is extracted into a new `buildCombinedWalk(walks)` helper that both `export.ts` and `generateCombinedSealSVG` can use.

### Modified: `src/map/export.ts`

New pipeline replaces the current PADDING/FOOTER approach:

1. Boost routes for visibility (unchanged)
2. Compute shared hash once for both border and seal
3. Create canvas: `mapWidth + borderWidth*2` x `mapHeight + borderWidth*2`
4. Fill dark background (`#1C1914`)
5. Generate border SVG → convert to image → draw as base layer
6. Draw map inset by border width
7. Generate seal SVG (using same hash) → convert to image → draw at border-map boundary
8. Trigger download

Constants change:

- `PADDING` (40px) → `BORDER_WIDTH` (~60px)
- `FOOTER_HEIGHT` (80px) → removed
- Seal opacity: 0.5 → 0.65
- Seal position: anchored at border-map boundary corner, not inset from canvas edge

## Border Elements

### Frame lines

Two concentric rounded rects — outer decorative line near canvas edge, inner line at the map boundary. Structural, not hash-driven. Dawn color at low opacity.

### Elevation trace (bottom edge)

`generateLinearElevation(routePoints[], width, yBaseline, color)`

Maps altitude profile as a polyline along the bottom border area. Same min/max normalization as `generateElevationRing` but projected onto a horizontal line.

For overlay composites: each walk contributes its own polyline, layered at 0.3-0.4 opacity. More walks = denser ridgeline texture.

### Season bars (left edge)

`generateSeasonBars(walks[], height, x, colors)`

Divides the left border vertically into colored segments proportional to walk count per season. Uses `getSeason()` from seal.ts with latitude from the walk's route points for hemisphere-aware detection.

Colors (deliberately distinct from the overlay map legend palette — these are border ink tones, not map colors):
- Spring: moss `#7A8B6F`
- Summer: dawn `#C4956A`
- Autumn: rust `#A0634B`
- Winter: fog `#B8AFA2`

Single walk = one solid color. Multiple walks = proportional bands.

### Corner ornaments (all four corners)

`generateCornerOrnaments(bytes, width, height, color)`

Arc pairs blooming from each corner, echoing the seal's `generateArcSegments`. Hash-driven count (2-4 arcs per corner) and sweep angles. Bottom-left corner gets fewer/smaller ornaments to leave room for the seal.

### Scattered dots (top and right edges)

`generateEdgeDots(bytes, width, height, color)`

Hash-based dot distribution along the top and right border areas. Same approach as seal's `generateDots` but positioned linearly.

Overlay scaling: base 5 + `walks.length / 10`, capped at ~30.

### Radial lines (from seal corner)

`generateSealRadials(bytes, sealX, sealY, color)`

Fan of lines radiating outward from the seal's position into the border area, fading with distance. Visually connects the seal to the frame. Echoes `generateRadialLines` from the seal.

### Stats text (stats variant only)

`generateBorderStatsText(statsText, width, y, color)`

Centered along the bottom border, positioned right of the elevation trace end. Dawn color, sans-serif, same font as current footer but integrated into the SVG.

### Weather turbulence filter

Same `getWeatherTurbulence()` from seal.ts applied to the border element group via SVG `<filter>`. Single walk uses that walk's condition. Overlay uses earliest walk's condition (matching current seal behavior).

## Export Pipeline Detail

### `exportWithStats` — new flow

```
Canvas size: mapWidth + BORDER_WIDTH*2, mapHeight + BORDER_WIDTH*2
┌──────────────────────────────────────────┐
│ border SVG (full canvas)                 │
│  ┌────────────────────────────────────┐  │
│  │ map (inset by BORDER_WIDTH)        │  │
│  │                                    │  │
│  │                                    │  │
│  │                                    │  │
│  └────────────────────────────────────┘  │
│ [seal]  stats text      elevation trace  │
└──────────────────────────────────────────┘
```

### `exportClean` — same layout, no stats text

```
┌──────────────────────────────────────────┐
│ border SVG (full canvas)                 │
│  ┌────────────────────────────────────┐  │
│  │ map (inset by BORDER_WIDTH)        │  │
│  │                                    │  │
│  │                                    │  │
│  │                                    │  │
│  └────────────────────────────────────┘  │
│ [seal]              elevation trace      │
└──────────────────────────────────────────┘
```

### Seal positioning

The seal center sits at the intersection of the inner frame line's bottom-left corner:

```
x = BORDER_WIDTH * dpr
y = (mapHeight + BORDER_WIDTH) * dpr
```

This places it half on the border, half on the map — bridging both areas. The seal's own dark background fill masks the frame line beneath it so the rings read clearly.

### Shared hash computation

The hash is computed once per export and passed to both `generateBorderSvg` and `generateCombinedSealSVG`:

```typescript
const allRoutePoints = walks.flatMap(extractRoutePoints)
const combinedWalk = buildCombinedWalk(walks) // new helper, extracted from generateCombinedSealSVG
const hashHex = await computeWalkHash(combinedWalk, allRoutePoints)

// Both receive the same hash:
const borderSvg = await generateBorderSvg(walks, width, height, variant, unit, hashHex, statsText)
const sealSvg = await generateCombinedSealSVG(walks, sealSize, unit, hashHex)
```

This ensures the border's generative patterns (dot positions, arc angles, ornament shapes) are coherent with the seal's patterns — same DNA expressed in different forms.

## Overlay Composite Behavior

| Element | Single walk | Multi-walk overlay |
|---------|------------|-------------------|
| Elevation trace | One polyline | Layered polylines, one per walk |
| Season bars | Solid single color | Proportional color bands |
| Dot count | Base 5 | 5 + walks.length/10, cap 30 |
| Corner arcs | Base 2 per corner | +1 per 20 walks, cap 4 |
| Seal radials | From single hash | From combined hash |
| Weather filter | Walk's condition | Earliest walk's condition |
| Stats text | That walk's stats | Aggregate stats |

## GPX Graceful Degradation

GPX files parse into the same `Walk` interface but lack Pilgrim-specific data:

| Data | GPX | Effect on border |
|------|-----|-----------------|
| Route points / elevation | Present | Elevation trace works fully |
| Distance | Present | Stats text works |
| startDate | Present | Season bars work |
| meditateDuration | 0 | Seal has fewer rings (base count only) |
| talkDuration | 0 | Seal/border has fewer radial lines |
| Weather | undefined | Default turbulence filter applied |

Result: GPX exports are sparser and simpler. No special-casing needed — the data-driven approach naturally produces less complexity with less data.

## Testing

- `generateBorderSvg` unit tests: verify SVG output contains expected elements for given inputs
- `generateLinearElevation`: verify polyline point count matches route points
- `generateSeasonBars`: verify proportional segment heights for known walk sets
- Overlay scaling: verify dot/ornament counts scale and cap correctly
- GPX path: verify border generates without errors when meditateDuration/talkDuration are 0
- Snapshot tests: render border SVG for fixed hash bytes and compare against baseline

## Files Changed

| File | Change |
|------|--------|
| `src/map/border.ts` | New — border SVG generation |
| `src/map/border.test.ts` | New — unit tests |
| `src/map/export.ts` | Replace padding/footer with border pipeline |
| `src/panels/seal.ts` | Export shared utilities (hash, colors, helpers) |
