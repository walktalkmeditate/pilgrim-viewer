# Pilgrim Editor — Design Spec

**Date:** 2026-04-25
**Status:** Approved
**Deployment:** edit.pilgrimapp.org (same repo + bundle as view.pilgrimapp.org)
**Repo:** github.com/walktalkmeditate/pilgrim-viewer (extends existing viewer)

## Overview

A redactor / pruner for `.pilgrim` and `.gpx` files. Lives inside the existing pilgrim-viewer codebase, served at a second hostname `edit.pilgrimapp.org`. View-mode at `view.pilgrimapp.org` is unchanged.

The editor lets a user *tend to* an existing file: archive whole walks, delete sections / photos / voice recordings / pauses / activity segments, trim the start or end of a route on the map, and edit three text fields (intention, reflection, voice transcription). It is delete-first by design — the only edits permitted are typo-fixes on inherently text-from-imperfect-sources fields. Numeric / sensor / GPS data cannot be edited (that would be forging). Whole-walk deletion preserves the walk's date, distance, and meditation/talk time as a skeletal `ArchivedWalk` so lifetime aggregates in the file remain intact.

The vibe is intentionally not "content management." It's tending.

## Scope

### In v1

- Drop a `.pilgrim` or `.gpx` file (same drop zone as viewer).
- Toggle into Tend mode (only available at `edit.pilgrimapp.org`).
- **Delete operations:**
  - Whole walks (multi-walk `.pilgrim` only) — moves to `manifest.archived[]` as a skeletal record.
  - Whole panel sections per walk: `intention`, `reflection`, `weather`, `celestial`.
  - Individual photos (by `localIdentifier`).
  - Individual voice recordings (by `startDate`).
  - Individual pauses, individual activity segments (by `startDate`).
  - Waypoints in `.gpx` files (by lat/lng key).
