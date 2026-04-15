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
- 10 data panels: Stats, Waypoints, Photos, Elevation, Timeline, Intention, Weather, Transcriptions, Celestial, Seal
- Reliquary photo support — circular thumbnail markers at each pinned photo's GPS coordinate on the map, tap to expand. Sidebar Photos panel shows the same photos as a thumbnail grid; tap a thumbnail to fly the map to that location.
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
npm test          # Run 205 tests
npm run build     # Production build to dist/
```

## Stack

| | |
|---|---|
| **Runtime** | Vanilla TypeScript, Vite, Mapbox GL JS, JSZip, fast-xml-parser |
| **Tests** | Vitest (205 tests, 12 files) |
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

## Sample photo credits

The Camino de Santiago sample file (`public/samples/camino-santiago.pilgrim`) embeds nine photos from Wikimedia Commons to demonstrate the Walk Reliquary feature. All photos have been resized to ~600px max dimension and JPEG-compressed for thumbnail display. The on-route coordinates are synthetic — they place each photo at a plausible point along the sample walk, not at the original photographer's GPS.

- **Sarria medieval bridge** — Diego Delso — [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) — [Wikimedia](https://commons.wikimedia.org/wiki/File:Puente_medieval_sobre_el_r%C3%ADo_Celeiro,_Sarria,_Camino_de_Santiago,_Lugo,_Espa%C3%B1a,_2015-09-19,_DD_07.jpg)
- **Yellow arrow waymark** — Mike T. Norton — [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) — [Wikimedia](https://commons.wikimedia.org/wiki/File:Camino_Sign.jpg)
- **Portomarín bridge** — Carlos Delgado — [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) — [Wikimedia](https://commons.wikimedia.org/wiki/File:Portomar%C3%ADn-1.JPG)
- **Gonzar kilometer marker** — Lameiro — [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) — [Wikimedia](https://commons.wikimedia.org/wiki/File:Portomar%C3%ADn_03-23b,_Gonzar.jpg)
- **Ligonde wayside cross** — Satna — [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) — [Wikimedia](https://commons.wikimedia.org/wiki/File:Ligonde_LameirosAbaixo.jpg)
- **Boente cross and fountain** — Simon Burchell — [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) — [Wikimedia](https://commons.wikimedia.org/wiki/File:Camino_Franc%C3%A9s,_Boente_02.jpg)
- **Galician landscape near Arzúa** — Simon Burchell — [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) — [Wikimedia](https://commons.wikimedia.org/wiki/File:Paisaje,_Camino_Franc%C3%A9s,_Arz%C3%BAa,_Galicia.jpg)
- **Monte do Gozo monument** — Simon Burchell — [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) — [Wikimedia](https://commons.wikimedia.org/wiki/File:Monumento_de_Monte_do_Gozo,_Santiago_de_Compostela.jpg)
- **Santiago de Compostela cathedral** — Lmbuga — [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) — [Wikimedia](https://commons.wikimedia.org/wiki/File:2025_Facade_towers_of_the_Cathedral_of_Santiago_from_the_Garden_of_the_Speaking_Stones._Galicia.jpg)

## License

The viewer source code is [MIT](LICENSE). Sample photo credits as listed above.
