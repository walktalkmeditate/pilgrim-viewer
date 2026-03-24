# Pilgrim Viewer — Design Spec

**Date:** 2026-03-24
**Status:** Approved
**Deployment:** view.pilgrimapp.org
**Repo:** github.com/walktalkmeditate/pilgrim-viewer (MIT)

## Overview

A static, open source, browser-based viewer for `.pilgrim` and `.gpx` walk files. Everything runs locally in the browser — no data leaves the device. The viewer serves as both a standalone tool for any GPX user and a marketing surface for the Pilgrim iOS app: the visible gap between what GPX shows (route + stats) and what .pilgrim shows (route + stats + intention + transcriptions + weather + meditation + celestial) is the pitch.

## Scope

This spec covers **v1: the local viewer** at `view.pilgrimapp.org`.

Out of scope (separate projects):
- **walktalkmeditate.com** — hosted gallery, world map, dana payments, passphrases (future, private repo)
- **walk.pilgrimapp.org** — ephemeral walk shares (existing pilgrim-worker)

## Architecture

### Stack

- **Vanilla TypeScript + Vite** — no framework, single-page static site
- **Mapbox GL JS** — map rendering
- **JSZip** — unzip .pilgrim files (ZIP archives)
- **fast-xml-parser** — parse GPX (XML) files

### Project Structure

```
pilgrim-viewer/
├── src/
│   ├── parsers/
│   │   ├── pilgrim.ts        # unzip + parse .pilgrim (manifest + walks)
│   │   ├── gpx.ts            # parse .gpx → normalized Walk type
│   │   └── types.ts          # shared Walk, Stats, Route types
│   ├── map/
│   │   ├── renderer.ts       # single walk route rendering
│   │   └── overlay.ts        # multi-walk life map overlay
│   ├── panels/
│   │   ├── stats.ts          # distance, duration, elevation, steps
│   │   ├── elevation.ts      # canvas-drawn elevation profile
│   │   ├── timeline.ts       # activity timeline (walk/talk/meditate)
│   │   ├── transcriptions.ts # voice recording transcripts
│   │   ├── weather.ts        # temperature, condition, humidity, wind
│   │   ├── intention.ts      # intention + reflection text
│   │   └── celestial.ts      # lunar phase, planetary positions
│   ├── ui/
│   │   ├── dropzone.ts       # drag-and-drop + file picker
│   │   ├── walk-list.ts      # walk picker for multi-walk files
│   │   └── layout.ts         # panel show/hide based on available data
│   ├── main.ts               # entry point
│   └── style.css
├── public/
│   └── index.html
├── LICENSE
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Data Flow

```
Drop .pilgrim or .gpx file
         │
         ▼
   Detect type by extension
   (.pilgrim = ZIP, .gpx = XML)
         │
    ┌────┴────┐
    ▼         ▼