- **Trim route** start or end via map handles (operates on cumulative meters).
- **Edit text** (3 fields only): `intention`, `reflection.text`, voice `transcription`.
- **Stats recompute** on save for any walk whose route or segments changed (`distance`, `ascent`, `descent`, `pauseDuration`, `activeDuration`, `talkDuration`, `meditateDuration` recomputed from data; `steps` and `burnedEnergy` scaled proportionally to new distance).
- **Modifications log** (`manifest.modifications[]`) appended on save, cumulative across sessions, with a save-time toggle to omit history (default ON).
- **JSON expert mode** — flip a single walk's panel area into a raw JSON textarea, validated; commits as a single `replace_walk` mod.
- **Save** — produces a fresh download (`<originalstem>-tended.pilgrim` or `.gpx`); original file on disk untouched (browser can't write back anyway).

### Out of scope (v2 or later)

- Adding new content (intention / reflection / photos to a walk that has none) — that is a creation tool, different product.
- Photo re-positioning (changing GPS for an existing photo).
- Editing numeric / sensor / GPS / date data (forging).
- Audio editing (recordings are metadata-only in `.pilgrim`).
- Pilgrimage anchoring, AI assist, ghost walk composer.
- Splitting one walk into two; merging two walks.
- Multi-track curation in `.gpx`.
- Account / cloud / collaboration.

### Non-goals

- Don't try to be a full editor. Honesty of the artifact comes from being delete-mostly.
- Don't extract a shared `pilgrim-core` library for v1. The editor lives in the viewer's repo; the parsers, panels, and map are reused in place.
- Don't build a separate "preview" UI — the editor's UI *is* the viewer's UI plus affordances.

## Architecture

### Stack (matches viewer exactly)

| | |
|---|---|
| Runtime | Vanilla TypeScript, Vite |
| Map | Mapbox GL JS |
| File I/O | JSZip (`.pilgrim`), fast-xml-parser (`.gpx`) |
| Tests | Vitest + jsdom |
| Deploy | GitHub Pages via Actions, tag-triggered |
| Fonts | Cormorant Garamond, Lato (same Google Fonts) |
| Aesthetic | Same wabi-sabi, dark/light + lunar toggle |

No frameworks. No state library. No CSS framework.

### One repo, two hostnames

- `view.pilgrimapp.org` — pure viewer, no edit code, no Tend toggle visible.
- `edit.pilgrimapp.org` — same bundle, hostname-gated to mount the edit layer.

`main.ts` checks `location.hostname` early. If it starts with `edit.`, it dynamically `import('./edit')` and mounts affordances. Otherwise the import never happens — Vite tree-shakes the edit code out of the view-only bundle. Both hostnames are CNAMEs to the same GitHub Pages site.

### Project structure (additions only — viewer is unchanged otherwise)

```
pilgrim-viewer/src/
├── parsers/
│   ├── pilgrim.ts          # extended: parse manifest.archived[], manifest.modifications[]
│   ├── gpx.ts              # extended: keep raw XML AST alongside normalized Walk
│   └── types.ts            # extended: ArchivedWalk, Modification, ModOp, GpxXmlAst
├── edit/                   # ← new layer (only loaded at edit.pilgrimapp.org)
│   ├── staging.ts          # pending modification stack: push, undo, clear, list
│   ├── applier.ts          # pure function (originalWalk, mods) → newWalk
│   ├── recompute.ts        # derive WalkStats from a modified Walk
│   ├── archive.ts          # convert a deleted Walk into a skeletal ArchivedWalk
│   ├── affordances.ts      # injects × buttons + inline editors into existing panels
│   ├── trim-handles.ts     # Mapbox drag handles + live stat recompute
│   ├── json-mode.ts        # raw JSON textarea editor for one walk
│   └── save.ts             # serialize tended state → .pilgrim ZIP / .gpx XML
├── main.ts                 # extended: hostname gate to mount edit/
└── style.css               # extended: edit-mode affordance styles
```

### Architectural rules

1. **`edit/` does not reach into rendering files in `panels/`, `ui/`, or `map/`.** Affordances inject from `edit/affordances.ts` and `edit/trim-handles.ts` via DOM hooks (querySelector + event listeners against the rendered DOM, plus Mapbox layer events for the trim handles). Renderers stay declarative. (Note: `parsers/` and `types.ts` *are* extended additively to support the new manifest fields — the rule is specifically about edit-mode behavior staying in `edit/`, not about parsers being untouchable.)
2. **`edit/applier.ts` is pure.** `(originalWalk, modifications) → newWalk`. No I/O, no DOM, no globals. Drives both the live preview and the saved output. Trivially unit-testable.
3. **`edit/staging.ts` is the only mutable state.** Modifications accumulate there. UI subscribes; save reads from it. No scattered mutation.
4. **`edit/save.ts` is pure.** Returns `{ blob: Blob, filename: string }` from a given (originalFile, modifications, includeHistory) tuple. A small `triggerDownload(blob, filename)` helper (in `edit/save.ts` or a sibling) handles the actual `<a download>` click. Tests target the pure serialization function; the download helper is exercised only manually.

### Hostname gate (and local dev)

```typescript
// main.ts
const isEditHost = location.hostname.startsWith('edit.')
const isLocalDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
const enableEdit = isEditHost || (isLocalDev && new URLSearchParams(location.search).has('edit'))

if (enableEdit) {
  const { mountEditLayer } = await import('./edit')
  mountEditLayer()
}
```

In production: `edit.pilgrimapp.org` mounts the edit layer; `view.pilgrimapp.org` does not. In local dev: pass `?edit=1` to opt in. The dynamic `import()` ensures Vite tree-shakes the edit code out of the view-only bundle.

### Deploy

Existing GitHub Pages workflow, unchanged. Add CNAME `edit.pilgrimapp.org` pointing at the same Pages site. Tag-triggered builds as before.

### Cross-link

- Editor home: small "View only?" link → `view.pilgrimapp.org`.
- Viewer home: small "Tend a file?" link → `edit.pilgrimapp.org`.

## UX Model

### Tend toggle

Single button in the top bar at `edit.pilgrimapp.org`, near the existing dark/light + metric/imperial toggles.

- **View** (default) — exactly the viewer's behavior. Nothing destructive. No accidental deletes. Button label: "Tend".
- **Tend** — affordances revealed. × buttons appear; map gains trim handles; three text fields become click-to-edit; staging drawer slides up the moment the first mod is staged. Button label: "Done".

### Affordances per data type (visible only in Tend mode)

| Target | Affordance | Outcome |
|---|---|---|
| Walk in walk-list (multi-walk file) | × on the row | Modal: "Archive this walk?" → stages `archive_walk` |
| Whole panel header (intention / weather / celestial / reflection) | × in panel header | Stages `delete_section` |
| Single photo | × on hover/tap | Stages `delete_photo` |
| Single voice recording | × on the row | Stages `delete_voice_recording` |
| Single pause / activity segment | × on the row | Stages `delete_pause` / `delete_activity` |
| GPX waypoint | × on the row / map marker | Stages `delete_waypoint` (GPX only) |
| Map polyline | Two handles at the route ends | Drag inward → stages `trim_route_start` / `trim_route_end` |
| `intention` text | Click into rendered text | Inline single-line editor; commit on blur or Enter; stages `edit_intention` |
| `reflection.text` text | Click into rendered text | Inline multi-line editor; commit on blur or Cmd+Enter; stages `edit_reflection_text` |
| Voice `transcription` text | Click into rendered transcription | Inline multi-line editor; commit on blur; stages `edit_transcription` |

### Visual language

- × button — small, low-contrast (rgba 0.4), reveals on hover/focus, becomes solid on hover. Never in tab order until Tend mode is on.
- Inline-editable text — subtle dotted underline in Tend mode; becomes a textarea with the same font on click.
- Trim handles — two small circles at each route end, color-matched to the route's activity segment. Drag values shown as "−312m from start" labels. Trimmed-off portion renders as a faded gray dashed line during drag (so the user sees what they're removing, not just what remains).

