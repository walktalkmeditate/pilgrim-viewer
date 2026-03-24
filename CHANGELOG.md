# Changelog

All notable changes to Pilgrim Viewer will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

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