pilgrim.ts   gpx.ts
    │         │
    ▼         ▼
  Walk[]    Walk[]     ← same normalized type
    │         │
    └────┬────┘
         │
         ▼
   Walk count?
    1 │    │ N
      │    │
      │    ▼
      │  Walk list + overlay toggle
      │    │
      ▼    ▼
   Render view
   Map + sidebar panels
   (show what exists, hide what doesn't)
```

### Normalized Walk Type

Both parsers produce the same shape. Everything downstream is format-agnostic.

```ts
interface Walk {
  id: string
  startDate: Date
  endDate: Date
  stats: WalkStats
  route: GeoJSON.FeatureCollection
  weather?: Weather
  intention?: string
  reflection?: Reflection
  voiceRecordings: VoiceRecording[]
  activities: Activity[]
  pauses: Pause[]
  celestial?: CelestialContext
  favicon?: string
  source: 'pilgrim' | 'gpx'
}

interface WalkStats {
  distance: number          // meters
  activeDuration: number    // seconds
  pauseDuration: number     // seconds
  ascent: number            // meters
  descent: number           // meters
  steps?: number
  burnedEnergy?: number     // kcal
  talkDuration: number      // seconds
  meditateDuration: number  // seconds
}

interface Weather {
  temperature: number       // celsius
  condition: string
  humidity?: number
  windSpeed?: number
}

interface Reflection {
  style?: string
  text?: string
}

interface VoiceRecording {
  startDate: Date
  endDate: Date
  duration: number          // seconds
  transcription?: string
  wordsPerMinute?: number
}

interface Activity {
  type: 'walk' | 'talk' | 'meditate'
  startDate: Date
  endDate: Date
}

interface Pause {
  startDate: Date
  endDate: Date
  type: string
}

interface CelestialContext {
  lunarPhase: {
    name: string
    illumination: number
    age: number
    isWaxing: boolean
  }
  planetaryPositions: Array<{
    planet: string
    sign: string
    degree: number
    isRetrograde: boolean
  }>
  planetaryHour: {
    planet: string
    planetaryDay: string
  }
  elementBalance: {
    fire: number
    earth: number
    air: number
    water: number
    dominant?: string
  }
  seasonalMarker?: string
  zodiacSystem: string
}
```

GPX parsing computes `stats` from trackpoints (distance via Haversine, duration from timestamps, ascent/descent from elevation). All pilgrim-only fields (`weather`, `intention`, `voiceRecordings`, `activities`, `celestial`) are left empty.

### Parser Notes

**Pilgrim parser:** The `celestialContext` in the iOS data model is nested inside `reflection`. The parser must extract it and hoist it to the top-level `celestial` field on the normalized Walk type.

**GPX parser:** Supports `<trk>` → `<trkseg>` → `<trkpt>` elements. Each `<trk>` becomes one Walk. Multi-track GPX files produce multiple walks (same as multi-walk .pilgrim). `<rte>` and `<wpt>` elements are ignored in v1.

### Fields Ignored in v1

These fields exist in the .pilgrim format but are not displayed or parsed in v1:
- `heartRates` — health data, may add in a future version
- `workoutEvents` — internal app events, not meaningful for viewing
- `isRace`, `isUserModified` — metadata flags, not useful for display
- `finishedRecording` — could flag incomplete walks, but skip for now
- `schemaVersion` — parser assumes version 1.0; log a warning for unrecognized versions
- `manifest.customPromptStyles`, `manifest.intentions`, `manifest.events` — app-specific, not relevant to viewing individual walks

### Unit Handling

The .pilgrim manifest includes user preferences for `distanceUnit`, `altitudeUnit`, `speedUnit`. The viewer reads these and formats stats accordingly. GPX files default to metric. A small toggle in the stats panel allows switching between metric/imperial.

### .pilgrim File Format

A .pilgrim file is a ZIP archive containing:
- `manifest.json` — schema version, export date, app version, walk count, preferences, events
- `schema.json` — JSON Schema for validation
- `walks/<uuid>.json` — one JSON file per walk

Walk JSON uses seconds-since-epoch for all dates. Coordinates are `[longitude, latitude, altitude]` in GeoJSON format.

## Map Rendering

### Single Walk View

- Mapbox GL JS with `light-v11` style
- Route as GeoJSON `line` layer, 3px, stone color
- Auto-fit bounds with padding
- Start/end point markers
- If activities exist: color-coded route segments (moss=walk, dawn=talk, rust=meditate)

### Overlay View (multi-walk)

- Dark style (`dark-v11`)
- Each walk as its own GeoJSON source/layer
- Season coloring by walk start date:
  - Spring (Mar–May): moss
  - Summer (Jun–Aug): dawn
  - Autumn (Sep–Nov): rust
  - Winter (Dec–Feb): blue (`#6B8EAE`)
- 1.5px lines at 60% opacity — overlap compounds naturally
- Floating stat bar: "12 walks · 87 km · 3 seasons"
- Auto-fit bounds to all walks
- Click a route to highlight → sidebar shows that walk's details
- Click "Back to list" or the overlay toggle to return
- Season is determined by month (Northern hemisphere convention — a known simplification)

### Mapbox Token Strategy

- Deployed site (`view.pilgrimapp.org`): URL-restricted token embedded via `VITE_MAPBOX_TOKEN` env var
- Forks: set token in `.env.local` or prompted via UI on first load with setup instructions
- No token at runtime: friendly message with docs link instead of broken map

## UI Layout

### Structure

Sidebar (left) + Map (fills remaining space). Sidebar collapsible on mobile → bottom sheet.

### Empty State

Full-page drop zone: "Drop .pilgrim or .gpx file" with file picker button as fallback. After file loads, becomes a small "Open another file" button in the header.

### Walk List (multi-walk only)

Compact list in sidebar — date, distance, duration per walk. Click to select. Toggle at top to switch between list view and overlay view.

### Panels

Collapsible sections in the sidebar. Each panel only renders if its data exists.

| Panel | GPX | Pilgrim | Content |
|-------|-----|---------|---------|
| Stats | yes | yes | Distance, duration, elevation, steps |
| Elevation | yes | yes | Canvas-drawn sparkline profile |
| Walk/Talk/Meditate | — | yes | Three-way time breakdown bar |
| Timeline | — | yes | Horizontal bar with activity segments |
| Intention | — | yes | Intention text, reflection text |
| Weather | — | yes | Temperature, condition, humidity, wind |
| Transcriptions | — | yes | Voice recording transcripts with timestamps |
| Celestial | — | yes | Lunar phase, planetary hour, element balance, planetary positions |

The marketing gap is visual and immediate: drop a GPX → 2 panels. Drop a .pilgrim → 8 panels.

## Multi-Walk Interaction Flow

Two modes, toggled by a switch at the top of the sidebar:

**List mode (default):**
- Sidebar shows walk list (date, distance, duration per row)
- Map shows the selected walk's route (single walk view)
- Click a walk → map updates, panels show that walk's details
- First walk is auto-selected on load

**Overlay mode:**
- Map switches to dark style, all walks rendered with season colors
- Sidebar shows aggregate stats (total walks, distance, seasons)
- Click a route on the map → highlight it, sidebar shows that walk's details inline (panels below the aggregate stats)
- Click elsewhere on the map or "Clear selection" → back to aggregate view

Switching modes preserves the selected walk if one is selected.

## Error Handling

- **Corrupt ZIP / invalid .pilgrim:** Show inline error message in the drop zone area: "Couldn't read this file. Make sure it's a valid .pilgrim or .gpx file." No modal dialogs.
- **Walk JSON parse failure:** Skip the walk, show the rest. If all walks fail, show the error message.
- **GPX with no trackpoints:** Show the error message — nothing to display.
- **Missing elevation data:** Hide the elevation panel (same as any missing-data panel).
- **Unrecognized schema version:** Parse anyway (best effort), log a console warning.
- **Very large files (500+ walks):** No hard limit. The overlay may get slow — acceptable for v1. Mapbox GL handles thousands of features well.

## Design & Styling

### Aesthetic

Wabi-sabi — minimal, warm, quiet. Not a flashy web app.

### Colors

From pilgrim-landing design system (canonical values):

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--parchment` | `#F5F0E8` | `#1C1914` | Background |
| `--parchment-secondary` | `#EDE6D8` | `#262118` | Panel backgrounds |
| `--parchment-tertiary` | `#E4DBC9` | `#30291F` | Borders, hover |
| `--ink` | `#2C241E` | `#F0EBE1` | Text |
| `--stone` | `#8B7355` | `#B8976E` | Accent, route color |
| `--moss` | `#7A8B6F` | `#95A895` | Walk activity |
| `--rust` | `#A0634B` | `#C47E63` | Meditate activity |
| `--dawn` | `#C4956A` | `#D4A87A` | Talk activity |
| `--fog` | `#B8AFA2` | `#6B6359` | Subtle borders, metadata |

Note: the original spec referenced "gold" for talk — using `--dawn` instead, which is the warm gold tone from the design system. Overlay season colors: moss (spring), dawn (summer), rust (autumn), `#6B8EAE` (winter blue — not in landing CSS, defined here).

### Typography

Matching pilgrim-landing and the iOS app:
- **`--font-display`**: Cormorant Garamond — headings, display text
- **`--font-body`**: Cormorant Garamond — body text
- **`--font-ui`**: Lato — stats, labels, buttons, metadata

Loaded from Google Fonts. Fallbacks: `Georgia, serif` and `system-ui, sans-serif`.

### Interactions

Minimal animation. Panels expand/collapse with simple height transition. No loading spinners — parsing is fast enough to feel synchronous. Drop zone highlights on drag with subtle border change.

### Mobile

Sidebar collapses to bottom sheet. Map goes full-width. Panels scroll vertically. Tap to open file picker (no drag-and-drop on mobile).

### Branding

- Header: "Pilgrim Viewer" wordmark + GitHub link
- Footer: "Open source · MIT License" with repo link
- Subtle "Recorded with Pilgrim" badge on .pilgrim files linking to the app

## Dependencies

### Runtime

| Package | Purpose | ~Size (gzipped) |
|---------|---------|-----------------|
| mapbox-gl | Map rendering | 220kb |
| jszip | Unzip .pilgrim files | 40kb |
| fast-xml-parser | Parse GPX XML | 15kb |

### Dev

| Package | Purpose |
|---------|---------|
| vite | Build + dev server |
| typescript | Type checking |

| vitest | Parser unit tests |

No charting library, CSS framework, or state management. Elevation profile is a hand-drawn canvas sparkline.

## Deployment

- **Hosting:** Cloudflare Pages (static site, free tier, consistent with existing Cloudflare infrastructure)
- **Build:** `npm run build` → Vite outputs to `dist/`
- **Env:** `VITE_MAPBOX_TOKEN` set as a Cloudflare Pages environment variable
- **Domain:** `view.pilgrimapp.org` pointed at Cloudflare Pages via CNAME
- **CI:** GitHub Actions — type check, run tests, build, deploy to Cloudflare Pages on push to main

## Related Systems

- **pilgrim-ios** (`../pilgrim-ios`) — creates .pilgrim files, source of the format spec
- **pilgrim-worker** (`../pilgrim-worker`) — walk.pilgrimapp.org, ephemeral shares
- **pilgrim-landing** (`../pilgrim-landing`) — pilgrimapp.org, design system reference
- **walktalkmeditate.com** — future private repo for hosted gallery, world map, dana

## Future (post-v1)

- Extract parsers as npm package for walktalkmeditate.com to share
- PNG export of overlay view
- walktalkmeditate.com integration (publish from viewer → hosted gallery)