### Staging drawer (the safety net)

Slides up from the bottom of the screen the moment the first mod is staged. Persistent until cleared or saved.

- **Count** at the leading edge: "3 changes pending".
- **List** of staged mods, each with a small ↩ to undo just that one ("Trimmed 312m from route start ↩").
- **Two buttons** at the trailing edge: **Save tended file** (primary), **Discard all** (text-style, low-emphasis, requires a confirmation click).
- **Visible across View/Tend toggles whenever staged mods exist.** Hiding pending destructive intent feels unsafe. View-mode-with-mods looks like the viewer plus the drawer at the bottom.
- **"Include tending history" checkbox** in the drawer next to the Save button (default ON). When OFF, both the current session's mods and any pre-existing `manifest.modifications` entries from the loaded file are stripped from the saved output.

### The one hard confirmation: archiving a whole walk

Whole-walk archive is the only act with content loss that survives Save. Confirmation copy:

> Archive *Kumano Day 3*?
>
> Route, photos, intention, reflection, and transcriptions will be permanently removed from this file. The walk's date, distance, and meditation time will remain in your archive so your lifetime totals stay intact.
>
> [Cancel]   [Archive]

Even this stages rather than applies — the archive only finalizes on Save. But the modal makes the user pause: re-importing the saved file into the editor cannot un-archive.

### Save flow

1. Apply all staged mods to a fresh in-memory copy of the file.
2. Recompute walk-level stats for any walk whose route or segments changed.
3. Convert each `archive_walk` mod into a skeletal `ArchivedWalk`; remove the corresponding file from `walks/`; append to `manifest.archived`.
4. **For each `delete_photo` mod, also remove the corresponding `photos/<filename>.jpg` from the ZIP if present** — `.pilgrim` archives produced by Stage 5+ of the iOS app embed resized JPEG bytes (per `PilgrimPackageImporter.swift` documentation); leaving them after deletion creates orphan bytes.
5. Append session mods to `manifest.modifications` (unless the history toggle is off, in which case strip all modifications history — both pre-existing and newly-staged).
6. **`manifest.schemaVersion` stays `"1.0"`.** The iOS importer hard-rejects any other version (`PilgrimPackageImporter.swift:86-88`). The new fields (`archived`, `archivedCount`, `modifications`) are additive and silently ignored by the existing iOS Codable struct.
7. Write a new ZIP (`.pilgrim`) or XML (`.gpx`) → return `{ blob, filename }`.
8. The download helper triggers the browser save as `<originalstem>-tended.pilgrim` (or `.gpx`). If the original already ends in `-tended`, keep the same name.
9. Clear staging drawer.

