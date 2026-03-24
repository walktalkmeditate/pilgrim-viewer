# *Pilgrim Viewer*

Open source browser-based viewer for `.pilgrim` and `.gpx` walk files.
Your data stays on your device.

**[view.pilgrimapp.org](https://view.pilgrimapp.org)**

---

## What it does

Drop a `.gpx` file and see your route on a map with distance, duration, and elevation.

Drop a `.pilgrim` file and see all of that *plus* your intention, weather, voice transcriptions, meditation timeline, celestial context, and a unique goshuin seal generated from the walk's data.

**Same route. Completely different experience.** That gap is the point.

## Features

**Viewer**
- Route map with activity-colored segments (walk/talk/meditate)
- 8 data panels: Stats, Elevation, Timeline, Intention, Weather, Transcriptions, Celestial, Seal
- Walk list for multi-walk files
- Collapsible panels, metric/imperial toggle

**Overlay**
- All walks layered on a dark map
- Color by season or time of day
- Walk timeline with clickable dates
- Year in Review filter

**Export**
- PNG with stats footer
- PNG clean (pure art, no text)
- Combined journey goshuin seal watermark

**Design**
- Dark/light mode with lunar phase toggle
- Wabi-sabi aesthetic (Cormorant Garamond + Lato)
- Mobile responsive with bottom sheet sidebar
- Animated calligraphy route background on home page

## Try it

Visit **[view.pilgrimapp.org](https://view.pilgrimapp.org)** and click a sample:

| Route | GPX | Pilgrim |
|-------|-----|---------|
| Kumano Kodo, 5 days | `.gpx` | `.pilgrim` |
| Camino de Santiago, 5 days | `.gpx` | `.pilgrim` |
| Shikoku 88, 4 days | `.gpx` | `.pilgrim` |

Or drop your own `.gpx` or `.pilgrim` file.

## Development

```bash
git clone git@github.com:walktalkmeditate/pilgrim-viewer.git
cd pilgrim-viewer
npm install
```

Create `.env.local` with your [Mapbox token](https://account.mapbox.com/access-tokens/):

```
VITE_MAPBOX_TOKEN=pk.your_token_here
```

```bash
npm run dev       # Start dev server at localhost:5173
npm run typecheck # TypeScript check
npm test          # Run 137 tests
npm run build     # Production build to dist/
```

## Stack

| | |
|---|---|
| **Runtime** | Vanilla TypeScript, Vite, Mapbox GL JS, JSZip, fast-xml-parser |
| **Tests** | Vitest (137 tests, 9 files) |
| **Deploy** | GitHub Pages via GitHub Actions (tag-triggered) |
| **Fonts** | Cormorant Garamond, Lato (Google Fonts) |

No framework. No state management library. No CSS framework. The viewer is a single-page app built with DOM APIs and canvas.

## Architecture

```
src/
  parsers/     .pilgrim and .gpx → normalized Walk type
  map/         Mapbox renderers (single walk + overlay) + PNG export
  panels/      8 data panels + goshuin seal
  ui/          Drop zone, walk list, layout, route animation, toggles
  main.ts      App entry — wires everything together
```

Both parsers normalize into the same `Walk` type. Everything downstream is format-agnostic. Panels self-hide when their data is absent.

## JS Bridge API

For embedding in a native app via WKWebView:

```swift
let json = // serialize walks as .pilgrim JSON
webView.evaluateJavaScript("window.pilgrimViewer.loadData(\(json))")
```

Accepts `{ walks: [...], manifest?: {...} }` — same shapes as the `.pilgrim` ZIP contents. Data goes from CoreData to Swift to WKWebView JavaScript to rendered on screen. Nothing touches a server.

## Privacy

Everything runs in your browser. Your walk data is never uploaded, stored, or transmitted. The Mapbox token is used only to load map tiles. File parsing, rendering, and export all happen locally.

## Related

- [Pilgrim](https://pilgrimapp.org) — the iOS app that creates `.pilgrim` files

## License

[MIT](LICENSE)
