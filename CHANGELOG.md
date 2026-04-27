# Changelog

All notable changes to Pilgrim Viewer will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.4.2] - 2026-04-27

Follow-up polish from real-world testing of v1.4.1.

### Fixed

- **Inline editor absorbed the delete button into the textarea.** Clicking into an editable section (intention, reflection, transcription) seeded the textarea from `el.textContent`, which included the trailing "×" glyph from the section's delete affordance. The "×" appeared inside the editable text, and `el.textContent = ''` permanently removed the delete button. The editor now seeds from the source-of-truth `initial` text and saves the `.panel-x` reference before wiping so the delete affordance survives an edit cycle.

### Added

- **Waypoint deletes.** Each row in the Waypoints panel now gets a × in tend mode, alongside the existing section/photo/transcription affordances. New `attachWaypointDeletes` hook (`src/edit/affordances.ts`) re-derives the panel's distance-from-start sort so DOM index aligns with the waypoint array. Live preview filters waypoints from `walk.route.features` via `applyMods`; saved `.pilgrim` filters via `applyEditsToRawWalk`. GPX side already supported `delete_waypoint`. Map markers update automatically on the next render. Caveat: deletion is panel-only — there's no × on the map markers themselves; that's a v1.5+ concern.

## [1.4.1] - 2026-04-27

Polish release for the editor — bug fixes from production review of `edit.pilgrimapp.org`. No new features, no schema changes.

### Fixed

- **Tend toggle was invisible when active.** The `.tend-toggle.active` rule used `background: currentColor; color: var(--parchment)`, which self-references — `currentColor` IS the foreground, so foreground and background ended up identical and the button vanished. Replaced with explicit `var(--ink)` / `var(--parchment)`.
- **Map "failed to load" overlay leaked onto a working map.** Mapbox fires `error` events for transient sub-resource 401/403s (tile retries, glyph/sprite fetches, token-allowlist propagation races) even when the style itself loaded fine. The overlay is now guarded by a `styleLoaded` flag and a one-shot `errorShown` so it only paints if the style actually failed, and never paints twice. Applies to both `src/map/renderer.ts` (single-walk) and `src/map/overlay.ts` (overlay mode).
- **Walk-list × wasn't prominent or correctly placed.** Repositioned to the top-right of each row with absolute positioning, larger tap target, and a hover-reveal opacity transition. Tend mode adds right padding so the × doesn't overlap the walk text.
- **Photo × was invisible against thumbnails.** Now absolute-positioned over each thumbnail's top-right with a parchment circle background, drop shadow, and `z-index: 2` so it sits above the `<img>`. The grid item is now `position: relative` so the × anchors to the thumbnail rather than `<body>`.
- **Last transcription delete targeted the wrong row.** Affordances indexed into `walk.voiceRecordings` (pre-mod) but the panels rendered from the post-mod `displayWalk`, so after the first delete every subsequent × was off by one. `EditApi.attachToWalkUI` now accepts `displayWalk` and uses it for affordance attachment while trim handles still anchor on the original walk's endpoints.
- **Drawer was cramped and unreadable on mobile.** Reworked as CSS Grid with a `<= 720px` breakpoint that stacks `count + actions` above the per-mod list, drops the history toggle, and tightens padding.

### Added

- **Hostname-aware branding.** `view.pilgrimapp.org` shows "Pilgrim Viewer / See your walks…" while `edit.pilgrimapp.org` shows "Pilgrim Editor / Tend your walks…". Tab title, header, dropzone, and cross-link copy all flip via the new `src/branding.ts` helpers. Static `<title>` and OG/Twitter meta tags in `index.html` are rewritten by the Cloudflare Worker (`pilgrim-edit-router`) using `HTMLRewriter` so social-share scrapers see the right product name.
- **Cross-link affordance** on the dropzone — "Tend a file? Open in the editor" / "View only? Open in the viewer" — preserves `location.search` across the host hop.
- **Version chip** on the dropzone (`v1.4.1`), pulled from `package.json` at build time via Vite's `define`.
- **Save button locks during in-flight save.** A double-click on a slow zip-generation no longer produces two downloads. The drawer's `onSave` now returns a Promise that resolves on either `pilgrim-edit-saved` (success) or a new `pilgrim-edit-save-failed` event; the button shows "Saving…" and stays `disabled` until the save settles, with a `try/finally` in the save-requested handler guaranteeing the lock always releases.

### Operator Notes