The original file on disk is never touched (browser can't write back anyway).

### JSON expert mode

One `{ }` icon per walk, pinned to the top of that walk's panel area in Tend mode. Clicking it replaces the entire panel area for that walk with a JSON textarea showing the walk's raw JSON. Edits are validated on blur; invalid JSON shows an inline error and refuses to commit. Valid JSON commits as a single `replace_walk` mod (appears in the staging drawer like any other change). The `{ }` icon flips back to panel view. Power-user only, never the primary surface.

### Live preview semantics

When a delete mod is staged, the rendered view updates immediately to reflect post-tending state. The staging drawer is the source of truth for what's pending; undoing a mod from the drawer reverts the visual state.

Specifically:

- Delete a photo → photo disappears from the panel and from the map immediately.
- Delete a section / pause / activity / waypoint → same; rendered immediately.
- Trim a route → polyline updates as the handle is dragged; final value commits on release.
- Edit a text field → live as the user types in the inline editor.
- **Archive a walk** is the one exception: the walk row stays in the walk-list with low-opacity + strikethrough + a "Pending archive" tag. Still selectable so the user can review what they're archiving. After Save, the row is gone.

### Empty / error states

- No file loaded → same drop zone as viewer.
- File loaded at `edit.pilgrimapp.org` opens in **View mode** (Tend toggle = OFF). User opts into Tend mode explicitly.
- Loaded file with limited tendable surface (e.g., a `.gpx` with no waypoints and one short track) → Tend toggle still works; only trim handles render.
- Save error (e.g., zip corruption mid-save) → shown in the drawer; staged mods preserved for retry.

## Data Model

### Modification — the unit of staged change

```typescript
interface Modification {
  id: string                    // uuid; the drawer references this for undo
  at: number                    // epoch ms when staged
  op: ModOp
  walkId?: string               // present for walk-scoped ops
  payload: ModPayload           // op-specific
}

type ModOp =
  // walk-level
  | 'archive_walk'              // payload: {}
  | 'replace_walk'              // payload: { walk: PilgrimWalk } (JSON expert mode)
  // section deletes
  | 'delete_section'            // payload: { section: 'intention' | 'reflection' | 'weather' | 'celestial' }
  // list-item deletes
  | 'delete_photo'              // payload: { localIdentifier: string }
  | 'delete_voice_recording'    // payload: { startDate: number }
  | 'delete_pause'              // payload: { startDate: number }
  | 'delete_activity'           // payload: { startDate: number }
  | 'delete_waypoint'           // payload: { lat: number, lng: number }   (GPX only)
  // route trim (cumulative meters)
  | 'trim_route_start'          // payload: { meters: number }
  | 'trim_route_end'            // payload: { meters: number }
  // text edits (3 fields only)
  | 'edit_intention'            // payload: { text: string }
  | 'edit_reflection_text'      // payload: { text: string }
  | 'edit_transcription'        // payload: { recordingStartDate: number, text: string }
```

### Identifier rule (no synthetic IDs injected)

- **Walks** — `id` (UUID, already in schema).
- **Photos** — `localIdentifier` (already in schema).
- **Voice recordings, pauses, activities** — keyed by their `startDate` as **epoch seconds** (matching the `.pilgrim` file convention). When extracting from a parsed JS `Date`, use `Math.floor(date.getTime() / 1000)`. Walking events are seconds apart in practice; no collisions. Stable across save-and-reopen.
- **GPX waypoints** — keyed by `(lat, lng)` pair, full float precision (waypoints have no IDs in GPX).

All numeric timestamps in mod payloads (`startDate`, `recordingStartDate`) and in `ArchivedWalk` (`startDate`, `endDate`, `archivedAt`) are **epoch seconds**, matching the `.pilgrim` file format. Only `Modification.at` uses **epoch milliseconds** (because it's an internal log keyed off `Date.now()`, never compared against file-format timestamps).

### Parser defaults for backward compat

When loading an older `.pilgrim` file with no `archived` or `modifications` keys, `parsers/pilgrim.ts` defaults them to empty arrays. New writes append normally. This means any existing `.pilgrim` file (including those produced by current iOS) opens cleanly in the editor.

### Coalescence rule (push-time)

Some ops are write-once-rewrite. Repeated dragging of the trim handle, or repeated typing in the intention field, must not pile up dozens of mods.

- `trim_route_start`, `trim_route_end` — coalesce per `walkId` (last value wins).
- `edit_intention`, `edit_reflection_text` — coalesce per `walkId`.
- `edit_transcription` — coalesce per `(walkId, recordingStartDate)`.

All `delete_*` ops are append-only and idempotent; the applier folds duplicates as a single delete.

### The applier — pure function

```typescript
// Returns null if the walk should be archived.
function applyMods(walk: PilgrimWalk, mods: Modification[]): PilgrimWalk | null
```

Behavior:

1. If any `archive_walk` mod is present → return `null` (caller treats as archive transition).
2. If a `replace_walk` mod is present → use that walk as the base; ignore other mods.
3. Otherwise: filter arrays (photos, voice recordings, pauses, activities) by excluding items whose key matches a `delete_*` mod.
4. Trim `route` coordinates per the trim algorithm (see §Recompute & Trim).
5. Apply text edits: replace `intention`, `reflection.text`, or the matching voice recording's `transcription`.
6. Strip whole sections per `delete_section` mod (set to `undefined`).
7. Recompute stats from the modified data.
8. Set `walk.isUserModified = true` (existing field in the iOS schema).

All `delete_*` ops reference the **original** walk's array indices/keys — the applier collects keys-to-skip and filters once. Order-independent, idempotent.

### ArchivedWalk — the skeletal shadow

```typescript
interface ArchivedWalk {
  id: string                 // original walk id
  startDate: number          // epoch seconds
  endDate: number            // epoch seconds
  archivedAt: number         // epoch seconds, when this transition happened
  stats: {
    distance: number         // meters
    activeDuration: number   // seconds
    talkDuration: number
    meditateDuration: number
    steps?: number
  }
}
```

That's it. No route, no photos, no transcriptions, no intention, no reflection, no weather, no celestial. Bare bones of fact.

### File mutations on Save

```
manifest.json (mutated):
  walkCount         → count of files in walks/ after Save
  archivedCount     → manifest.archived.length (new field)
  archived          → [...existingArchived, ...newlyArchived]
  modifications     → [...existingMods, ...stagedMods]   (or [] if history toggle off)

walks/<id>.json     → file removed for archived walks; rewritten for tended walks
```

`manifest.modifications` is cumulative across sessions when the history toggle stays ON. Tend a file twice (export → tend → save → reopen → tend → save) and the file carries its full tending history. Each entry is ~100 bytes; cost is negligible.

## Stats Recompute & Route Trim

### Recompute matrix

| Field | Recompute method |
|---|---|
| `distance` | Sum haversine between consecutive route coords |
| `ascent` | Sum of positive elevation deltas along route |
| `descent` | Sum of negative deltas |
| `pauseDuration` | Sum of remaining `pauses[].duration` |
| `activeDuration` | `(endDate − startDate) − pauseDuration` |
| `talkDuration` | Sum of remaining `activities[]` where `type === 'talk'` |
| `meditateDuration` | Sum where `type === 'meditate'` |
| `steps` | Scaled proportionally: `original × newDist / oldDist` |
| `burnedEnergy` | Same — scaled proportionally to new distance |

`steps` and `burnedEnergy` come from CoreMotion + Health and aren't derivable from the route. Scaling is an honest approximation. The alternative (set to `undefined`) creates gaps in the data trail; for re-import into iOS, scaled numbers behave better than missing ones.

### Reuse what the viewer already has

The viewer's `src/parsers/` already contains `geo.ts` and `route-trim.ts` — almost certainly contains haversine and route-distance utilities used for existing route coloring and stats display. `edit/recompute.ts` should import from these, not duplicate. (The implementation plan will verify the existing shapes and adapt as needed.)

### Trim algorithm

```
trimRouteStart(coords, meters):
  cumulative = 0
  for k from 1 to coords.length:
    cumulative += haversine(coords[k-1], coords[k])
    if cumulative >= meters:
      return coords.slice(k)              // drop 0..k-1
  return coords.slice(coords.length - 1)  // edge case: trim exceeds total length

trimRouteEnd: symmetric, dropping from the back

bothTrims:
  apply start first, then end against the same coords array
  clamp so the result has at least 2 coordinates
```

No interpolation at the cut point — truncate at the closest sample. Sub-meter precision is irrelevant when GPS samples are typically 1–5m apart.

### Live preview during drag

- Drag → throttle stat recompute to ~30fps → update Mapbox polyline source data + Stats panel + handle's "−312m" label.
- Trimmed-off portion renders as a faded gray dashed line during drag.
- Drag is preview-only; only handle release pushes a `trim_route_start` / `trim_route_end` mod into staging (with coalescence).

### Pause / activity delete consistency

- Delete a pause → its duration shifts from `pauseDuration` into `activeDuration` (wall-clock time fixed; partition changes).
- Delete a talk/meditate activity → no longer counts toward `talkDuration` / `meditateDuration`. `activeDuration` unchanged (you were still walking during talk).
- The editor does not enforce activity/pause non-overlap or other consistency invariants beyond stat recomputation. iOS's original quirks are preserved.

### `isUserModified`

Set `walk.isUserModified = true` on any walk whose data was changed. The iOS schema already has this field (`PilgrimPackageModels.swift:79`); round-trips into iOS internal state cleanly.

### Edge cases

- **Trim exceeds total route length** — clamp; ensure at least 2 coords remain. Show a warning in the staging drawer ("trim clamped to route length").
- **All photos deleted** — Photos panel hides itself (existing viewer behavior; panels self-hide when their data is absent).
- **All voice recordings deleted** — Transcriptions panel hides.
- **`activities` array becomes empty** — `talkDuration` and `meditateDuration` go to 0; viewer hides the panel if both are 0.
- **GPX file with no waypoints + single track** — only trim handles render in Tend mode; no other affordances apply.

## GPX Support

GPX is a much smaller surface. Only delete + trim apply.

| Affordance | Applies to GPX? |
|---|---|
| Trim route start/end | ✅ |
| Delete waypoint | ✅ |
| Save modified GPX | ✅ |
| Archive whole walk | ❌ (no aggregate-archive concept for GPX) |
| Delete photos / pauses / activities / sections / transcriptions | ❌ (none exist in GPX) |
| Edit text fields | ❌ (no intention/reflection in GPX) |
| Multi-track curation | ❌ (out of v1) |

In Tend mode, a GPX file shows trim handles on the map and × on each waypoint. Nothing else.

### GPX save preserves XML structure

The viewer normalizes GPX → `Walk` (lossy: track names, GPX-specific extensions, namespaces collapse). To save without losing those fields, we hold both representations during the session.

```
parsers/gpx.ts (extended):
  parseGpx(xml: string) → { walk: Walk, ast: GpxXmlAst }

edit/save.ts:
  if walk.source === 'gpx':
    apply mods to ast (filter <trkpt>, remove <wpt>)
    fast-xml-parser builder → new XML string
    download as .gpx
  if walk.source === 'pilgrim':
    apply mods to walks + manifest
    JSZip → new .pilgrim
```

The AST stays in memory only for GPX files, scoped to the loaded session.

### Filenames

- `.pilgrim` → `<originalstem>-tended.pilgrim`
- `.gpx` → `<originalstem>-tended.gpx`
- If the original already ends in `-tended`, keep the same name (no `-tended-tended-...`).

## iOS Compatibility (Re-Import)

- **File loads on iOS:** ✅ Swift's `JSONDecoder` ignores unknown top-level keys. `manifest.archived` and `manifest.modifications` are silently tolerated; iOS importer iterates `walks/` directly and decodes individual walks. Re-import works.
- **iOS aggregate stats after re-import:** ❌ iOS only ingests files in `walks/`; archived skeletons are invisible to iOS. Lifetime totals on the device shrink to reflect only active walks. Aggregate preservation is a property of the *file* and the web tools, not iOS, in v1.
- **`walk.isUserModified` is set** on any tended walk (already part of the iOS schema; round-trips cleanly).

If iOS aggregate parity becomes important later, a future iOS release can extend `PilgrimManifest` with `archived: [PilgrimArchivedWalk]?` and store skeletal archived walks in CoreData behind an `is_archived` flag. Additive change. Not in scope for editor v1.

## Testing Plan

Match the viewer's setup: Vitest + jsdom. Tests in `tests/edit/` mirroring `src/edit/` structure.

### Pure-logic tests (the bulk)

- `staging.test.ts` — push, undo, clear; coalescence rules per op; mod ordering preserved.
- `applier.test.ts` — each mod type produces the expected `Walk` change; deletions idempotent and order-independent; `replace_walk` overrides others; `archive_walk` returns null.
- `recompute.test.ts` — distance, ascent/descent from synthetic routes; pauseDuration/activeDuration with deletions; talk/meditate duration with deletions; steps/energy proportional scaling.
- `archive.test.ts` — `Walk` → `ArchivedWalk` keeps only skeletal fields; rejects already-archived input.
- `save.test.ts` — pure `serializeTendedFile()` produces correct `{ blob, filename }`; ZIP round-trips through the viewer's parser; GPX round-trips through fast-xml-parser; cumulative `manifest.modifications` log appends correctly; history-off toggle strips both old and new mods; `manifest.schemaVersion` stays `"1.0"`; deleted photos remove their corresponding `photos/<x>.jpg` from the ZIP if present.

### Fixture-based round-trip tests

- Use the existing `samples/kumano-kodo.pilgrim` and `samples/kumano-kodo.gpx`. Open → apply representative mod sequence → save → re-parse → assert.
- "Tend a tended file" test: save once, re-open the saved output, tend further, save again, assert `manifest.modifications` has all entries from both sessions in order, and `manifest.archived` accumulates correctly.

### Schema invariants test (the iOS gate)

`schema.test.ts` — a `validatePilgrimManifest(buf)` function asserting the saved `.pilgrim` decodes against a TS mirror of `PilgrimPackageModels.swift`'s strict Codable rules: required fields present, correct types, no `null` where Swift expects a value. Runs on every save fixture. CI gate: catches any regression that would break iOS reimport.

### DOM tests (focused wiring)

- Tend toggle reveals × buttons + trim handles; toggling back hides them.
- Inline intention editor: click → edit → blur → mod staged.
- Staging drawer appears when first mod is staged; ↩ on a single mod removes just that one; Save triggers download (mock the file write).
- Hostname gating: when `location.hostname === 'view.pilgrimapp.org'` (mocked), Tend toggle is not in the DOM at all and the `edit/` module is not loaded.

### Out of test scope

- Mapbox internal rendering (third-party).
- Pixel-perfect handle positions (visual).
- Actual browser file download behavior (jsdom can't drive `<a download>`; tests assert that `save.ts` produces a `Blob` with the right size and contents).

### CI

Existing `npm test` + `npm run typecheck` + `npm run build` gates. The schema test runs as part of the standard suite. No new CI jobs.

## Open Questions / Future Work

- **Display of archived walks in the viewer.** The viewer at `view.pilgrimapp.org` currently has no awareness of `manifest.archived`. A future viewer enhancement could render an "Archived walks" ghost section (light gray, no map preview, just dates + basic stats — "12 walks tended into archive"). Not part of editor v1.
- **iOS reads `manifest.archived`.** A future iOS release closes the aggregate-parity gap (see iOS Compatibility above).
- **Library extraction.** If divergence between editor-only logic and viewer-only logic forces too many `if (editMode)` branches, extract a `pilgrim-core` package containing parsers + types. Not in v1; revisit after the editor stabilizes.
