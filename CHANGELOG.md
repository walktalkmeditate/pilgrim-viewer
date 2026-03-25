# Changelog

All notable changes to Pilgrim Viewer will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

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