- **Mapbox token URL whitelist.** If you've configured a custom Mapbox token, add `edit.pilgrimapp.org` alongside `view.pilgrimapp.org` to its allowlist in the Mapbox dashboard. Without this, tile requests on the editor host return 401 and the map shows the "failed to load" overlay.
- **localStorage is per-origin.** Tokens, privacy zone, color theme, and theme preference set on `view.*` don't carry to `edit.*` (and vice versa). This is a property of subdomain isolation, not a regression.

## [1.4.0] - 2026-04-26

### Added — Editor (`edit.pilgrimapp.org`)

- New hostname-gated **redactor / pruner** at `edit.pilgrimapp.org`, served from the same Pages site. The view-only bundle at `view.pilgrimapp.org` is unchanged — the edit module is dynamic-imported only when `location.hostname.startsWith('edit.')` (or `?edit=1` on localhost), so the view bundle adds zero bytes.
- **Tend mode** toggle revealing destructive affordances. View mode = unchanged viewer behavior.
- **Archive walks** in multi-walk files — adds a skeletal record (id, dates, distance, durations, optional steps) to a new `manifest.archived[]` so lifetime aggregates in the file remain intact even when content is removed. Removed walks' `walks/<id>.json` and embedded `photos/<filename>.jpg` are dropped from the ZIP.
- **Section deletes**: intention, reflection, weather, celestial — × button on each panel.
- **List-item deletes**: photos (× per thumbnail), voice recordings (× per transcription entry).
- **Inline text edit**: intention (single-line), reflection text + voice transcription (multi-line) — click into rendered text in Tend mode, blur or Cmd+Enter to commit.
- **Map trim handles** for route start and end with live preview — polyline updates as the user drags. Stats recompute (distance, ascent/descent, durations; steps + burnedEnergy scaled proportionally to distRatio).
- **GPX support**: trim route start/end (multi-segment GPX trims first/last seg only), delete waypoints by lat/lng. Round-trips through fast-xml-parser AST so track names, namespaces, and extensions survive.
- **Modifications log** in `manifest.modifications[]` — every staged op recorded with op + walkId + payload + timestamp. Cumulative across save sessions; opt-out via "Include tending history" checkbox in the drawer.
- **iOS Codable schema validator** (`validatePilgrimManifest`) runs on every save and asserts the full iOS `PilgrimManifest` shape — required arrays (`customPromptStyles`, `intentions`, `events`), full `preferences` set including `celestialAwareness` / `zodiacSystem` / `beginWithIntention`. Save fails loud rather than producing an unimportable file.
- Save flow: produces a `<originalstem>-tended.<ext>` download. Original on disk untouched (browser can't write back). After successful save, the editor re-parses the saved blob and re-syncs in-memory state so subsequent saves preserve cumulative `manifest.modifications` history and live preview matches what was just written.

### Architecture

- New `src/edit/` layer: `staging.ts`, `applier.ts`, `recompute.ts`, `archive.ts`, `save.ts`, `tend-toggle.ts`, `drawer.ts`, `affordances.ts`, `trim-handles.ts`, `archive-modal.ts`, `json-mode.ts`, `index.ts` orchestrator + `edit.css`.
- Pure-function core: `applyMods(walk, mods) → walk | null`, `recomputeStats`, `walkToArchived`, `trimRouteSeparately`, `serializeTendedPilgrim`, `serializeTendedGpx` — no DOM, no I/O.
- Affordances inject from `edit/affordances.ts` via DOM hooks (querySelector + event listeners). Existing renderers in `panels/`, `ui/`, `map/` are untouched.
- Hostname routing for `edit.pilgrimapp.org` is handled by a small Cloudflare Worker (`pilgrim-edit-router`) that proxies the request to `view.pilgrimapp.org`'s Pages site with the Host header rewritten — same bundle, two URLs, no second Pages deploy.
- 60+ new tests across 10 new test files (`tests/edit/`). Total: **278+ passing**.

### Changed (parsers — additive only)

- `parsers/types.ts`: new exports `ArchivedWalk`, `Modification`, `ModOp`, `ModPayload`, `DeletableSection`. `PilgrimManifest` extended with optional `archivedCount`, `archived`, `modifications`. `Walk` extended with optional `isUserModified`.
- `parsers/pilgrim.ts`: reads `manifest.archived` / `manifest.modifications` (defaults to empty arrays for legacy files). Backward-compat additive — no behavior change for view-only callers.
- `parsers/route-trim.ts`: new `trimRouteSeparately({ startMeters, endMeters })` for per-walk trim with separate values. Existing `trimRouteEnds` (privacy-zone consumer) unchanged.
- `parsers/gpx.ts`: new `parseGPXWithAst` returning `{ walks, ast }` for round-trip-safe GPX editing. Existing `parseGPX` unchanged.

### iOS Reimport

- Tended `.pilgrim` files preserve every iOS-required `manifest` field (validated on every save).
- Walk-level required iOS fields (`heartRates`, `workoutEvents`, `isRace`, `isUserModified`, `finishedRecording`, `schemaVersion`, `type`) round-trip via `applyEditsToRawWalk`'s spread semantics — never stripped.
- iOS does not yet know about `manifest.archived` / `manifest.modifications` — Swift `JSONDecoder` ignores unknown keys, so reimport works, but iOS aggregate stats after reimport reflect only active walks (archive shadows are invisible to iOS in this release). Pairing iOS update is a separate roadmap item.

### Known Limitations (deferred to v1.5+)

- **JSON expert mode** — `src/edit/json-mode.ts` exists but is not wired into any UI surface. The `replace_walk` op is unreachable today.
- **Multi-segment GPX trim** — preview vs save can diverge when trim distance exceeds the first/last segment's length. Save trims first/last seg only; preview operates on the parsed walk's flattened LineString.
- **Multi-touch trim drag (iPad)** — releasing one handle's `dragend` rebuilds both markers, which can cancel an in-progress drag on the other.
- **Inline editor blank-and-blur** — clearing an intention via the inline editor reverts visually but leaves the prior staged edit. The drawer still shows the pending mod.
- **Trim handle position** — handles seed at the original route endpoints rather than at the staged-trimmed endpoints. Drag math is correct (always meters from original); UX is the trade-off.

## [1.3.0] - 2026-04-15

### Added
- Reliquary photo support for `.pilgrim` archives — v1.3 archives may include a top-level `photos/` directory carrying JPEG bytes for each walk's pinned photos. The viewer extracts them as blob URLs and joins them to each walk via `embeddedPhotoFilename`.
- New `WalkPhoto` field on the normalized `Walk` type: `{ localIdentifier, capturedAt, lat, lng, url }`.
- Photo waypoint markers on the single-walk map — circular 44pt thumbnails at each photo's GPS coordinate, wrapped in an accessible `<button>` with stone-accent border. Tapping a marker opens a Mapbox popup with a ~260px expanded view and the capture timestamp.
- New Photos sidebar panel — thumbnail grid ordered by capturedAt, auto-fill layout that adapts to sidebar width. Tapping a thumbnail pans the map (`flyTo`) to that photo's coordinates so the user can see its marker in context. Self-hides when the walk has no photos.
- Parser validates photo coordinate ranges (lat ∈ [-90, 90], lng ∈ [-180, 180]) so adversarial archives can't crash Mapbox's `LngLat` constructor.
- Parser validates each photo entry's runtime shape (string identifier, finite numeric coordinates, parseable capturedAt) before attaching to the Walk, so the map renderer and panel grid only ever see complete, well-typed records.

### Changed
- `parsePilgrim` signature gains optional `options.urlFactory` and `options.urlRevoker` injection seams for tests (production callers get the browser defaults).
- `renderPanels` signature gains an optional `onPhotoSelect` callback so the panel layer stays decoupled from Mapbox.
- Test suite now 205 tests across 12 files (was 165 across 10).

### Fixed
- Blob URL lifecycle: main.ts now revokes each walk's photo URLs on walk transition (new drop, goHome, JS bridge loadData) so the reliquary doesn't leak ~80KB per photo indefinitely. Uses a commit-then-release ordering to avoid broken thumbnails if the new parse fails mid-flight.
- Rapid successive drops: `handleFile` now uses a generation counter that invalidates in-flight parses when a newer drop or `goHome` supersedes them — no more state races or orphaned walks.
- `parsePilgrim` revokes orphan photo URLs (extracted but not referenced by any walk) on the success path, and revokes all created URLs on the error path via `try/finally` so nothing leaks if walk parsing throws.

## [1.2.2] - 2026-03-31

### Fixed
- Keepsake image route lines now drawn with theme color calligraphy matching video style

## [1.2.1] - 2026-03-31

### Added
- Gold seal support in keepsake image and video generation

### Fixed
- Keepsake save button cut off and non-functional on mobile iOS Safari — uses Web Share API with download fallback, controls wrap on narrow screens
- Keepsake image route lines too faint — boosted line width/opacity and fixed render timing
- Unit toggle (km/mi) not reflected in keepsake stats text, overlay stats bar, or walk list

## [1.2.0] - 2026-03-26

### Added
- Privacy zone — configurable route trimming with live preview slider
- Faded line rendering for privacy-trimmed route segments
- Privacy zone support in overlay mode

### Fixed
- Overlay highlight and colorMode interaction with privacy zones
- Listener leak in overlay renderer

## [1.1.0] - 2026-03-25

### Added
- Generative keepsake border with 10+ data-driven decorative elements (frame lines, depth shadow, elevation ridgeline, season bars, corner ornaments, edge dots, seal radials, tally marks, date range, compass rose, walk signature, route ghost)
- Animated keepsake video export — 4-second Canvas 2D animation recorded as WebM/MP4 via browser-native MediaRecorder
- Image/Moment toggle in keepsake preview modal with live theme switching
- 4 color themes for keepsakes: gold, silver, sepia, forest
- Waypoint icons on map routes — 7 SVG icon types (leaf, eye, heart, seated figure, sparkles, flag, mappin)
- Waypoint tooltips on hover, emotion journey dotted line connecting waypoints
- Waypoint timeline panel in sidebar with distance-from-start
- Waypoint icons rendered in keepsake exports
- 3D terrain toggle on both single-walk and overlay maps (Mapbox DEM)
- Walk signature glyph — longest walk's route as abstract stroke in border
- Compass rose with hash-driven decorative lines
- "Generate Keepsake" button with shimmer animation
- Sample data updated with waypoints across all 3 pilgrimages (34 total)
- SVG text escaping utility for injection prevention in border elements

### Fixed
- Waypoint markers adapt to light/dark map context (cream on light, dark on overlay)
- 3D terrain resets when switching between list/overlay views
- Keepsake modal supports Escape key and ARIA dialog attributes
- Route restoration uses finally block in export pipeline
- Empty walks guard on buildCombinedWalk and generateKeepsakeVideo
- Safari compatibility for animated keepsake (video/mp4 fallback)
- Abort safety in video generation (no double-rejection, state-guarded recorder.stop)

### Changed
- Replaced dual export buttons with single "Generate Keepsake" button and preview modal
- Keepsake filenames include walk count and unique suffix
- Exported svgToImage as shared utility
- Extracted buildCombinedWalk from seal.ts for reuse
- 165 tests across 10 test files

## [1.0.1] - 2026-03-24

### Added
- Redesigned home page with walking staff mark, italic title, tighter layout
- GitHub Octocat icon on home page linking to repo
- Styled token prompt page (was unstyled browser defaults)
- README with architecture, dev setup, features, and JS bridge API

### Changed
- Deploy only on release publish (not every push to main)
- Upgraded Node.js from 20 to 22 in CI/deploy workflows
- Subtitle: "See your walks. Your data stays with you."
- Rounded pill-style buttons matching wabi-sabi aesthetic

## [1.0.0] - 2026-03-24

### Added
- Browser-based viewer for .pilgrim and .gpx walk files
- GPX parser with stat computation (distance, duration, elevation, steps)
- Pilgrim parser with activity derivation (walk/talk/meditate from raw data)
- Mapbox GL map with route display, activity-colored segments, start/end markers
- 8 sidebar panels: Stats, Elevation, Timeline, Intention, Weather, Transcriptions, Celestial, Goshuin Seal
- Walk list for multi-walk files with click-to-select
- Overlay view with season-colored routes on dark map
- Time-of-day color palette (dawn/midday/dusk/night)
- PNG export with two modes: "with stats" footer and "clean" art version
- Combined journey goshuin seal on exported images
- Year in Review — filter overlay by year with year picker
- Metric/imperial unit toggle (global, affects all panels and stats)
- Dark/light mode with lunar phase toggle
- Animated calligraphy route background on home page with terrain, particles, seals, and captions
- Rotating transcription quotes from sample pilgrimage data
- Sample pilgrimage files: Kumano Kodo, Camino de Santiago, Shikoku 88 (paired .gpx/.pilgrim)
- Drag-and-drop file loading with file picker fallback
- Collapsible panels with expand/collapse animation
- Mobile responsive layout with bottom sheet sidebar
- iOS Safari safe area support
- window.pilgrimViewer.loadData() JavaScript bridge API for WKWebView integration
- Mapbox token resolution (env var, localStorage, prompt)
- Invalid token error detection with user-facing message
- Walking staff favicon
- OG image and full SEO meta tags
- Privacy-first: "Your data stays on your device" messaging
- GitHub Pages deployment with CI pipeline
- 137 tests across 9 test files
- MIT license
