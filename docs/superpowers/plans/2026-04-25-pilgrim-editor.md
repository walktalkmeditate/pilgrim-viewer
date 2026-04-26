# Pilgrim Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a redactor / pruner for `.pilgrim` and `.gpx` files, served at `edit.pilgrimapp.org` from the existing `pilgrim-viewer` repo. Lets the user archive whole walks (preserving lifetime aggregates via skeletal records), delete sections / photos / voice recordings / pauses / activity segments, trim route start/end with map handles, and edit three text fields (intention, reflection, voice transcription).

**Architecture:** Adds a tree-shakeable `src/edit/` layer to the existing viewer codebase. View-mode at `view.pilgrimapp.org` is unchanged; the edit layer mounts only when `location.hostname.startsWith('edit.')` (or `?edit=1` on localhost). Affordances inject from `edit/affordances.ts` via DOM hooks against existing panels — renderer files in `panels/`, `ui/`, `map/` stay declarative. A pure `edit/applier.ts` drives both live preview and saved output. A pure `edit/save.ts` returns `{ blob, filename }`; a tiny helper triggers the actual download.

**Tech Stack:** TypeScript, Vite, Mapbox GL JS, JSZip (`.pilgrim`), fast-xml-parser (`.gpx`), Vitest + jsdom. No frameworks. No state library. Matches existing viewer stack exactly.

**Spec:** [`docs/superpowers/specs/2026-04-25-pilgrim-editor-design.md`](../specs/2026-04-25-pilgrim-editor-design.md)

---

## File Structure

**New files:**

```
pilgrim-viewer/src/edit/
├── index.ts               # Entry: mountEditLayer() — called from main.ts
├── staging.ts             # Pending mod stack: push, undo, clear, list, subscribe
├── applier.ts             # Pure (walk, mods) → walk | null
├── recompute.ts           # Stat recomputation
├── archive.ts             # Walk → skeletal ArchivedWalk
├── save.ts                # Pure serialize + download helper
├── tend-toggle.ts         # The "Tend"/"Done" button
├── drawer.ts              # Staging drawer (count, list, save, discard)
├── affordances.ts         # × buttons + inline editors injected into panels
├── trim-handles.ts        # Mapbox drag handles + live preview
├── json-mode.ts           # Per-walk JSON textarea editor
├── archive-modal.ts       # Hard confirmation for whole-walk archive
└── edit.css               # Edit-mode styles (loaded via JS to keep view bundle clean)

pilgrim-viewer/tests/edit/
├── staging.test.ts
├── applier.test.ts
├── recompute.test.ts
├── archive.test.ts
├── save.test.ts
├── trim-route.test.ts     # for new trimRouteSeparately
├── schema.test.ts         # iOS schema invariants
└── integration.test.ts    # fixture round-trip
```

**Modified files:**

- `src/parsers/types.ts` — add `ArchivedWalk`, `Modification`, `ModOp`, `ModPayload`, extend `PilgrimManifest`.
- `src/parsers/pilgrim.ts` — read `manifest.archived[]` and `manifest.modifications[]` (default to `[]` when absent).
- `src/parsers/gpx.ts` — return `{ walks, ast }` instead of just `walks` (additive — main.ts ignores `ast`).
- `src/parsers/route-trim.ts` — add `trimRouteSeparately(route, { startMeters, endMeters })`.
- `src/main.ts` — hostname gate; dynamic-import edit layer.
- `src/ui/dropzone.ts` — small "Tend a file?" / "View only?" cross-link.

---

## Phase 1: Type & Parser Foundations

### Task 1: Extend types with edit-layer types

**Files:**
- Modify: `src/parsers/types.ts:143-149`

- [ ] **Step 1: Append new exports to `types.ts`**

Add these exports after the existing `PilgrimManifest` interface:

```typescript
export interface ArchivedWalk {
  id: string                 // original walk id (UUID)
  startDate: number          // epoch seconds
  endDate: number            // epoch seconds
  archivedAt: number         // epoch seconds — when this transition happened
  stats: {
    distance: number         // meters
    activeDuration: number   // seconds
    talkDuration: number     // seconds
    meditateDuration: number // seconds
    steps?: number
  }
}

export type ModOp =
  | 'archive_walk'
  | 'replace_walk'
  | 'delete_section'
  | 'delete_photo'
  | 'delete_voice_recording'
  | 'delete_pause'
  | 'delete_activity'
  | 'delete_waypoint'
  | 'trim_route_start'
  | 'trim_route_end'
  | 'edit_intention'
  | 'edit_reflection_text'
  | 'edit_transcription'

export type DeletableSection = 'intention' | 'reflection' | 'weather' | 'celestial'

export type ModPayload =
  | Record<string, never>                                                  // archive_walk
  | { walk: unknown }                                                      // replace_walk (raw walk JSON)
  | { section: DeletableSection }                                          // delete_section
  | { localIdentifier: string }                                            // delete_photo
  | { startDate: number }                                                  // delete_voice_recording / pause / activity
  | { lat: number; lng: number }                                           // delete_waypoint
  | { meters: number }                                                     // trim_route_start / trim_route_end
  | { text: string }                                                       // edit_intention / edit_reflection_text
  | { recordingStartDate: number; text: string }                           // edit_transcription

export interface Modification {
  id: string                 // uuid (the drawer references this for undo)
  at: number                 // epoch ms when staged (Date.now())
  op: ModOp
  walkId?: string            // present for walk-scoped ops
  payload: ModPayload
}
```

- [ ] **Step 2: Extend `PilgrimManifest` with new optional fields**

Replace the existing `PilgrimManifest` interface:

```typescript
export interface PilgrimManifest {
  schemaVersion: string
  exportDate: number
  appVersion: string
  walkCount: number
  preferences: PilgrimPreferences
  // Edit-layer additions (additive; absent in older files):
  archivedCount?: number
  archived?: ArchivedWalk[]
  modifications?: Modification[]
}
```

- [ ] **Step 3: Add `isUserModified` to the `Walk` interface**

Locate the `Walk` interface (around line 118) and add `isUserModified?: boolean` near `source`:

```typescript
export interface Walk {
  // ... existing fields ...
  source: 'pilgrim' | 'gpx'
  isUserModified?: boolean
}
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors — viewer code uses only the original fields, new optional fields don't break it).

- [ ] **Step 5: Commit**

```bash
git add src/parsers/types.ts
git commit -m "feat(types): add ArchivedWalk, Modification, ModOp for editor

Additive types for the pilgrim-editor feature. No runtime change."
```

---

### Task 2: Extend pilgrim parser to read archived + modifications

**Files:**
- Modify: `src/parsers/pilgrim.ts:406-417`
- Test: `tests/parsers/pilgrim.test.ts` (append a new `describe`)

- [ ] **Step 1: Write the failing test**

Append to `tests/parsers/pilgrim.test.ts`:

```typescript
describe('parsePilgrim — manifest extensions', () => {
  it('defaults archived and modifications to empty arrays for legacy files', async () => {
    // #when — build a minimal pilgrim ZIP with no archived/modifications keys
    const zip = new JSZip()
    zip.file('manifest.json', JSON.stringify({
      schemaVersion: '1.0',
      exportDate: 1745625600,
      appVersion: '1.0.0',
      walkCount: 0,
      preferences: {
        distanceUnit: 'km', altitudeUnit: 'm',
        speedUnit: 'min/km', energyUnit: 'kcal',
      },
    }))
    const buf = await zip.generateAsync({ type: 'arraybuffer' })

    const result = await parsePilgrim(buf)

    // #then
    expect(result.manifest.archived).toEqual([])
    expect(result.manifest.modifications).toEqual([])
    expect(result.manifest.archivedCount).toBe(0)
  })

  it('preserves archived and modifications when present', async () => {
    // #when
    const zip = new JSZip()
    zip.file('manifest.json', JSON.stringify({
      schemaVersion: '1.0',
      exportDate: 1745625600,
      appVersion: '1.0.0',
      walkCount: 0,
      archivedCount: 1,
      preferences: {
        distanceUnit: 'km', altitudeUnit: 'm',
        speedUnit: 'min/km', energyUnit: 'kcal',
      },
      archived: [{
        id: 'abc-123',
        startDate: 1773867600,
        endDate: 1773870120,
        archivedAt: 1745625600,
        stats: {
          distance: 20159, activeDuration: 2460,
          talkDuration: 125, meditateDuration: 900, steps: 26879,
        },
      }],
      modifications: [{
        id: 'mod-1', at: 1745625500000,
        op: 'archive_walk', walkId: 'abc-123', payload: {},
      }],
    }))
    const buf = await zip.generateAsync({ type: 'arraybuffer' })

    const result = await parsePilgrim(buf)

    // #then
    expect(result.manifest.archived).toHaveLength(1)
    expect(result.manifest.archived![0].id).toBe('abc-123')
    expect(result.manifest.modifications).toHaveLength(1)
    expect(result.manifest.modifications![0].op).toBe('archive_walk')
    expect(result.manifest.archivedCount).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/parsers/pilgrim.test.ts -t 'manifest extensions'`
Expected: FAIL — `result.manifest.archived` is `undefined` (parser doesn't populate it yet).

- [ ] **Step 3: Update parser to populate the new fields**

Replace the manifest construction in `src/parsers/pilgrim.ts:406-417` with:

```typescript
  const manifest: PilgrimManifest = {
    schemaVersion: manifestRaw.schemaVersion,
    exportDate: manifestRaw.exportDate,
    appVersion: manifestRaw.appVersion,
    walkCount: manifestRaw.walkCount,
    preferences: {
      distanceUnit: manifestRaw.preferences.distanceUnit,
      altitudeUnit: manifestRaw.preferences.altitudeUnit,
      speedUnit: manifestRaw.preferences.speedUnit,
      energyUnit: manifestRaw.preferences.energyUnit,
    },
    archived: Array.isArray(manifestRaw.archived) ? manifestRaw.archived : [],
    modifications: Array.isArray(manifestRaw.modifications) ? manifestRaw.modifications : [],
    archivedCount: typeof manifestRaw.archivedCount === 'number'
      ? manifestRaw.archivedCount
      : (Array.isArray(manifestRaw.archived) ? manifestRaw.archived.length : 0),
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/parsers/pilgrim.test.ts -t 'manifest extensions'`
Expected: PASS (both cases).

- [ ] **Step 5: Run full parser suite to confirm no regression**

Run: `npx vitest run tests/parsers/pilgrim.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/parsers/pilgrim.ts tests/parsers/pilgrim.test.ts
git commit -m "feat(parsers): read manifest.archived and manifest.modifications

Backward-compat additive: defaults to empty arrays when absent."
```

---

## Phase 2: Pure Logic Core

### Task 3: edit/staging.ts — basic push/list/clear

**Files:**
- Create: `src/edit/staging.ts`
- Test: `tests/edit/staging.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/edit/staging.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { createStaging } from '../../src/edit/staging'
import type { Modification } from '../../src/parsers/types'

function fakeMod(op: Modification['op'] = 'archive_walk', walkId = 'w1'): Omit<Modification, 'id' | 'at'> {
  return { op, walkId, payload: {} as Record<string, never> }
}

describe('createStaging', () => {
  it('starts empty', () => {
    // #when
    const s = createStaging()
    // #then
    expect(s.list()).toEqual([])
    expect(s.count()).toBe(0)
  })

  it('push assigns id + at and returns the stored mod', () => {
    // #when
    const s = createStaging()
    const stored = s.push(fakeMod('archive_walk', 'walk-1'))
    // #then
    expect(stored.id).toMatch(/^[0-9a-f-]+$/) // some uuid-ish string
    expect(typeof stored.at).toBe('number')
    expect(stored.op).toBe('archive_walk')
    expect(s.list()).toHaveLength(1)
    expect(s.count()).toBe(1)
  })

  it('clear empties the staging stack', () => {
    // #when
    const s = createStaging()
    s.push(fakeMod())
    s.push(fakeMod())
    s.clear()
    // #then
    expect(s.list()).toEqual([])
  })

  it('subscribe fires on push and clear', () => {
    // #when
    const s = createStaging()
    const listener = vi.fn()
    s.subscribe(listener)
    s.push(fakeMod())
    s.clear()
    // #then
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/edit/staging.test.ts`
Expected: FAIL — `createStaging` not found.

- [ ] **Step 3: Implement the minimal staging module**

Create `src/edit/staging.ts`:

```typescript
import type { Modification } from '../parsers/types'

export interface Staging {
  push(mod: Omit<Modification, 'id' | 'at'>): Modification
  undo(id: string): boolean
  clear(): void
  list(): Modification[]
  count(): number
  subscribe(listener: () => void): () => void  // returns unsubscribe
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  // fallback for older test envs
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function createStaging(): Staging {
  const mods: Modification[] = []
  const listeners = new Set<() => void>()

  function notify(): void {
    for (const l of listeners) l()
  }

  return {
    push(mod) {
      const stored: Modification = { ...mod, id: uuid(), at: Date.now() } as Modification
      mods.push(stored)
      notify()
      return stored
    },
    undo(id) {
      const idx = mods.findIndex(m => m.id === id)
      if (idx < 0) return false
      mods.splice(idx, 1)
      notify()
      return true
    },
    clear() {
      if (mods.length === 0) return
      mods.length = 0
      notify()
    },
    list() {
      return [...mods]
    },
    count() {
      return mods.length
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/edit/staging.test.ts`
Expected: PASS (all 4 cases).

- [ ] **Step 5: Commit**

```bash
git add src/edit/staging.ts tests/edit/staging.test.ts
git commit -m "feat(edit): staging module with push/undo/clear/subscribe"
```

---

### Task 4: edit/staging.ts — undo by id + coalescence

**Files:**
- Modify: `src/edit/staging.ts`
- Modify: `tests/edit/staging.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/edit/staging.test.ts`:

```typescript
describe('createStaging — undo by id', () => {
  it('undo removes only the targeted mod', () => {
    const s = createStaging()
    const m1 = s.push(fakeMod('archive_walk', 'w1'))
    const m2 = s.push(fakeMod('archive_walk', 'w2'))
    expect(s.undo(m1.id)).toBe(true)
    expect(s.list()).toHaveLength(1)
    expect(s.list()[0].id).toBe(m2.id)
  })

  it('undo returns false for unknown id', () => {
    const s = createStaging()
    expect(s.undo('does-not-exist')).toBe(false)
  })
})

describe('createStaging — coalescence', () => {
  it('trim_route_start replaces previous trim for same walk', () => {
    const s = createStaging()
    s.push({ op: 'trim_route_start', walkId: 'w1', payload: { meters: 100 } })
    s.push({ op: 'trim_route_start', walkId: 'w1', payload: { meters: 250 } })
    expect(s.list()).toHaveLength(1)
    expect((s.list()[0].payload as { meters: number }).meters).toBe(250)
  })

  it('trim_route_start does not coalesce across walks', () => {
    const s = createStaging()
    s.push({ op: 'trim_route_start', walkId: 'w1', payload: { meters: 100 } })
    s.push({ op: 'trim_route_start', walkId: 'w2', payload: { meters: 200 } })
    expect(s.list()).toHaveLength(2)
  })

  it('edit_intention coalesces per walk', () => {
    const s = createStaging()
    s.push({ op: 'edit_intention', walkId: 'w1', payload: { text: 'one' } })
    s.push({ op: 'edit_intention', walkId: 'w1', payload: { text: 'two' } })
    expect(s.list()).toHaveLength(1)
    expect((s.list()[0].payload as { text: string }).text).toBe('two')
  })

  it('edit_transcription coalesces per (walk, recordingStartDate)', () => {
    const s = createStaging()
    s.push({ op: 'edit_transcription', walkId: 'w1', payload: { recordingStartDate: 1000, text: 'a' } })
    s.push({ op: 'edit_transcription', walkId: 'w1', payload: { recordingStartDate: 2000, text: 'b' } })
    s.push({ op: 'edit_transcription', walkId: 'w1', payload: { recordingStartDate: 1000, text: 'a-revised' } })
    const list = s.list()
    expect(list).toHaveLength(2)
    const r1 = list.find(m => (m.payload as { recordingStartDate: number }).recordingStartDate === 1000)
    expect((r1!.payload as { text: string }).text).toBe('a-revised')
  })

  it('delete_photo does not coalesce — multiple deletes accumulate', () => {
    const s = createStaging()
    s.push({ op: 'delete_photo', walkId: 'w1', payload: { localIdentifier: 'p1' } })
    s.push({ op: 'delete_photo', walkId: 'w1', payload: { localIdentifier: 'p2' } })
    expect(s.list()).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/edit/staging.test.ts -t 'coalescence'`
Expected: FAIL — coalescence is not implemented yet.

- [ ] **Step 3: Implement coalescence in `push`**

Replace the `push` method in `src/edit/staging.ts`:

```typescript
    push(mod) {
      const key = coalesceKey(mod)
      if (key !== null) {
        const existingIdx = mods.findIndex(m => coalesceKey(m) === key)
        if (existingIdx >= 0) {
          const stored: Modification = { ...mod, id: mods[existingIdx].id, at: Date.now() } as Modification
          mods[existingIdx] = stored
          notify()
          return stored
        }
      }
      const stored: Modification = { ...mod, id: uuid(), at: Date.now() } as Modification
      mods.push(stored)
      notify()
      return stored
    },
```

Add this helper at module scope (above `createStaging`):

```typescript
function coalesceKey(mod: Pick<Modification, 'op' | 'walkId' | 'payload'>): string | null {
  switch (mod.op) {
    case 'trim_route_start':
    case 'trim_route_end':
    case 'edit_intention':
    case 'edit_reflection_text':
      return `${mod.op}|${mod.walkId ?? ''}`
    case 'edit_transcription': {
      const p = mod.payload as { recordingStartDate: number }
      return `${mod.op}|${mod.walkId ?? ''}|${p.recordingStartDate}`
    }
    default:
      return null
  }
}
```

- [ ] **Step 4: Run tests to verify both undo + coalescence pass**

Run: `npx vitest run tests/edit/staging.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/edit/staging.ts tests/edit/staging.test.ts
git commit -m "feat(edit): undo by id + coalescence rules in staging"
```

---

### Task 5: edit/recompute.ts — recompute walk stats

**Files:**
- Create: `src/edit/recompute.ts`
- Test: `tests/edit/recompute.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/edit/recompute.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { recomputeStats } from '../../src/edit/recompute'
import type { Walk, WalkStats, GeoJSONFeatureCollection, Activity } from '../../src/parsers/types'

function makeRoute(coords: number[][]): GeoJSONFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: {},
    }],
  }
}

function baseWalk(overrides: Partial<Walk> = {}): Walk {
  return {
    id: 'w1',
    startDate: new Date(1_000_000),  // ms
    endDate: new Date(1_600_000),    // 10 minutes later
    stats: {
      distance: 1000, activeDuration: 540, pauseDuration: 60,
      ascent: 50, descent: 50, steps: 1500, burnedEnergy: 100,
      talkDuration: 0, meditateDuration: 0,
    },
    route: makeRoute([
      [0, 0, 100],
      [0.001, 0, 105],   // ~111m east, +5m elevation
      [0.002, 0, 110],
    ]),
    voiceRecordings: [],
    activities: [],
    pauses: [],
    source: 'pilgrim',
    ...overrides,
  }
}

describe('recomputeStats', () => {
  it('recomputes distance from haversine over remaining route coords', () => {
    const walk = baseWalk()
    const stats = recomputeStats(walk, walk.stats)
    expect(stats.distance).toBeGreaterThan(200)
    expect(stats.distance).toBeLessThan(250)
  })

  it('recomputes ascent and descent from elevation deltas', () => {
    const walk = baseWalk({
      route: makeRoute([
        [0, 0, 100], [0.001, 0, 110], [0.002, 0, 120], [0.003, 0, 105],
      ]),
    })
    const stats = recomputeStats(walk, walk.stats)
    expect(stats.ascent).toBeCloseTo(20, 0)   // 10 + 10
    expect(stats.descent).toBeCloseTo(15, 0)  // 15
  })

  it('pauseDuration sums remaining pauses; activeDuration = total - pauseDuration', () => {
    const walk = baseWalk({
      pauses: [
        { startDate: new Date(1_100_000), endDate: new Date(1_160_000), type: 'manual' }, // 60s
        { startDate: new Date(1_300_000), endDate: new Date(1_330_000), type: 'auto' },   // 30s
      ],
    })
    const stats = recomputeStats(walk, walk.stats)
    expect(stats.pauseDuration).toBe(90)
    expect(stats.activeDuration).toBe(600 - 90) // (endDate - startDate) seconds = 600
  })

  it('talkDuration and meditateDuration sum activities by type', () => {
    const walk = baseWalk({
      activities: [
        { type: 'talk',     startDate: new Date(1_000_000), endDate: new Date(1_050_000) }, // 50s
        { type: 'meditate', startDate: new Date(1_100_000), endDate: new Date(1_300_000) }, // 200s
        { type: 'walk',     startDate: new Date(1_300_000), endDate: new Date(1_600_000) }, // ignored
      ] as Activity[],
    })
    const stats = recomputeStats(walk, walk.stats)
    expect(stats.talkDuration).toBe(50)
    expect(stats.meditateDuration).toBe(200)
  })

  it('scales steps and burnedEnergy proportionally to new distance', () => {
    const walk = baseWalk()
    const original: WalkStats = { ...walk.stats, distance: 500, steps: 1000, burnedEnergy: 200 }
    const stats = recomputeStats(walk, original)
    // walk.route is ~222m total, original.distance = 500 → ratio = 222/500 ≈ 0.444
    expect(stats.steps).toBeGreaterThan(440)
    expect(stats.steps).toBeLessThan(450)
    expect(stats.burnedEnergy).toBeGreaterThan(85)
    expect(stats.burnedEnergy).toBeLessThan(95)
  })

  it('preserves undefined steps/burnedEnergy when original was undefined', () => {
    const walk = baseWalk()
    const original: WalkStats = { ...walk.stats, steps: undefined, burnedEnergy: undefined }
    const stats = recomputeStats(walk, original)
    expect(stats.steps).toBeUndefined()
    expect(stats.burnedEnergy).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/edit/recompute.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `recomputeStats`**

Create `src/edit/recompute.ts`:

```typescript
import type { Walk, WalkStats, GeoJSONFeatureCollection } from '../parsers/types'
import { totalDistance, elevationGain } from '../parsers/geo'

function routeDistance(route: GeoJSONFeatureCollection): number {
  let sum = 0
  for (const f of route.features) {
    if (f.geometry.type !== 'LineString') continue
    sum += totalDistance(f.geometry.coordinates as number[][])
  }
  return sum
}

function routeElevation(route: GeoJSONFeatureCollection): { ascent: number; descent: number } {
  let ascent = 0
  let descent = 0
  for (const f of route.features) {
    if (f.geometry.type !== 'LineString') continue
    const coords = f.geometry.coordinates as number[][]
    const elevations = coords
      .map(c => c[2])
      .filter((e): e is number => typeof e === 'number')
    if (elevations.length < 2) continue
    const seg = elevationGain(elevations)
    ascent += seg.ascent
    descent += seg.descent
  }
  return { ascent, descent }
}

function sumDurationSeconds(items: { startDate: Date; endDate: Date }[]): number {
  let sum = 0
  for (const it of items) {
    sum += (it.endDate.getTime() - it.startDate.getTime()) / 1000
  }
  return Math.round(sum)
}

export function recomputeStats(walk: Walk, original: WalkStats): WalkStats {
  const totalSeconds = Math.round((walk.endDate.getTime() - walk.startDate.getTime()) / 1000)
  const distance = routeDistance(walk.route)
  const { ascent, descent } = routeElevation(walk.route)
  const pauseDuration = sumDurationSeconds(walk.pauses)
  const activeDuration = Math.max(0, totalSeconds - pauseDuration)
  const talkDuration = sumDurationSeconds(walk.activities.filter(a => a.type === 'talk'))
  const meditateDuration = sumDurationSeconds(walk.activities.filter(a => a.type === 'meditate'))

  const distRatio = original.distance > 0 ? distance / original.distance : 1
  const steps = original.steps !== undefined ? Math.round(original.steps * distRatio) : undefined
  const burnedEnergy = original.burnedEnergy !== undefined
    ? Math.round(original.burnedEnergy * distRatio)
    : undefined

  return {
    distance,
    activeDuration,
    pauseDuration,
    ascent,
    descent,
    steps,
    burnedEnergy,
    talkDuration,
    meditateDuration,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/edit/recompute.test.ts`
Expected: PASS (all 6 cases).

- [ ] **Step 5: Commit**

```bash
git add src/edit/recompute.ts tests/edit/recompute.test.ts
git commit -m "feat(edit): recomputeStats — distance, elevation, durations, scaled fields"
```

---

### Task 6: edit/archive.ts — Walk → ArchivedWalk

**Files:**
- Create: `src/edit/archive.ts`
- Test: `tests/edit/archive.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/edit/archive.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { walkToArchived } from '../../src/edit/archive'
import type { Walk } from '../../src/parsers/types'

function makeWalk(): Walk {
  return {
    id: 'walk-id-1',
    startDate: new Date(1_700_000_000_000),  // ms
    endDate:   new Date(1_700_000_600_000),  // +600s
    stats: {
      distance: 5432.1, activeDuration: 540, pauseDuration: 60,
      ascent: 45.2, descent: 38.1, steps: 7200, burnedEnergy: 320,
      talkDuration: 180, meditateDuration: 300,
    },
    route: { type: 'FeatureCollection', features: [] },
    voiceRecordings: [], activities: [], pauses: [],
    source: 'pilgrim',
    intention: 'walk with gratitude',
    favicon: 'flame',
  }
}

describe('walkToArchived', () => {
  it('keeps only skeletal fields; drops route, intention, favicon, etc.', () => {
    const archivedAt = 1_745_000_000  // epoch seconds
    const archived = walkToArchived(makeWalk(), archivedAt)

    expect(archived.id).toBe('walk-id-1')
    expect(archived.archivedAt).toBe(archivedAt)
    expect(archived.startDate).toBe(1_700_000_000)  // seconds
    expect(archived.endDate).toBe(1_700_000_600)
    expect(archived.stats.distance).toBe(5432.1)
    expect(archived.stats.activeDuration).toBe(540)
    expect(archived.stats.talkDuration).toBe(180)
    expect(archived.stats.meditateDuration).toBe(300)
    expect(archived.stats.steps).toBe(7200)

    // Skeletal — not present:
    expect((archived as unknown as Record<string, unknown>).route).toBeUndefined()
    expect((archived as unknown as Record<string, unknown>).intention).toBeUndefined()
    expect((archived as unknown as Record<string, unknown>).favicon).toBeUndefined()
    expect((archived.stats as unknown as Record<string, unknown>).ascent).toBeUndefined()
    expect((archived.stats as unknown as Record<string, unknown>).burnedEnergy).toBeUndefined()
  })

  it('omits steps if walk had no steps', () => {
    const walk = makeWalk()
    walk.stats.steps = undefined
    const archived = walkToArchived(walk, 1)
    expect(archived.stats.steps).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/edit/archive.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `walkToArchived`**

Create `src/edit/archive.ts`:

```typescript
import type { Walk, ArchivedWalk } from '../parsers/types'

export function walkToArchived(walk: Walk, archivedAtSeconds: number): ArchivedWalk {
  const archived: ArchivedWalk = {
    id: walk.id,
    startDate: Math.floor(walk.startDate.getTime() / 1000),
    endDate: Math.floor(walk.endDate.getTime() / 1000),
    archivedAt: archivedAtSeconds,
    stats: {
      distance: walk.stats.distance,
      activeDuration: walk.stats.activeDuration,
      talkDuration: walk.stats.talkDuration,
      meditateDuration: walk.stats.meditateDuration,
    },
  }
  if (walk.stats.steps !== undefined) {
    archived.stats.steps = walk.stats.steps
  }
  return archived
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/edit/archive.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/edit/archive.ts tests/edit/archive.test.ts
git commit -m "feat(edit): walkToArchived — Walk → skeletal ArchivedWalk"
```

---

### Task 7: New trim utility for separate start/end values

**Files:**
- Modify: `src/parsers/route-trim.ts`
- Test: `tests/edit/trim-route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/edit/trim-route.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { trimRouteSeparately } from '../../src/parsers/route-trim'
import type { GeoJSONFeatureCollection } from '../../src/parsers/types'

function lineRoute(coords: number[][]): GeoJSONFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: { timestamps: coords.map((_, i) => i * 1000) },
    }],
  }
}

describe('trimRouteSeparately', () => {
  it('returns original route when both meters are 0', () => {
    const route = lineRoute([[0, 0], [0.001, 0], [0.002, 0]])
    const out = trimRouteSeparately(route, { startMeters: 0, endMeters: 0 })
    expect(out.features[0].geometry.coordinates).toEqual([[0, 0], [0.001, 0], [0.002, 0]])
  })

  it('trims from start by accumulating meters', () => {
    // Three points roughly 111m apart along latitude 0
    const route = lineRoute([[0, 0], [0.001, 0], [0.002, 0], [0.003, 0]])
    const out = trimRouteSeparately(route, { startMeters: 50, endMeters: 0 })
    // Should drop first segment (~111m > 50m), leaving 3 points
    expect(out.features[0].geometry.coordinates).toHaveLength(3)
    expect(out.features[0].geometry.coordinates[0]).toEqual([0.001, 0])
  })

  it('trims from end', () => {
    const route = lineRoute([[0, 0], [0.001, 0], [0.002, 0], [0.003, 0]])
    const out = trimRouteSeparately(route, { startMeters: 0, endMeters: 50 })
    expect(out.features[0].geometry.coordinates).toHaveLength(3)
    expect(out.features[0].geometry.coordinates[2]).toEqual([0.002, 0])
  })

  it('trims from both ends in one call', () => {
    const route = lineRoute([[0, 0], [0.001, 0], [0.002, 0], [0.003, 0], [0.004, 0]])
    const out = trimRouteSeparately(route, { startMeters: 50, endMeters: 50 })
    expect(out.features[0].geometry.coordinates).toHaveLength(3)
  })

  it('leaves at least 2 coords when over-trimmed', () => {
    const route = lineRoute([[0, 0], [0.001, 0], [0.002, 0]])
    const out = trimRouteSeparately(route, { startMeters: 999_999, endMeters: 0 })
    expect(out.features[0].geometry.coordinates.length).toBeGreaterThanOrEqual(2)
  })

  it('preserves timestamps aligned with surviving coords', () => {
    const route = lineRoute([[0, 0], [0.001, 0], [0.002, 0], [0.003, 0]])
    const out = trimRouteSeparately(route, { startMeters: 50, endMeters: 0 })
    // After dropping first coord, timestamps should be [1000, 2000, 3000]
    expect(out.features[0].properties.timestamps).toEqual([1000, 2000, 3000])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/edit/trim-route.test.ts`
Expected: FAIL — `trimRouteSeparately` not exported.

- [ ] **Step 3: Implement `trimRouteSeparately`**

Append to `src/parsers/route-trim.ts`:

```typescript
export function trimRouteSeparately(
  route: GeoJSONFeatureCollection,
  opts: { startMeters: number; endMeters: number },
): GeoJSONFeatureCollection {
  const { startMeters, endMeters } = opts
  if (startMeters <= 0 && endMeters <= 0) return route

  return {
    ...route,
    features: route.features.map((feature) => {
      if (feature.geometry.type !== 'LineString') return feature

      const coords = feature.geometry.coordinates as number[][]
      if (coords.length < 3) return feature

      // End-trim first, then start-trim — keeps the surviving slice
      // simple to reason about (always coords[startIdx ... endIdx]).
      let endIdx = coords.length
      if (endMeters > 0) {
        let acc = 0
        for (let i = coords.length - 1; i > 0; i--) {
          acc += haversineDistance(coords[i][1], coords[i][0], coords[i - 1][1], coords[i - 1][0])
          if (acc >= endMeters) { endIdx = i; break }
          if (i === 1) endIdx = 1
        }
      }

      let startIdx = 0
      if (startMeters > 0) {
        let acc = 0
        for (let i = 1; i < endIdx; i++) {
          acc += haversineDistance(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0])
          if (acc >= startMeters) { startIdx = i; break }
        }
      }

      // Clamp so we keep at least 2 coords.
      if (endIdx - startIdx < 2) {
        const clampedEnd = Math.min(coords.length, startIdx + 2)
        endIdx = clampedEnd
        if (endIdx - startIdx < 2) {
          startIdx = Math.max(0, endIdx - 2)
        }
      }

      const trimmedCoords = coords.slice(startIdx, endIdx)
      const timestamps = feature.properties.timestamps

      return {
        ...feature,
        geometry: { ...feature.geometry, coordinates: trimmedCoords },
        properties: {
          ...feature.properties,
          timestamps: timestamps ? timestamps.slice(startIdx, endIdx) : undefined,
        },
      }
    }),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/edit/trim-route.test.ts`
Expected: PASS (all 6 cases).

- [ ] **Step 5: Confirm pre-existing tests still pass**

Run: `npx vitest run tests/parsers/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/parsers/route-trim.ts tests/edit/trim-route.test.ts
git commit -m "feat(parsers): trimRouteSeparately for per-walk start/end trim"
```

---

### Task 8: edit/applier.ts — text edits + section deletes

**Files:**
- Create: `src/edit/applier.ts`
- Test: `tests/edit/applier.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/edit/applier.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { applyMods } from '../../src/edit/applier'
import type { Walk, Modification } from '../../src/parsers/types'

function makeWalk(): Walk {
  return {
    id: 'w1',
    startDate: new Date(1_000_000),
    endDate: new Date(1_600_000),
    stats: {
      distance: 1000, activeDuration: 540, pauseDuration: 60,
      ascent: 50, descent: 50, steps: 1000, burnedEnergy: 100,
      talkDuration: 0, meditateDuration: 0,
    },
    route: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[0, 0], [0.001, 0], [0.002, 0]] },
        properties: { timestamps: [1000, 2000, 3000] },
      }],
    },
    voiceRecordings: [],
    activities: [],
    pauses: [],
    source: 'pilgrim',
    intention: 'walk slowly',
    reflection: { style: 'gratitude', text: 'good walk' },
    weather: { temperature: 20, condition: 'clear' },
  }
}

function mkMod(op: Modification['op'], payload: unknown, walkId = 'w1'): Modification {
  return { id: `m-${Math.random()}`, at: Date.now(), op, walkId, payload: payload as Modification['payload'] }
}

describe('applyMods — text edits', () => {
  it('edit_intention replaces intention', () => {
    const out = applyMods(makeWalk(), [mkMod('edit_intention', { text: 'rewritten' })])
    expect(out!.intention).toBe('rewritten')
    expect(out!.isUserModified).toBe(true)
  })

  it('edit_reflection_text replaces reflection.text and preserves style', () => {
    const out = applyMods(makeWalk(), [mkMod('edit_reflection_text', { text: 'fixed typo' })])
    expect(out!.reflection!.text).toBe('fixed typo')
    expect(out!.reflection!.style).toBe('gratitude')
  })
})

describe('applyMods — section deletes', () => {
  it('delete_section intention removes the field', () => {
    const out = applyMods(makeWalk(), [mkMod('delete_section', { section: 'intention' })])
    expect(out!.intention).toBeUndefined()
  })

  it('delete_section weather removes the field', () => {
    const out = applyMods(makeWalk(), [mkMod('delete_section', { section: 'weather' })])
    expect(out!.weather).toBeUndefined()
  })

  it('delete_section reflection removes the whole reflection object', () => {
    const out = applyMods(makeWalk(), [mkMod('delete_section', { section: 'reflection' })])
    expect(out!.reflection).toBeUndefined()
  })
})

describe('applyMods — archive_walk', () => {
  it('returns null when archive_walk is present', () => {
    const out = applyMods(makeWalk(), [mkMod('archive_walk', {})])
    expect(out).toBeNull()
  })
})

describe('applyMods — empty mods', () => {
  it('returns the original walk when no mods apply', () => {
    const walk = makeWalk()
    const out = applyMods(walk, [])
    expect(out).toEqual(walk)
    expect(out!.isUserModified).not.toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/edit/applier.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `applyMods` (minimal: text edits + section deletes + archive)**

Create `src/edit/applier.ts`:

```typescript
import type { Walk, Modification, DeletableSection } from '../parsers/types'
import { recomputeStats } from './recompute'

export function applyMods(walk: Walk, mods: Modification[]): Walk | null {
  if (mods.length === 0) return walk
  if (mods.some(m => m.op === 'archive_walk')) return null

  const replace = mods.find(m => m.op === 'replace_walk')
  if (replace) {
    // Caller wires raw → Walk through the parser; for now treat as opaque pass-through.
    return (replace.payload as { walk: Walk }).walk
  }

  let next: Walk = { ...walk }
  let changed = false

  // Text edits
  for (const m of mods) {
    if (m.op === 'edit_intention') {
      next = { ...next, intention: (m.payload as { text: string }).text }
      changed = true
    } else if (m.op === 'edit_reflection_text') {
      const reflection = next.reflection ? { ...next.reflection } : {}
      reflection.text = (m.payload as { text: string }).text
      next = { ...next, reflection }
      changed = true
    }
    // edit_transcription handled in Task 9 (list-item filter pass)
  }

  // Section deletes
  const sectionDeletes = new Set<DeletableSection>()
  for (const m of mods) {
    if (m.op === 'delete_section') {
      sectionDeletes.add((m.payload as { section: DeletableSection }).section)
    }
  }
  if (sectionDeletes.size > 0) {
    if (sectionDeletes.has('intention')) next = { ...next, intention: undefined }
    if (sectionDeletes.has('reflection')) next = { ...next, reflection: undefined }
    if (sectionDeletes.has('weather')) next = { ...next, weather: undefined }
    if (sectionDeletes.has('celestial')) next = { ...next, celestial: undefined }
    changed = true
  }

  if (changed) {
    next = { ...next, isUserModified: true, stats: recomputeStats(next, walk.stats) }
  }

  return next
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/edit/applier.test.ts`
Expected: PASS (all 6 cases).

- [ ] **Step 5: Commit**

```bash
git add src/edit/applier.ts tests/edit/applier.test.ts
git commit -m "feat(edit): applier — text edits, section deletes, archive_walk"
```

---

### Task 9: applier — list-item deletes (photos, voice, pauses, activities) + edit_transcription

**Files:**
- Modify: `src/edit/applier.ts`
- Modify: `tests/edit/applier.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/edit/applier.test.ts`:

```typescript
import type { WalkPhoto, VoiceRecording, Pause, Activity } from '../../src/parsers/types'

function walkWithLists(): Walk {
  const w = makeWalk()
  w.photos = [
    { localIdentifier: 'p1', capturedAt: new Date(1_100_000), lat: 0, lng: 0, url: 'blob:1' },
    { localIdentifier: 'p2', capturedAt: new Date(1_200_000), lat: 0, lng: 0, url: 'blob:2' },
  ] as WalkPhoto[]
  w.voiceRecordings = [
    { startDate: new Date(1_100_000), endDate: new Date(1_120_000), duration: 20, transcription: 'hello' },
    { startDate: new Date(1_300_000), endDate: new Date(1_320_000), duration: 20, transcription: 'world' },
  ] as VoiceRecording[]
  w.pauses = [
    { startDate: new Date(1_400_000), endDate: new Date(1_460_000), type: 'manual' },
  ] as Pause[]
  w.activities = [
    { type: 'meditate', startDate: new Date(1_100_000), endDate: new Date(1_300_000) },
    { type: 'talk', startDate: new Date(1_300_000), endDate: new Date(1_320_000) },
  ] as Activity[]
  return w
}

describe('applyMods — list-item deletes', () => {
  it('delete_photo removes by localIdentifier', () => {
    const out = applyMods(walkWithLists(), [mkMod('delete_photo', { localIdentifier: 'p1' })])
    expect(out!.photos).toHaveLength(1)
    expect(out!.photos![0].localIdentifier).toBe('p2')
  })

  it('delete_voice_recording removes by epoch-seconds startDate', () => {
    const startSec = Math.floor(1_100_000 / 1000)  // 1100
    const out = applyMods(walkWithLists(), [mkMod('delete_voice_recording', { startDate: startSec })])
    expect(out!.voiceRecordings).toHaveLength(1)
    expect(out!.voiceRecordings[0].transcription).toBe('world')
  })

  it('delete_pause removes by epoch-seconds startDate', () => {
    const startSec = Math.floor(1_400_000 / 1000)  // 1400
    const out = applyMods(walkWithLists(), [mkMod('delete_pause', { startDate: startSec })])
    expect(out!.pauses).toHaveLength(0)
  })

  it('delete_activity removes by epoch-seconds startDate', () => {
    const startSec = Math.floor(1_100_000 / 1000)
    const out = applyMods(walkWithLists(), [mkMod('delete_activity', { startDate: startSec })])
    expect(out!.activities).toHaveLength(1)
    expect(out!.activities[0].type).toBe('talk')
  })

  it('multiple deletes are order-independent', () => {
    const w = walkWithLists()
    const a = applyMods(w, [
      mkMod('delete_photo', { localIdentifier: 'p1' }),
      mkMod('delete_photo', { localIdentifier: 'p2' }),
    ])
    const b = applyMods(w, [
      mkMod('delete_photo', { localIdentifier: 'p2' }),
      mkMod('delete_photo', { localIdentifier: 'p1' }),
    ])
    expect(a!.photos).toEqual(b!.photos)
    expect(a!.photos).toBeUndefined()
  })
})

describe('applyMods — edit_transcription', () => {
  it('replaces transcription text on the matching recording, preserves others', () => {
    const startSec = Math.floor(1_100_000 / 1000)
    const out = applyMods(walkWithLists(), [
      mkMod('edit_transcription', { recordingStartDate: startSec, text: 'corrected' }),
    ])
    expect(out!.voiceRecordings[0].transcription).toBe('corrected')
    expect(out!.voiceRecordings[1].transcription).toBe('world')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/edit/applier.test.ts -t 'list-item deletes|edit_transcription'`
Expected: FAIL — list-item deletes and transcription editing not implemented.

- [ ] **Step 3: Extend `applyMods` to handle list-item deletes and edit_transcription**

In `src/edit/applier.ts`, add these helpers above `applyMods`:

```typescript
function dateToEpochSeconds(d: Date): number {
  return Math.floor(d.getTime() / 1000)
}

function collectDeletes(mods: Modification[], op: Modification['op']): Set<number | string> {
  const keys = new Set<number | string>()
  for (const m of mods) {
    if (m.op !== op) continue
    if (op === 'delete_photo') {
      keys.add((m.payload as { localIdentifier: string }).localIdentifier)
    } else {
      keys.add((m.payload as { startDate: number }).startDate)
    }
  }
  return keys
}
```

Then, inside `applyMods`, after the section-deletes block but BEFORE the `recomputeStats` call, add:

```typescript
  // List-item deletes
  const photoDeletes = collectDeletes(mods, 'delete_photo')
  const recDeletes = collectDeletes(mods, 'delete_voice_recording')
  const pauseDeletes = collectDeletes(mods, 'delete_pause')
  const activityDeletes = collectDeletes(mods, 'delete_activity')

  if (photoDeletes.size > 0 && next.photos) {
    const remaining = next.photos.filter(p => !photoDeletes.has(p.localIdentifier))
    next = { ...next, photos: remaining.length > 0 ? remaining : undefined }
    changed = true
  }
  if (recDeletes.size > 0) {
    next = {
      ...next,
      voiceRecordings: next.voiceRecordings.filter(r => !recDeletes.has(dateToEpochSeconds(r.startDate))),
    }
    changed = true
  }
  if (pauseDeletes.size > 0) {
    next = {
      ...next,
      pauses: next.pauses.filter(p => !pauseDeletes.has(dateToEpochSeconds(p.startDate))),
    }
    changed = true
  }
  if (activityDeletes.size > 0) {
    next = {
      ...next,
      activities: next.activities.filter(a => !activityDeletes.has(dateToEpochSeconds(a.startDate))),
    }
    changed = true
  }

  // edit_transcription — replace text on matching recordings
  for (const m of mods) {
    if (m.op !== 'edit_transcription') continue
    const p = m.payload as { recordingStartDate: number; text: string }
    next = {
      ...next,
      voiceRecordings: next.voiceRecordings.map(r =>
        dateToEpochSeconds(r.startDate) === p.recordingStartDate
          ? { ...r, transcription: p.text }
          : r,
      ),
    }
    changed = true
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/edit/applier.test.ts`
Expected: PASS (all cases including new ones).

- [ ] **Step 5: Commit**

```bash
git add src/edit/applier.ts tests/edit/applier.test.ts
git commit -m "feat(edit): applier handles list-item deletes + edit_transcription"
```

---

### Task 10: applier — route trim integration

**Files:**
- Modify: `src/edit/applier.ts`
- Modify: `tests/edit/applier.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/edit/applier.test.ts`:

```typescript
describe('applyMods — route trim', () => {
  it('applies trim_route_start to walk.route', () => {
    const w = makeWalk()
    // route is [[0,0],[0.001,0],[0.002,0]] — ~111m segments
    const out = applyMods(w, [
      mkMod('trim_route_start', { meters: 50 }),
    ])
    expect(out!.route.features[0].geometry.coordinates).toHaveLength(2)
  })

  it('trims both ends when both mods present', () => {
    const w = makeWalk()
    w.route = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[0, 0], [0.001, 0], [0.002, 0], [0.003, 0], [0.004, 0]] },
        properties: { timestamps: [1000, 2000, 3000, 4000, 5000] },
      }],
    }
    const out = applyMods(w, [
      mkMod('trim_route_start', { meters: 50 }),
      mkMod('trim_route_end', { meters: 50 }),
    ])
    expect(out!.route.features[0].geometry.coordinates).toHaveLength(3)
  })

  it('recomputes stats.distance from the trimmed route', () => {
    const w = makeWalk()
    const before = w.stats.distance
    const out = applyMods(w, [mkMod('trim_route_start', { meters: 80 })])
    expect(out!.stats.distance).toBeLessThan(before)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/edit/applier.test.ts -t 'route trim'`
Expected: FAIL — trim mods not applied yet.

- [ ] **Step 3: Wire `trim_route_*` mods into the applier**

At the top of `src/edit/applier.ts`, add the import:

```typescript
import { trimRouteSeparately } from '../parsers/route-trim'
```

In `applyMods`, after the list-item deletes block, BEFORE the `recomputeStats` call, add:

```typescript
  // Route trim — last value wins (coalescence guarantees one mod per op per walk).
  let startMeters = 0
  let endMeters = 0
  for (const m of mods) {
    if (m.op === 'trim_route_start') startMeters = (m.payload as { meters: number }).meters
    if (m.op === 'trim_route_end') endMeters = (m.payload as { meters: number }).meters
  }
  if (startMeters > 0 || endMeters > 0) {
    next = { ...next, route: trimRouteSeparately(next.route, { startMeters, endMeters }) }
    changed = true
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/edit/applier.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/edit/applier.ts tests/edit/applier.test.ts
git commit -m "feat(edit): applier integrates route trim mods + stat recompute"
```

---

## Phase 3: Save Path

### Task 11: edit/save.ts — pure pilgrim file serialization

**Files:**
- Create: `src/edit/save.ts`
- Test: `tests/edit/save.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/edit/save.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { serializeTendedPilgrim } from '../../src/edit/save'
import type { Modification, PilgrimManifest } from '../../src/parsers/types'

async function makeMinimalPilgrimZip(): Promise<{ buf: ArrayBuffer; manifest: PilgrimManifest; rawWalks: unknown[] }> {
  const manifest: PilgrimManifest = {
    schemaVersion: '1.0',
    exportDate: 1745000000,
    appVersion: '1.0.0',
    walkCount: 2,
    preferences: { distanceUnit: 'km', altitudeUnit: 'm', speedUnit: 'min/km', energyUnit: 'kcal' },
    archived: [],
    modifications: [],
    archivedCount: 0,
  }
  const walkA = {
    schemaVersion: '1.0', id: 'walk-a', type: 'walking',
    startDate: 1700000000, endDate: 1700000600,
    stats: { distance: 1000, activeDuration: 540, pauseDuration: 60, ascent: 50, descent: 50,
             talkDuration: 0, meditateDuration: 0, steps: 1500 },
    route: { type: 'FeatureCollection', features: [{ type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[0,0,100],[0.001,0,105],[0.002,0,110]] },
      properties: { timestamps: [1700000000, 1700000300, 1700000600] } }] },
    pauses: [], activities: [], voiceRecordings: [],
    intention: 'walk a',
  }
  const walkB = { ...walkA, id: 'walk-b', intention: 'walk b' }
  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify(manifest))
  zip.file('walks/walk-a.json', JSON.stringify(walkA))
  zip.file('walks/walk-b.json', JSON.stringify(walkB))
  const buf = await zip.generateAsync({ type: 'arraybuffer' })
  return { buf, manifest, rawWalks: [walkA, walkB] }
}

function mkMod(op: Modification['op'], payload: unknown, walkId?: string): Modification {
  return { id: `m-${Math.random()}`, at: Date.now(), op, walkId, payload: payload as Modification['payload'] }
}

describe('serializeTendedPilgrim', () => {
  it('archives a walk: removes file from walks/, appends skeletal record to manifest.archived', async () => {
    const { buf, manifest, rawWalks } = await makeMinimalPilgrimZip()
    const result = await serializeTendedPilgrim({
      originalBuffer: buf,
      manifest,
      rawWalks,
      modifications: [mkMod('archive_walk', {}, 'walk-a')],
      includeHistory: true,
      originalFilename: 'sample.pilgrim',
    })

    const reZip = await JSZip.loadAsync(result.blob)
    const newManifest = JSON.parse(await reZip.file('manifest.json')!.async('text'))

    expect(reZip.file('walks/walk-a.json')).toBeNull()
    expect(reZip.file('walks/walk-b.json')).not.toBeNull()
    expect(newManifest.walkCount).toBe(1)
    expect(newManifest.archivedCount).toBe(1)
    expect(newManifest.archived).toHaveLength(1)
    expect(newManifest.archived[0].id).toBe('walk-a')
    expect(newManifest.archived[0].stats.distance).toBe(1000)
    expect(newManifest.archived[0].stats.activeDuration).toBe(540)
    expect(newManifest.modifications.length).toBeGreaterThan(0)
    expect(result.filename).toBe('sample-tended.pilgrim')
    expect(newManifest.schemaVersion).toBe('1.0')
  })

  it('edit_intention rewrites the walk JSON in place', async () => {
    const { buf, manifest, rawWalks } = await makeMinimalPilgrimZip()
    const result = await serializeTendedPilgrim({
      originalBuffer: buf,
      manifest,
      rawWalks,
      modifications: [mkMod('edit_intention', { text: 'rewritten' }, 'walk-a')],
      includeHistory: true,
      originalFilename: 'sample.pilgrim',
    })

    const reZip = await JSZip.loadAsync(result.blob)
    const updated = JSON.parse(await reZip.file('walks/walk-a.json')!.async('text'))
    expect(updated.intention).toBe('rewritten')
    expect(updated.isUserModified).toBe(true)
  })

  it('history toggle off strips both old and new modifications', async () => {
    const seed = await makeMinimalPilgrimZip()
    const seedManifest: PilgrimManifest = {
      ...seed.manifest,
      modifications: [{ id: 'old', at: 1, op: 'archive_walk', walkId: 'walk-x', payload: {} }],
    }
    const zip = new JSZip()
    zip.file('manifest.json', JSON.stringify(seedManifest))
    zip.file('walks/walk-a.json', JSON.stringify(seed.rawWalks[0]))
    zip.file('walks/walk-b.json', JSON.stringify(seed.rawWalks[1]))
    const buf = await zip.generateAsync({ type: 'arraybuffer' })

    const result = await serializeTendedPilgrim({
      originalBuffer: buf,
      manifest: seedManifest,
      rawWalks: seed.rawWalks,
      modifications: [mkMod('edit_intention', { text: 'x' }, 'walk-a')],
      includeHistory: false,
      originalFilename: 'sample.pilgrim',
    })

    const reZip = await JSZip.loadAsync(result.blob)
    const newManifest = JSON.parse(await reZip.file('manifest.json')!.async('text'))
    expect(newManifest.modifications).toEqual([])
  })

  it('keeps -tended suffix from already-tended files (no -tended-tended)', async () => {
    const { buf, manifest, rawWalks } = await makeMinimalPilgrimZip()
    const result = await serializeTendedPilgrim({
      originalBuffer: buf,
      manifest,
      rawWalks,
      modifications: [],
      includeHistory: true,
      originalFilename: 'sample-tended.pilgrim',
    })
    expect(result.filename).toBe('sample-tended.pilgrim')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/edit/save.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `serializeTendedPilgrim`**

Create `src/edit/save.ts`:

```typescript
import JSZip from 'jszip'
import type { Modification, PilgrimManifest, ArchivedWalk } from '../parsers/types'
import { walkToArchived } from './archive'
import { applyMods } from './applier'
import { parsePilgrimWalkJSON } from '../parsers/pilgrim'

export interface SerializeInput {
  originalBuffer: ArrayBuffer
  manifest: PilgrimManifest
  rawWalks: unknown[]
  modifications: Modification[]
  includeHistory: boolean
  originalFilename: string
}

export interface SerializeOutput {
  blob: Blob
  filename: string
}

function tendedFilename(original: string): string {
  const dot = original.lastIndexOf('.')
  const stem = dot >= 0 ? original.slice(0, dot) : original
  const ext = dot >= 0 ? original.slice(dot) : ''
  if (stem.endsWith('-tended')) return original
  return `${stem}-tended${ext}`
}

function modsForWalk(mods: Modification[], walkId: string): Modification[] {
  return mods.filter(m => m.walkId === walkId)
}

function modsArchivingWalk(mods: Modification[]): Set<string> {
  const ids = new Set<string>()
  for (const m of mods) if (m.op === 'archive_walk' && m.walkId) ids.add(m.walkId)
  return ids
}

function rawIdOf(rawWalk: unknown): string | undefined {
  if (rawWalk && typeof rawWalk === 'object' && 'id' in rawWalk) {
    return String((rawWalk as Record<string, unknown>).id)
  }
  return undefined
}

function applyEditsToRawWalk(raw: unknown, walkMods: Modification[]): unknown {
  const obj = { ...(raw as Record<string, unknown>) }
  let changed = false

  for (const m of walkMods) {
    if (m.op === 'edit_intention') {
      obj.intention = (m.payload as { text: string }).text
      changed = true
    } else if (m.op === 'edit_reflection_text') {
      const reflection = obj.reflection ? { ...(obj.reflection as Record<string, unknown>) } : {}
      reflection.text = (m.payload as { text: string }).text
      obj.reflection = reflection
      changed = true
    } else if (m.op === 'delete_section') {
      const section = (m.payload as { section: string }).section
      if (section === 'intention') { delete obj.intention; changed = true }
      else if (section === 'reflection') { delete obj.reflection; changed = true }
      else if (section === 'weather') { delete obj.weather; changed = true }
      else if (section === 'celestial') {
        const reflection = obj.reflection as Record<string, unknown> | undefined
        if (reflection) {
          delete reflection.celestialContext
          obj.reflection = reflection
        }
        changed = true
      }
    } else if (m.op === 'edit_transcription') {
      const p = m.payload as { recordingStartDate: number; text: string }
      const recs = (obj.voiceRecordings as Record<string, unknown>[] | undefined) ?? []
      obj.voiceRecordings = recs.map(r => {
        const sd = typeof r.startDate === 'number' ? r.startDate : new Date(r.startDate as string).getTime() / 1000
        return Math.floor(sd) === p.recordingStartDate ? { ...r, transcription: p.text } : r
      })
      changed = true
    } else if (m.op === 'delete_photo') {
      const id = (m.payload as { localIdentifier: string }).localIdentifier
      const photos = (obj.photos as Record<string, unknown>[] | undefined) ?? []
      obj.photos = photos.filter(p => p.localIdentifier !== id)
      changed = true
    } else if (m.op === 'delete_voice_recording' || m.op === 'delete_pause' || m.op === 'delete_activity') {
      const sd = (m.payload as { startDate: number }).startDate
      const key = m.op === 'delete_voice_recording' ? 'voiceRecordings'
                : m.op === 'delete_pause' ? 'pauses' : 'activities'
      const list = (obj[key] as Record<string, unknown>[] | undefined) ?? []
      obj[key] = list.filter(item => {
        const itemSd = typeof item.startDate === 'number' ? item.startDate : new Date(item.startDate as string).getTime() / 1000
        return Math.floor(itemSd) !== sd
      })
      changed = true
    } else if (m.op === 'replace_walk') {
      // Whole-walk JSON replacement (JSON expert mode).
      Object.keys(obj).forEach(k => delete obj[k])
      Object.assign(obj, (m.payload as { walk: Record<string, unknown> }).walk)
      changed = true
      return obj
    }
    // trim_route_* are handled separately via the parsed-Walk path below.
  }

  if (changed) obj.isUserModified = true
  return obj
}

function deletedPhotoFilenames(rawWalk: unknown, walkMods: Modification[]): string[] {
  const ids = new Set<string>()
  for (const m of walkMods) {
    if (m.op === 'delete_photo') ids.add((m.payload as { localIdentifier: string }).localIdentifier)
  }
  if (ids.size === 0) return []
  const filenames: string[] = []
  const photos = ((rawWalk as Record<string, unknown>).photos as Record<string, unknown>[] | undefined) ?? []
  for (const p of photos) {
    if (typeof p.localIdentifier === 'string' && ids.has(p.localIdentifier)) {
      const fn = p.embeddedPhotoFilename
      if (typeof fn === 'string' && fn.length > 0) filenames.push(fn)
    }
  }
  return filenames
}

export async function serializeTendedPilgrim(input: SerializeInput): Promise<SerializeOutput> {
  const { originalBuffer, manifest, rawWalks, modifications, includeHistory, originalFilename } = input

  const zip = await JSZip.loadAsync(originalBuffer)
  const archivedIds = modsArchivingWalk(modifications)
  const newArchived: ArchivedWalk[] = [...(manifest.archived ?? [])]
  const archivedAt = Math.floor(Date.now() / 1000)

  let activeCount = 0
  for (const rawWalk of rawWalks) {
    const id = rawIdOf(rawWalk)
    if (!id) continue
    const walkMods = modsForWalk(modifications, id)

    if (archivedIds.has(id)) {
      const parsed = parsePilgrimWalkJSON(rawWalk)
      newArchived.push(walkToArchived(parsed, archivedAt))
      zip.remove(`walks/${id}.json`)

      const photos = ((rawWalk as Record<string, unknown>).photos as Record<string, unknown>[] | undefined) ?? []
      for (const p of photos) {
        const fn = p.embeddedPhotoFilename
        if (typeof fn === 'string' && fn.length > 0) zip.remove(`photos/${fn}`)
      }
      continue
    }

    activeCount += 1

    if (walkMods.length === 0) continue

    let editedRaw = applyEditsToRawWalk(rawWalk, walkMods)

    const hasTrim = walkMods.some(m => m.op === 'trim_route_start' || m.op === 'trim_route_end')
    const hasNonTextChange = walkMods.some(m =>
      m.op === 'delete_photo' || m.op === 'delete_voice_recording' ||
      m.op === 'delete_pause' || m.op === 'delete_activity' ||
      m.op === 'delete_section' || m.op === 'edit_transcription' ||
      m.op === 'replace_walk')

    if (hasTrim || hasNonTextChange) {
      const reParsed = parsePilgrimWalkJSON(editedRaw)
      const tendedWalk = applyMods(reParsed, walkMods)
      if (tendedWalk) {
        const editedObj = editedRaw as Record<string, unknown>
        editedObj.stats = {
          distance: tendedWalk.stats.distance,
          activeDuration: tendedWalk.stats.activeDuration,
          pauseDuration: tendedWalk.stats.pauseDuration,
          ascent: tendedWalk.stats.ascent,
          descent: tendedWalk.stats.descent,
          steps: tendedWalk.stats.steps,
          burnedEnergy: tendedWalk.stats.burnedEnergy,
          talkDuration: tendedWalk.stats.talkDuration,
          meditateDuration: tendedWalk.stats.meditateDuration,
        }
        if (hasTrim) {
          // Convert route timestamps back to seconds for the file format.
          const routeFeatures = tendedWalk.route.features.map(f => ({
            ...f,
            properties: {
              ...f.properties,
              timestamps: f.properties.timestamps?.map(t => Math.floor(t / 1000)),
            },
          }))
          editedObj.route = { ...tendedWalk.route, features: routeFeatures }
        }
        editedObj.isUserModified = true
        editedRaw = editedObj
      }
    }

    for (const fn of deletedPhotoFilenames(rawWalk, walkMods)) {
      zip.remove(`photos/${fn}`)
    }

    zip.file(`walks/${id}.json`, JSON.stringify(editedRaw))
  }

  const newMods = includeHistory
    ? [...(manifest.modifications ?? []), ...modifications]
    : []

  const newManifest: PilgrimManifest = {
    ...manifest,
    schemaVersion: '1.0',
    walkCount: activeCount,
    archivedCount: newArchived.length,
    archived: newArchived,
    modifications: newMods,
  }

  zip.file('manifest.json', JSON.stringify(newManifest))

  const blob = await zip.generateAsync({ type: 'blob' })
  return { blob, filename: tendedFilename(originalFilename) }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/edit/save.test.ts`
Expected: PASS (all 4 cases).

- [ ] **Step 5: Commit**

```bash
git add src/edit/save.ts tests/edit/save.test.ts
git commit -m "feat(edit): serializeTendedPilgrim — pure save for .pilgrim files"
```

---

### Task 12: triggerDownload helper + schema invariants test

**Files:**
- Modify: `src/edit/save.ts`
- Create: `tests/edit/schema.test.ts`

- [ ] **Step 1: Write the failing schema test**

Create `tests/edit/schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { validatePilgrimManifest } from '../../src/edit/save'

describe('validatePilgrimManifest — iOS schema invariants', () => {
  it('accepts a manifest with all required fields', () => {
    const m = {
      schemaVersion: '1.0',
      exportDate: 1745000000,
      appVersion: '1.0.0',
      walkCount: 0,
      preferences: { distanceUnit: 'km', altitudeUnit: 'm', speedUnit: 'min/km', energyUnit: 'kcal' },
    }
    expect(() => validatePilgrimManifest(m)).not.toThrow()
  })

  it('rejects schemaVersion other than "1.0"', () => {
    const m = {
      schemaVersion: '2.0', exportDate: 0, appVersion: '1.0.0', walkCount: 0,
      preferences: { distanceUnit: 'km', altitudeUnit: 'm', speedUnit: 'min/km', energyUnit: 'kcal' },
    }
    expect(() => validatePilgrimManifest(m)).toThrow(/schemaVersion/)
  })

  it('rejects missing required field', () => {
    const m = { exportDate: 0, appVersion: '1.0.0', walkCount: 0,
      preferences: { distanceUnit: 'km', altitudeUnit: 'm', speedUnit: 'min/km', energyUnit: 'kcal' } }
    expect(() => validatePilgrimManifest(m)).toThrow()
  })

  it('rejects non-string distanceUnit', () => {
    const m = {
      schemaVersion: '1.0', exportDate: 0, appVersion: '1.0.0', walkCount: 0,
      preferences: { distanceUnit: 5, altitudeUnit: 'm', speedUnit: 'min/km', energyUnit: 'kcal' },
    }
    expect(() => validatePilgrimManifest(m)).toThrow()
  })

  it('tolerates additive editor fields (archived, modifications, archivedCount)', () => {
    const m = {
      schemaVersion: '1.0', exportDate: 0, appVersion: '1.0.0', walkCount: 0,
      preferences: { distanceUnit: 'km', altitudeUnit: 'm', speedUnit: 'min/km', energyUnit: 'kcal' },
      archived: [], archivedCount: 0, modifications: [],
    }
    expect(() => validatePilgrimManifest(m)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/edit/schema.test.ts`
Expected: FAIL — `validatePilgrimManifest` not exported.

- [ ] **Step 3: Add `validatePilgrimManifest` and `triggerDownload` to save.ts**

Append to `src/edit/save.ts`:

```typescript
export function validatePilgrimManifest(raw: unknown): void {
  if (!raw || typeof raw !== 'object') {
    throw new Error('manifest must be an object')
  }
  const m = raw as Record<string, unknown>
  if (m.schemaVersion !== '1.0') {
    throw new Error(`manifest.schemaVersion must be "1.0" (got ${JSON.stringify(m.schemaVersion)})`)
  }
  if (typeof m.exportDate !== 'number') throw new Error('manifest.exportDate must be a number')
  if (typeof m.appVersion !== 'string') throw new Error('manifest.appVersion must be a string')
  if (typeof m.walkCount !== 'number') throw new Error('manifest.walkCount must be a number')
  if (!m.preferences || typeof m.preferences !== 'object') {
    throw new Error('manifest.preferences must be an object')
  }
  const p = m.preferences as Record<string, unknown>
  for (const key of ['distanceUnit', 'altitudeUnit', 'speedUnit', 'energyUnit']) {
    if (typeof p[key] !== 'string') {
      throw new Error(`manifest.preferences.${key} must be a string`)
    }
  }
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
```

Update `serializeTendedPilgrim` to validate before returning. After `zip.file('manifest.json', JSON.stringify(newManifest))`, add:

```typescript
  validatePilgrimManifest(newManifest)
```

- [ ] **Step 4: Run tests to verify everything passes**

Run: `npx vitest run tests/edit/`
Expected: PASS (schema.test + all prior).

- [ ] **Step 5: Commit**

```bash
git add src/edit/save.ts tests/edit/schema.test.ts
git commit -m "feat(edit): validatePilgrimManifest (iOS gate) + triggerDownload helper"
```

---

## Phase 4: GPX Support

### Task 13: Extend gpx parser to return ast for round-tripping

**Files:**
- Modify: `src/parsers/gpx.ts`
- Test: `tests/parsers/gpx.test.ts`

- [ ] **Step 1: Read the current gpx parser to find the export shape**

Run: `cat src/parsers/gpx.ts | head -60`
Note the existing `parseGPX` signature. The goal: keep `parseGPX(xml) => Walk[]` as the default export, and add a new `parseGPXWithAst(xml) => { walks, ast }` for the editor's round-trip needs.

- [ ] **Step 2: Write the failing test**

Append to `tests/parsers/gpx.test.ts`:

```typescript
import { parseGPXWithAst } from '../../src/parsers/gpx'

describe('parseGPXWithAst', () => {
  it('returns walks AND raw XML AST', () => {
    const xml = `<?xml version="1.0"?>
<gpx version="1.1" creator="test">
  <trk><name>Test</name><trkseg>
    <trkpt lat="0" lon="0"><ele>100</ele><time>2024-01-01T00:00:00Z</time></trkpt>
    <trkpt lat="0.001" lon="0"><ele>105</ele><time>2024-01-01T00:01:00Z</time></trkpt>
  </trkseg></trk>
</gpx>`
    const result = parseGPXWithAst(xml)
    expect(result.walks).toHaveLength(1)
    expect(result.ast).toBeDefined()
    expect(typeof result.ast).toBe('object')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/parsers/gpx.test.ts -t 'parseGPXWithAst'`
Expected: FAIL — function not exported.

- [ ] **Step 4: Add `parseGPXWithAst` without changing `parseGPX`**

Append to `src/parsers/gpx.ts`:

```typescript
import { XMLParser } from 'fast-xml-parser'

export interface ParsedGPX {
  walks: Walk[]
  ast: unknown
}

export function parseGPXWithAst(xml: string): ParsedGPX {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseTagValue: true,
    parseAttributeValue: true,
  })
  const ast = parser.parse(xml)
  // Reuse the existing parseGPX for the walk normalization. Both pipelines
  // end up with the same Walk[] shape; v2 may DRY this up by sharing the
  // intermediate AST.
  const walks = parseGPX(xml)
  return { walks, ast }
}
```

> If `parseGPX` already imports `XMLParser` from fast-xml-parser, drop the duplicate import and reuse the existing one.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/parsers/gpx.test.ts`
Expected: PASS (existing + new).

- [ ] **Step 6: Commit**

```bash
git add src/parsers/gpx.ts tests/parsers/gpx.test.ts
git commit -m "feat(parsers): parseGPXWithAst — keep raw AST for editor round-trip"
```

---

### Task 14: GPX serialize path (route trim + waypoint delete)

**Files:**
- Modify: `src/edit/save.ts`
- Modify: `tests/edit/save.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/edit/save.test.ts`:

```typescript
import { serializeTendedGpx } from '../../src/edit/save'

describe('serializeTendedGpx', () => {
  const sampleGpx = `<?xml version="1.0"?>
<gpx version="1.1" creator="test">
  <wpt lat="0.001" lon="0"><name>WP1</name></wpt>
  <wpt lat="0.005" lon="0"><name>WP2</name></wpt>
  <trk><name>Test</name><trkseg>
    <trkpt lat="0" lon="0"><ele>100</ele><time>2024-01-01T00:00:00Z</time></trkpt>
    <trkpt lat="0.001" lon="0"><ele>105</ele><time>2024-01-01T00:01:00Z</time></trkpt>
    <trkpt lat="0.002" lon="0"><ele>110</ele><time>2024-01-01T00:02:00Z</time></trkpt>
    <trkpt lat="0.003" lon="0"><ele>115</ele><time>2024-01-01T00:03:00Z</time></trkpt>
  </trkseg></trk>
</gpx>`

  it('removes a deleted waypoint by lat/lng', async () => {
    const result = await serializeTendedGpx({
      originalXml: sampleGpx,
      modifications: [mkMod('delete_waypoint', { lat: 0.001, lng: 0 })],
      originalFilename: 'route.gpx',
    })
    const text = await result.blob.text()
    expect(text).not.toContain('WP1')
    expect(text).toContain('WP2')
    expect(result.filename).toBe('route-tended.gpx')
  })

  it('trims route start (drops leading trkpts)', async () => {
    const result = await serializeTendedGpx({
      originalXml: sampleGpx,
      modifications: [mkMod('trim_route_start', { meters: 50 })],
      originalFilename: 'route.gpx',
    })
    const text = await result.blob.text()
    expect((text.match(/<trkpt/g) ?? []).length).toBeLessThan(4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/edit/save.test.ts -t 'serializeTendedGpx'`
Expected: FAIL — function not exported.

- [ ] **Step 3: Implement `serializeTendedGpx`**

Append to `src/edit/save.ts`:

```typescript
import { XMLParser, XMLBuilder } from 'fast-xml-parser'
import { haversineDistance } from '../parsers/geo'

export interface SerializeGpxInput {
  originalXml: string
  modifications: Modification[]
  originalFilename: string
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return []
  return Array.isArray(v) ? v : [v]
}

function trimTrkpts(trkpts: Record<string, unknown>[], startMeters: number, endMeters: number): Record<string, unknown>[] {
  if (trkpts.length < 3) return trkpts

  const lat = (p: Record<string, unknown>) => Number(p.lat)
  const lon = (p: Record<string, unknown>) => Number(p.lon)

  let endIdx = trkpts.length
  if (endMeters > 0) {
    let acc = 0
    for (let i = trkpts.length - 1; i > 0; i--) {
      acc += haversineDistance(lat(trkpts[i]), lon(trkpts[i]), lat(trkpts[i - 1]), lon(trkpts[i - 1]))
      if (acc >= endMeters) { endIdx = i; break }
      if (i === 1) endIdx = 1
    }
  }

  let startIdx = 0
  if (startMeters > 0) {
    let acc = 0
    for (let i = 1; i < endIdx; i++) {
      acc += haversineDistance(lat(trkpts[i - 1]), lon(trkpts[i - 1]), lat(trkpts[i]), lon(trkpts[i]))
      if (acc >= startMeters) { startIdx = i; break }
    }
  }

  if (endIdx - startIdx < 2) {
    endIdx = Math.min(trkpts.length, startIdx + 2)
    if (endIdx - startIdx < 2) startIdx = Math.max(0, endIdx - 2)
  }

  return trkpts.slice(startIdx, endIdx)
}

export async function serializeTendedGpx(input: SerializeGpxInput): Promise<SerializeOutput> {
  const { originalXml, modifications, originalFilename } = input
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseTagValue: true,
    parseAttributeValue: true,
  })
  const ast = parser.parse(originalXml) as Record<string, unknown>
  const gpx = ast.gpx as Record<string, unknown>
  if (!gpx) throw new Error('Invalid GPX: missing <gpx> root')

  const wpDeletes = modifications.filter(m => m.op === 'delete_waypoint')
  if (wpDeletes.length > 0) {
    const wpts = asArray(gpx.wpt as Record<string, unknown> | Record<string, unknown>[] | undefined)
    const survivors = wpts.filter(wp => {
      const wpLat = Number(wp.lat)
      const wpLng = Number(wp.lon)
      return !wpDeletes.some(m => {
        const p = m.payload as { lat: number; lng: number }
        return p.lat === wpLat && p.lng === wpLng
      })
    })
    if (survivors.length === 0) delete gpx.wpt
    else gpx.wpt = survivors.length === 1 ? survivors[0] : survivors
  }

  let startMeters = 0
  let endMeters = 0
  for (const m of modifications) {
    if (m.op === 'trim_route_start') startMeters = (m.payload as { meters: number }).meters
    if (m.op === 'trim_route_end') endMeters = (m.payload as { meters: number }).meters
  }
  if (startMeters > 0 || endMeters > 0) {
    const trks = asArray(gpx.trk as Record<string, unknown> | Record<string, unknown>[] | undefined)
    for (const trk of trks) {
      const segs = asArray(trk.trkseg as Record<string, unknown> | Record<string, unknown>[] | undefined)
      for (const seg of segs) {
        const trkpts = asArray(seg.trkpt as Record<string, unknown> | Record<string, unknown>[] | undefined)
        seg.trkpt = trimTrkpts(trkpts, startMeters, endMeters)
      }
    }
  }

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    format: true,
  })
  const newXml = '<?xml version="1.0"?>\n' + builder.build(ast)
  const blob = new Blob([newXml], { type: 'application/gpx+xml' })
  return { blob, filename: tendedFilename(originalFilename) }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/edit/save.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/edit/save.ts tests/edit/save.test.ts
git commit -m "feat(edit): serializeTendedGpx — trim + waypoint delete via XML AST"
```

---

## Phase 5: UX — Tend Toggle, Drawer, Affordances

### Task 15: edit.css + edit/index.ts skeleton

**Files:**
- Create: `src/edit/edit.css`
- Create: `src/edit/index.ts`

- [ ] **Step 1: Create the CSS**

Create `src/edit/edit.css`:

```css
/* Tend toggle button */
.tend-toggle {
  background: transparent;
  border: 1px solid currentColor;
  color: inherit;
  padding: 0.4rem 0.8rem;
  font-family: inherit;
  font-size: 0.9rem;
  cursor: pointer;
  border-radius: 2px;
  letter-spacing: 0.05em;
}
.tend-toggle:hover { background: rgba(128, 128, 128, 0.1); }
.tend-toggle.active { background: currentColor; color: var(--bg); }

/* Body class flags */
body.tend-on .panel-x,
body.tend-on .photo-x,
body.tend-on .voice-x,
body.tend-on .pause-x,
body.tend-on .activity-x,
body.tend-on .walk-list-x { display: inline-flex; }

.panel-x, .photo-x, .voice-x, .pause-x, .activity-x, .walk-list-x {
  display: none;
  align-items: center;
  justify-content: center;
  width: 1.2rem; height: 1.2rem;
  border: none; background: transparent;
  color: rgba(128, 128, 128, 0.55);
  cursor: pointer;
  font-size: 1rem; line-height: 1;
}
.panel-x:hover, .photo-x:hover, .voice-x:hover,
.pause-x:hover, .activity-x:hover, .walk-list-x:hover {
  color: inherit;
}

body.tend-on .editable-text {
  border-bottom: 1px dotted rgba(128, 128, 128, 0.4);
  cursor: text;
}
body.tend-on .editable-text:hover { border-bottom-color: currentColor; }

.editable-input {
  width: 100%;
  font-family: inherit;
  font-size: inherit;
  background: transparent;
  border: 1px solid rgba(128, 128, 128, 0.4);
  padding: 0.25rem;
  color: inherit;
  resize: vertical;
}

/* Walk list — pending archive */
.walk-list-item.pending-archive {
  opacity: 0.45;
  text-decoration: line-through;
}
.pending-archive-tag {
  font-size: 0.7rem;
  margin-left: 0.5rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(128, 128, 128, 0.7);
}

/* Staging drawer */
.staging-drawer {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  background: var(--bg);
  border-top: 1px solid rgba(128, 128, 128, 0.3);
  padding: 0.75rem 1rem;
  z-index: 100;
  display: flex; gap: 1rem; align-items: center;
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.06);
}
.staging-drawer-count {
  font-weight: 600;
  white-space: nowrap;
}
.staging-drawer-list {
  flex: 1;
  display: flex; flex-direction: column; gap: 0.2rem;
  max-height: 6rem; overflow-y: auto;
  font-size: 0.85rem;
}
.staging-drawer-item { display: flex; gap: 0.5rem; align-items: center; }
.staging-drawer-item button { background: transparent; border: none; color: inherit; cursor: pointer; }

.staging-drawer-actions { display: flex; gap: 0.5rem; align-items: center; white-space: nowrap; }
.staging-drawer-save {
  padding: 0.4rem 1rem; border: 1px solid currentColor; background: transparent;
  color: inherit; cursor: pointer; font-family: inherit;
}
.staging-drawer-save:hover { background: currentColor; color: var(--bg); }
.staging-drawer-discard {
  background: transparent; border: none; color: rgba(128, 128, 128, 0.7);
  cursor: pointer; font-family: inherit;
}
.staging-drawer-discard:hover { color: inherit; }
.staging-drawer-history { display: flex; align-items: center; gap: 0.3rem; font-size: 0.85rem; }

/* Trim handles */
.trim-handle {
  width: 18px; height: 18px;
  background: var(--accent, #b08968);
  border: 2px solid var(--bg);
  border-radius: 50%;
  cursor: ew-resize;
  box-shadow: 0 1px 4px rgba(0,0,0,0.3);
}
.trim-label {
  background: var(--bg);
  padding: 2px 6px;
  border: 1px solid currentColor;
  font-size: 0.75rem;
  border-radius: 2px;
}

/* Modal */
.archive-modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 200;
  display: flex; align-items: center; justify-content: center;
}
.archive-modal {
  background: var(--bg);
  padding: 1.5rem 2rem;
  max-width: 500px;
  border: 1px solid rgba(128, 128, 128, 0.3);
}
.archive-modal h2 { font-family: 'Cormorant Garamond', serif; margin: 0 0 1rem; }
.archive-modal-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1.5rem; }
```

- [ ] **Step 2: Create `edit/index.ts` skeleton**

Create `src/edit/index.ts`:

```typescript
import './edit.css'
import { createStaging } from './staging'

export interface EditLayer {
  staging: ReturnType<typeof createStaging>
}

// Expanded in Task 25 to attach the toggle, drawer, and affordances.
export function mountEditLayer(): EditLayer {
  const staging = createStaging()
  return { staging }
}
```

- [ ] **Step 3: Confirm typecheck passes**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/edit/edit.css src/edit/index.ts
git commit -m "feat(edit): module entry + base CSS"
```

---

### Task 16: Tend toggle component

**Files:**
- Create: `src/edit/tend-toggle.ts`

- [ ] **Step 1: Implement the toggle**

Create `src/edit/tend-toggle.ts`:

```typescript
export interface TendToggle {
  element: HTMLButtonElement
  isOn(): boolean
  setOn(value: boolean): void
  onChange(listener: (on: boolean) => void): () => void
}

export function createTendToggle(initial = false): TendToggle {
  let on = initial
  const listeners = new Set<(v: boolean) => void>()

  const button = document.createElement('button')
  button.className = 'tend-toggle'
  button.type = 'button'

  function render(): void {
    button.textContent = on ? 'Done' : 'Tend'
    button.classList.toggle('active', on)
    document.body.classList.toggle('tend-on', on)
  }

  function set(value: boolean): void {
    if (value === on) return
    on = value
    render()
    for (const l of listeners) l(on)
  }

  button.addEventListener('click', () => set(!on))
  render()

  return {
    element: button,
    isOn: () => on,
    setOn: set,
    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
```

- [ ] **Step 2: Confirm typecheck passes**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/edit/tend-toggle.ts
git commit -m "feat(edit): Tend/Done toggle button"
```

---

### Task 17: Staging drawer component

**Files:**
- Create: `src/edit/drawer.ts`

- [ ] **Step 1: Implement the drawer**

Create `src/edit/drawer.ts`:

```typescript
import type { Modification } from '../parsers/types'
import type { Staging } from './staging'

function describeMod(mod: Modification): string {
  switch (mod.op) {
    case 'archive_walk': return `Archived walk`
    case 'replace_walk': return `Replaced walk JSON`
    case 'delete_section': return `Removed ${(mod.payload as { section: string }).section}`
    case 'delete_photo': return `Deleted photo`
    case 'delete_voice_recording': return `Deleted voice recording`
    case 'delete_pause': return `Deleted pause`
    case 'delete_activity': return `Deleted activity segment`
    case 'delete_waypoint': return `Deleted waypoint`
    case 'trim_route_start':
      return `Trimmed ${(mod.payload as { meters: number }).meters}m from route start`
    case 'trim_route_end':
      return `Trimmed ${(mod.payload as { meters: number }).meters}m from route end`
    case 'edit_intention': return `Edited intention`
    case 'edit_reflection_text': return `Edited reflection`
    case 'edit_transcription': return `Edited transcription`
  }
}

export interface DrawerCallbacks {
  onSave: (includeHistory: boolean) => void
}

export interface Drawer {
  element: HTMLElement
  destroy(): void
}

export function createStagingDrawer(staging: Staging, callbacks: DrawerCallbacks): Drawer {
  const drawer = document.createElement('div')
  drawer.className = 'staging-drawer'

  const count = document.createElement('div')
  count.className = 'staging-drawer-count'

  const list = document.createElement('div')
  list.className = 'staging-drawer-list'

  const actions = document.createElement('div')
  actions.className = 'staging-drawer-actions'

  const historyLabel = document.createElement('label')
  historyLabel.className = 'staging-drawer-history'
  const historyCheckbox = document.createElement('input')
  historyCheckbox.type = 'checkbox'
  historyCheckbox.checked = true
  const historyText = document.createElement('span')
  historyText.textContent = 'Include tending history'
  historyLabel.appendChild(historyCheckbox)
  historyLabel.appendChild(historyText)

  const saveBtn = document.createElement('button')
  saveBtn.className = 'staging-drawer-save'
  saveBtn.textContent = 'Save tended file'
  saveBtn.addEventListener('click', () => callbacks.onSave(historyCheckbox.checked))

  let discardArmed = false
  const discardBtn = document.createElement('button')
  discardBtn.className = 'staging-drawer-discard'
  discardBtn.textContent = 'Discard all'
  discardBtn.addEventListener('click', () => {
    if (!discardArmed) {
      discardArmed = true
      discardBtn.textContent = 'Confirm discard?'
      setTimeout(() => {
        discardArmed = false
        discardBtn.textContent = 'Discard all'
      }, 3000)
      return
    }
    staging.clear()
    discardArmed = false
    discardBtn.textContent = 'Discard all'
  })

  actions.appendChild(historyLabel)
  actions.appendChild(discardBtn)
  actions.appendChild(saveBtn)

  drawer.appendChild(count)
  drawer.appendChild(list)
  drawer.appendChild(actions)

  function render(): void {
    const mods = staging.list()
    if (mods.length === 0) {
      drawer.style.display = 'none'
      return
    }
    drawer.style.display = ''
    count.textContent = `${mods.length} change${mods.length === 1 ? '' : 's'} pending`
    list.textContent = ''
    for (const mod of mods) {
      const item = document.createElement('div')
      item.className = 'staging-drawer-item'
      const text = document.createElement('span')
      text.textContent = describeMod(mod)
      const undo = document.createElement('button')
      undo.type = 'button'
      undo.textContent = '↩'
      undo.title = 'Undo this change'
      undo.addEventListener('click', () => staging.undo(mod.id))
      item.appendChild(text)
      item.appendChild(undo)
      list.appendChild(item)
    }
  }

  const unsub = staging.subscribe(render)
  render()

  return {
    element: drawer,
    destroy() { unsub(); drawer.remove() },
  }
}
```

- [ ] **Step 2: Confirm typecheck passes**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/edit/drawer.ts
git commit -m "feat(edit): staging drawer — count, list, undo, save, discard"
```

---

### Task 18: Archive confirmation modal

**Files:**
- Create: `src/edit/archive-modal.ts`

- [ ] **Step 1: Implement the modal**

Create `src/edit/archive-modal.ts`:

```typescript
export function showArchiveModal(walkLabel: string): Promise<boolean> {
  return new Promise(resolve => {
    const backdrop = document.createElement('div')
    backdrop.className = 'archive-modal-backdrop'

    const modal = document.createElement('div')
    modal.className = 'archive-modal'

    const heading = document.createElement('h2')
    heading.textContent = `Archive ${walkLabel}?`

    const body = document.createElement('p')
    body.textContent = `Route, photos, intention, reflection, and transcriptions will be permanently removed from this file. The walk's date, distance, and meditation time will remain in your archive so your lifetime totals stay intact.`

    const actions = document.createElement('div')
    actions.className = 'archive-modal-actions'

    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.textContent = 'Cancel'
    cancel.className = 'staging-drawer-discard'
    cancel.addEventListener('click', () => { backdrop.remove(); resolve(false) })

    const archive = document.createElement('button')
    archive.type = 'button'
    archive.textContent = 'Archive'
    archive.className = 'staging-drawer-save'
    archive.addEventListener('click', () => { backdrop.remove(); resolve(true) })

    actions.appendChild(cancel)
    actions.appendChild(archive)

    modal.appendChild(heading)
    modal.appendChild(body)
    modal.appendChild(actions)
    backdrop.appendChild(modal)
    document.body.appendChild(backdrop)

    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) { backdrop.remove(); resolve(false) }
    })
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/edit/archive-modal.ts
git commit -m "feat(edit): archive confirmation modal"
```

---

### Task 19: Affordances — section × buttons (intention, weather, celestial, reflection)

**Files:**
- Create: `src/edit/affordances.ts`

- [ ] **Step 1: Implement section-delete affordances**

Create `src/edit/affordances.ts`:

```typescript
import type { Walk, DeletableSection } from '../parsers/types'
import type { Staging } from './staging'

export interface AffordanceContext {
  staging: Staging
  walk: Walk
  sidebar: HTMLElement
}

function makeXButton(className: string, title: string): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = className
  btn.title = title
  btn.textContent = '×'
  return btn
}

// Inject section × buttons into existing panel headers.
// Called after the viewer's renderPanels() has populated the sidebar.
export function attachSectionDeletes(ctx: AffordanceContext): void {
  const intentionEl = ctx.sidebar.querySelector('.intention-text')
  if (intentionEl && ctx.walk.intention) {
    const x = makeXButton('panel-x', 'Delete intention')
    x.addEventListener('click', e => {
      e.stopPropagation()
      ctx.staging.push({ op: 'delete_section', walkId: ctx.walk.id, payload: { section: 'intention' } })
    })
    intentionEl.appendChild(x)
  }
  const reflectionEl = ctx.sidebar.querySelector('.reflection-text')
  if (reflectionEl && ctx.walk.reflection) {
    const x = makeXButton('panel-x', 'Delete reflection')
    x.addEventListener('click', e => {
      e.stopPropagation()
      ctx.staging.push({ op: 'delete_section', walkId: ctx.walk.id, payload: { section: 'reflection' } })
    })
    reflectionEl.appendChild(x)
  }
  // Weather + celestial — by panel-section heading text. (Viewer doesn't
  // expose dedicated classes for these as of writing.)
  const sections = ctx.sidebar.querySelectorAll('.panel')
  for (const section of Array.from(sections)) {
    const heading = section.querySelector('h2, h3, .panel-heading')?.textContent ?? ''
    let target: DeletableSection | null = null
    if (/weather/i.test(heading) && ctx.walk.weather) target = 'weather'
    else if (/celestial|moon|lunar/i.test(heading) && ctx.walk.celestial) target = 'celestial'
    if (!target) continue
    const t = target  // narrow for closure
    const x = makeXButton('panel-x', `Delete ${t}`)
    x.addEventListener('click', e => {
      e.stopPropagation()
      ctx.staging.push({ op: 'delete_section', walkId: ctx.walk.id, payload: { section: t } })
    })
    const headingEl = section.querySelector('h2, h3, .panel-heading')
    if (headingEl) headingEl.appendChild(x)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/edit/affordances.ts
git commit -m "feat(edit): section × buttons for intention/reflection/weather/celestial"
```

---

### Task 20: Affordances — × buttons on photos, voice recordings, pauses, activities

**Files:**
- Modify: `src/edit/affordances.ts`

- [ ] **Step 1: Append list-item affordances to affordances.ts**

In `src/edit/affordances.ts`, append:

```typescript
export function attachPhotoDeletes(ctx: AffordanceContext): void {
  if (!ctx.walk.photos) return
  const items = ctx.sidebar.querySelectorAll('.photo-thumbnail, .photo-item')
  Array.from(items).forEach((el, idx) => {
    const photo = ctx.walk.photos![idx]
    if (!photo) return
    const x = makeXButton('photo-x', 'Delete photo')
    x.addEventListener('click', e => {
      e.stopPropagation()
      ctx.staging.push({ op: 'delete_photo', walkId: ctx.walk.id, payload: { localIdentifier: photo.localIdentifier } })
    })
    el.appendChild(x)
  })
}

export function attachVoiceRecordingDeletes(ctx: AffordanceContext): void {
  const items = ctx.sidebar.querySelectorAll('.voice-recording, .transcription-item')
  Array.from(items).forEach((el, idx) => {
    const rec = ctx.walk.voiceRecordings[idx]
    if (!rec) return
    const x = makeXButton('voice-x', 'Delete voice recording')
    x.addEventListener('click', e => {
      e.stopPropagation()
      const sd = Math.floor(rec.startDate.getTime() / 1000)
      ctx.staging.push({ op: 'delete_voice_recording', walkId: ctx.walk.id, payload: { startDate: sd } })
    })
    el.appendChild(x)
  })
}

export function attachPauseDeletes(ctx: AffordanceContext): void {
  const items = ctx.sidebar.querySelectorAll('.pause-item, .timeline-pause')
  Array.from(items).forEach((el, idx) => {
    const pause = ctx.walk.pauses[idx]
    if (!pause) return
    const x = makeXButton('pause-x', 'Delete pause')
    x.addEventListener('click', e => {
      e.stopPropagation()
      const sd = Math.floor(pause.startDate.getTime() / 1000)
      ctx.staging.push({ op: 'delete_pause', walkId: ctx.walk.id, payload: { startDate: sd } })
    })
    el.appendChild(x)
  })
}

export function attachActivityDeletes(ctx: AffordanceContext): void {
  const items = ctx.sidebar.querySelectorAll('.activity-item, .timeline-activity')
  Array.from(items).forEach((el, idx) => {
    const activity = ctx.walk.activities[idx]
    if (!activity) return
    const x = makeXButton('activity-x', 'Delete activity segment')
    x.addEventListener('click', e => {
      e.stopPropagation()
      const sd = Math.floor(activity.startDate.getTime() / 1000)
      ctx.staging.push({ op: 'delete_activity', walkId: ctx.walk.id, payload: { startDate: sd } })
    })
    el.appendChild(x)
  })
}
```

> **Note for the implementer:** the `.photo-thumbnail`, `.voice-recording`, `.pause-item`, `.activity-item` class names are educated guesses. Open `src/panels/photos.ts`, `src/panels/transcriptions.ts`, `src/panels/timeline.ts` and replace the selectors with the actual class names used by each panel. If a panel groups items differently (e.g., one combined timeline for pauses + activities), adapt the selector accordingly. The pattern is the same: find the rendered list items, stamp on a × button, register a click handler that pushes the right mod.

- [ ] **Step 2: Commit**

```bash
git add src/edit/affordances.ts
git commit -m "feat(edit): list-item × buttons for photos/voice/pauses/activities"
```

---

### Task 21: Affordances — inline text editors (intention, reflection, transcription)

**Files:**
- Modify: `src/edit/affordances.ts`

- [ ] **Step 1: Append inline-edit affordances**

Append to `src/edit/affordances.ts`:

```typescript
export function attachInlineEditors(ctx: AffordanceContext): void {
  const intentionEl = ctx.sidebar.querySelector<HTMLElement>('.intention-text')
  if (intentionEl && ctx.walk.intention) attachSingleLineEditor(intentionEl, ctx.walk.intention, text => {
    ctx.staging.push({ op: 'edit_intention', walkId: ctx.walk.id, payload: { text } })
  })

  const reflectionEl = ctx.sidebar.querySelector<HTMLElement>('.reflection-text')
  if (reflectionEl && ctx.walk.reflection?.text) {
    attachMultiLineEditor(reflectionEl, ctx.walk.reflection.text, text => {
      ctx.staging.push({ op: 'edit_reflection_text', walkId: ctx.walk.id, payload: { text } })
    })
  }

  // Voice transcriptions
  const transcriptionEls = ctx.sidebar.querySelectorAll<HTMLElement>('.transcription-text, .voice-transcription')
  Array.from(transcriptionEls).forEach((el, idx) => {
    const rec = ctx.walk.voiceRecordings[idx]
    if (!rec || !rec.transcription) return
    attachMultiLineEditor(el, rec.transcription, text => {
      const sd = Math.floor(rec.startDate.getTime() / 1000)
      ctx.staging.push({ op: 'edit_transcription', walkId: ctx.walk.id, payload: { recordingStartDate: sd, text } })
    })
  })
}

function attachSingleLineEditor(el: HTMLElement, initial: string, onCommit: (text: string) => void): void {
  el.classList.add('editable-text')
  el.addEventListener('click', () => {
    if (!document.body.classList.contains('tend-on')) return
    if (el.querySelector('.editable-input')) return
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'editable-input'
    input.value = el.textContent ?? initial
    el.textContent = ''
    el.appendChild(input)
    input.focus()
    input.select()
    function commit(): void {
      const text = input.value.trim()
      el.textContent = text || initial
      if (text && text !== initial) onCommit(text)
    }
    input.addEventListener('blur', commit)
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur() }
      if (e.key === 'Escape') { input.value = initial; input.blur() }
    })
  })
}

function attachMultiLineEditor(el: HTMLElement, initial: string, onCommit: (text: string) => void): void {
  el.classList.add('editable-text')
  el.addEventListener('click', () => {
    if (!document.body.classList.contains('tend-on')) return
    if (el.querySelector('.editable-input')) return
    const input = document.createElement('textarea')
    input.className = 'editable-input'
    input.rows = Math.max(2, Math.ceil((el.textContent ?? '').length / 60))
    input.value = el.textContent ?? initial
    el.textContent = ''
    el.appendChild(input)
    input.focus()
    function commit(): void {
      const text = input.value.trim()
      el.textContent = text || initial
      if (text && text !== initial) onCommit(text)
    }
    input.addEventListener('blur', commit)
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); input.blur() }
      if (e.key === 'Escape') { input.value = initial; input.blur() }
    })
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/edit/affordances.ts
git commit -m "feat(edit): inline editors for intention/reflection/transcription"
```

---

### Task 22: Walk-list × + archive-modal flow

**Files:**
- Modify: `src/edit/affordances.ts`

- [ ] **Step 1: Append walk-list affordance**

Append to `src/edit/affordances.ts`:

```typescript
import { showArchiveModal } from './archive-modal'

export interface WalkListAffordanceContext {
  staging: Staging
  walks: Walk[]
  sidebar: HTMLElement
}

export function attachWalkListDeletes(ctx: WalkListAffordanceContext): void {
  const items = ctx.sidebar.querySelectorAll<HTMLElement>('.walk-list-item')
  Array.from(items).forEach((el, idx) => {
    const walk = ctx.walks[idx]
    if (!walk) return

    const isArchived = ctx.staging.list().some(m => m.op === 'archive_walk' && m.walkId === walk.id)
    if (isArchived) {
      el.classList.add('pending-archive')
      const tag = document.createElement('span')
      tag.className = 'pending-archive-tag'
      tag.textContent = 'Pending archive'
      el.appendChild(tag)
      return
    }

    const x = makeXButton('walk-list-x', 'Archive walk')
    x.addEventListener('click', async e => {
      e.stopPropagation()
      const label = walk.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      const ok = await showArchiveModal(label)
      if (!ok) return
      ctx.staging.push({ op: 'archive_walk', walkId: walk.id, payload: {} as Record<string, never> })
    })
    el.appendChild(x)
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/edit/affordances.ts
git commit -m "feat(edit): walk-list × + archive confirmation flow"
```

---

### Task 23: Trim handles on the map

**Files:**
- Create: `src/edit/trim-handles.ts`

- [ ] **Step 1: Implement trim handles**

Create `src/edit/trim-handles.ts`:

```typescript
import mapboxgl from 'mapbox-gl'
import type { Walk } from '../parsers/types'
import type { Staging } from './staging'
import { totalDistance } from '../parsers/geo'

export interface TrimHandleContext {
  map: mapboxgl.Map
  walk: Walk
  staging: Staging
  refreshPreview: () => void
}

export interface TrimHandleManager {
  destroy(): void
}

function getLine(walk: Walk): number[][] {
  for (const f of walk.route.features) {
    if (f.geometry.type === 'LineString') return f.geometry.coordinates as number[][]
  }
  return []
}

const liveTrim: { startMeters: number; endMeters: number } = { startMeters: 0, endMeters: 0 }

function setPreviewTrim(position: 'start' | 'end', meters: number): void {
  if (position === 'start') liveTrim.startMeters = meters
  else liveTrim.endMeters = meters
}

export function getLiveTrim(): { startMeters: number; endMeters: number } {
  return { ...liveTrim }
}

function computeTrimMeters(line: number[][], position: 'start' | 'end', dragged: number[]): number {
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < line.length; i++) {
    const dx = line[i][0] - dragged[0]
    const dy = line[i][1] - dragged[1]
    const d = dx * dx + dy * dy
    if (d < bestDist) { bestDist = d; bestIdx = i }
  }
  if (position === 'start') {
    const slice = line.slice(0, bestIdx + 1)
    return totalDistance(slice)
  } else {
    const slice = line.slice(bestIdx)
    return totalDistance(slice)
  }
}

function createMarker(ctx: TrimHandleContext, position: 'start' | 'end'): mapboxgl.Marker {
  const el = document.createElement('div')
  el.className = 'trim-handle'

  const label = document.createElement('div')
  label.className = 'trim-label'
  label.style.position = 'absolute'
  label.style.transform = 'translate(-50%, -150%)'
  label.style.whiteSpace = 'nowrap'
  label.style.pointerEvents = 'none'
  label.textContent = '0m'
  el.appendChild(label)

  const line = getLine(ctx.walk)
  const initialCoord = position === 'start' ? line[0] : line[line.length - 1]
  if (!initialCoord) {
    return new mapboxgl.Marker({ element: el }).setLngLat([0, 0]).addTo(ctx.map)
  }

  const marker = new mapboxgl.Marker({ element: el, draggable: true })
    .setLngLat([initialCoord[0], initialCoord[1]])
    .addTo(ctx.map)

  let lastMeters = 0
  marker.on('drag', () => {
    const lngLat = marker.getLngLat()
    const meters = computeTrimMeters(line, position, [lngLat.lng, lngLat.lat])
    lastMeters = meters
    label.textContent = `−${Math.round(meters)}m from ${position}`
    setPreviewTrim(position, meters)
    ctx.refreshPreview()
  })

  marker.on('dragend', () => {
    if (lastMeters <= 0) return
    ctx.staging.push({
      op: position === 'start' ? 'trim_route_start' : 'trim_route_end',
      walkId: ctx.walk.id,
      payload: { meters: Math.round(lastMeters) },
    })
    setPreviewTrim(position, 0)
  })

  return marker
}

export function attachTrimHandles(ctx: TrimHandleContext): TrimHandleManager {
  const startMarker = createMarker(ctx, 'start')
  const endMarker = createMarker(ctx, 'end')
  return {
    destroy() {
      startMarker.remove()
      endMarker.remove()
    },
  }
}
```

> **Note for the implementer:** the trim-handle UX above is functional. Polish passes you might want, but are NOT required for v1: snapping the dragged point to the nearest route vertex; rendering the trimmed-off portion as a faded dashed Mapbox layer; mobile touch refinement.

- [ ] **Step 2: Confirm typecheck passes**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/edit/trim-handles.ts
git commit -m "feat(edit): map trim handles with live label and on-release commit"
```

---

### Task 24: JSON expert mode (per-walk textarea)

**Files:**
- Create: `src/edit/json-mode.ts`

- [ ] **Step 1: Implement JSON mode**

Create `src/edit/json-mode.ts`:

```typescript
import type { Walk } from '../parsers/types'
import type { Staging } from './staging'

export interface JsonModeContext {
  walk: Walk
  rawWalk: unknown
  staging: Staging
  panelArea: HTMLElement
  // Called when JSON mode exits, so the host can re-render the panels.
  // The host typically calls renderPanels() inside this callback.
  onExit: () => void
}

export function attachJsonMode(ctx: JsonModeContext): { toggleButton: HTMLButtonElement } {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = '{ }'
  button.title = 'Edit walk JSON directly'
  button.className = 'panel-x'
  button.style.fontFamily = 'monospace'

  let active = false

  button.addEventListener('click', () => {
    if (active) {
      // Leaving JSON mode — let the host re-render the panels.
      active = false
      ctx.onExit()
      return
    }
    active = true

    // Replace the panel area with a textarea + error label.
    while (ctx.panelArea.firstChild) ctx.panelArea.removeChild(ctx.panelArea.firstChild)

    const textarea = document.createElement('textarea')
    textarea.className = 'editable-input'
    textarea.style.minHeight = '60vh'
    textarea.style.fontFamily = 'monospace'
    textarea.value = JSON.stringify(ctx.rawWalk, null, 2)

    const errorEl = document.createElement('div')
    errorEl.style.color = 'var(--error, #c33)'
    errorEl.style.fontSize = '0.85rem'

    textarea.addEventListener('blur', () => {
      try {
        const parsed = JSON.parse(textarea.value)
        errorEl.textContent = ''
        ctx.staging.push({
          op: 'replace_walk',
          walkId: ctx.walk.id,
          payload: { walk: parsed },
        })
      } catch (err) {
        errorEl.textContent = `Invalid JSON: ${(err as Error).message}`
      }
    })

    ctx.panelArea.appendChild(textarea)
    ctx.panelArea.appendChild(errorEl)
  })

  return { toggleButton: button }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/edit/json-mode.ts
git commit -m "feat(edit): JSON expert mode for per-walk raw editing"
```

---

## Phase 6: Integration

### Task 25: Wire mountEditLayer with hostname gate

**Files:**
- Modify: `src/edit/index.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Extend `edit/index.ts` with the orchestrator**

Replace the contents of `src/edit/index.ts`:

```typescript
import './edit.css'
import { createStaging } from './staging'
import { createTendToggle } from './tend-toggle'
import { createStagingDrawer } from './drawer'
import { serializeTendedPilgrim, serializeTendedGpx, triggerDownload } from './save'
import {
  attachSectionDeletes, attachPhotoDeletes, attachVoiceRecordingDeletes,
  attachPauseDeletes, attachActivityDeletes, attachInlineEditors,
  attachWalkListDeletes,
} from './affordances'
import { attachTrimHandles, getLiveTrim } from './trim-handles'
import type { Walk, PilgrimManifest } from '../parsers/types'
import type mapboxgl from 'mapbox-gl'

export interface EditApi {
  staging: ReturnType<typeof createStaging>
  toggle: ReturnType<typeof createTendToggle>
  attachToWalkUI(opts: {
    walk: Walk
    rawWalk?: unknown
    sidebar: HTMLElement
    map?: mapboxgl.Map
    refreshPreview: () => void
  }): () => void
  attachToWalkListUI(opts: { walks: Walk[]; sidebar: HTMLElement }): void
  saveAll(opts: SaveOptions): Promise<void>
  getIncludeHistory(): boolean
}

export interface SaveOptions {
  source: 'pilgrim' | 'gpx'
  originalBuffer?: ArrayBuffer
  originalXml?: string
  manifest?: PilgrimManifest
  rawWalks?: unknown[]
  originalFilename: string
}

export function mountEditLayer(headerControls: HTMLElement, app: HTMLElement): EditApi {
  const staging = createStaging()
  const toggle = createTendToggle(false)
  headerControls.appendChild(toggle.element)

  const drawerHost = document.createElement('div')
  app.appendChild(drawerHost)

  let pendingHistoryToggle = true

  const drawer = createStagingDrawer(staging, {
    onSave: includeHistory => {
      pendingHistoryToggle = includeHistory
      window.dispatchEvent(new CustomEvent('pilgrim-edit-save-requested'))
    },
  })
  drawerHost.appendChild(drawer.element)

  const api: EditApi = {
    staging,
    toggle,
    attachToWalkUI({ walk, sidebar, map, refreshPreview }) {
      const cleanups: (() => void)[] = []
      attachSectionDeletes({ staging, walk, sidebar })
      attachPhotoDeletes({ staging, walk, sidebar })
      attachVoiceRecordingDeletes({ staging, walk, sidebar })
      attachPauseDeletes({ staging, walk, sidebar })
      attachActivityDeletes({ staging, walk, sidebar })
      attachInlineEditors({ staging, walk, sidebar })
      if (map) {
        const handles = attachTrimHandles({ map, walk, staging, refreshPreview })
        cleanups.push(() => handles.destroy())
      }
      return () => { for (const c of cleanups) c() }
    },
    attachToWalkListUI({ walks, sidebar }) {
      attachWalkListDeletes({ staging, walks, sidebar })
    },
    async saveAll(opts) {
      let result: { blob: Blob; filename: string }
      if (opts.source === 'pilgrim') {
        if (!opts.originalBuffer || !opts.manifest || !opts.rawWalks) {
          throw new Error('pilgrim save requires buffer + manifest + rawWalks')
        }
        result = await serializeTendedPilgrim({
          originalBuffer: opts.originalBuffer,
          manifest: opts.manifest,
          rawWalks: opts.rawWalks,
          modifications: staging.list(),
          includeHistory: pendingHistoryToggle,
          originalFilename: opts.originalFilename,
        })
      } else {
        if (!opts.originalXml) throw new Error('gpx save requires originalXml')
        result = await serializeTendedGpx({
          originalXml: opts.originalXml,
          modifications: staging.list(),
          originalFilename: opts.originalFilename,
        })
      }
      triggerDownload(result.blob, result.filename)
      staging.clear()
    },
    getIncludeHistory: () => pendingHistoryToggle,
  }

  return api
}

export { getLiveTrim }
```

- [ ] **Step 2: Add the hostname gate to main.ts**

Near the top of `src/main.ts` (after the existing imports), add:

```typescript
const isEditHost = location.hostname.startsWith('edit.')
const isLocalDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
const enableEdit = isEditHost || (isLocalDev && new URLSearchParams(location.search).has('edit'))

let editApi: import('./edit').EditApi | null = null
async function ensureEditMounted(headerControls: HTMLElement): Promise<void> {
  if (!enableEdit || editApi) return
  const { mountEditLayer } = await import('./edit')
  editApi = mountEditLayer(headerControls, app)
}
```

Add module-state vars near the existing ones:

```typescript
let originalPilgrimBuffer: ArrayBuffer | undefined
let originalGpxXml: string | undefined
let currentLoadedFilename: string | undefined
```

In `handleFile`, modify the parse branches to record these:

```typescript
    if (name.endsWith('.pilgrim')) {
      originalPilgrimBuffer = buffer
      originalGpxXml = undefined
      const result = await parsePilgrim(buffer)
      newWalks = result.walks
      newRawWalks = result.rawWalks
      newManifest = result.manifest
    } else {
      originalPilgrimBuffer = undefined
      const text = new TextDecoder().decode(buffer)
      originalGpxXml = text
      newWalks = parseGPX(text)
    }
    currentLoadedFilename = name
```

In `renderApp()`, after `createMoonToggle(layout.headerControls)`, add:

```typescript
  void ensureEditMounted(layout.headerControls)
```

After the single-walk `renderPanels(...)` call, add:

```typescript
    if (editApi && walk.source === 'pilgrim') {
      editApi.attachToWalkUI({
        walk,
        rawWalk: currentRawWalks[currentWalks.indexOf(walk)],
        sidebar: layout.sidebar,
        map: mapRenderer.getMap(),
        refreshPreview: () => mapRenderer.showWalk(applyPrivacy(walk), { privacyFade: privacyZone.getMeters() > 0 }),
      })
    }
```

In `showListMode`, after `walkList = createWalkList(...)`, add:

```typescript
    if (editApi) {
      editApi.attachToWalkListUI({ walks: currentWalks, sidebar: layout.sidebar })
    }
```

Add the save event listener at module scope (near `pilgrimdatarequest`):

```typescript
window.addEventListener('pilgrim-edit-save-requested', async () => {
  if (!editApi) return
  if (currentWalks.length === 0) return
  const source = currentWalks[0].source
  const originalFilename = currentLoadedFilename ?? (source === 'pilgrim' ? 'walk.pilgrim' : 'walk.gpx')
  if (source === 'pilgrim') {
    if (!currentManifest || !originalPilgrimBuffer) return
    await editApi.saveAll({
      source: 'pilgrim',
      originalBuffer: originalPilgrimBuffer,
      manifest: currentManifest,
      rawWalks: currentRawWalks,
      originalFilename,
    })
  } else {
    if (!originalGpxXml) return
    await editApi.saveAll({ source: 'gpx', originalXml: originalGpxXml, originalFilename })
  }
})
```

- [ ] **Step 3: Run typecheck and tests**

Run: `npm run typecheck && npx vitest run`
Expected: PASS.

- [ ] **Step 4: Manual smoke test (dev)**

Run in a separate terminal: `npm run dev`
Open: `http://localhost:5173/?edit=1`
Drop a `.pilgrim` from `samples/`. Verify:
- "Tend" button appears in the header.
- Clicking Tend reveals × buttons on panels.
- Clicking × on intention stages a mod and the drawer appears.
- "Save tended file" downloads a `<name>-tended.pilgrim`.

- [ ] **Step 5: Commit**

```bash
git add src/edit/index.ts src/main.ts
git commit -m "feat(edit): mount edit layer at edit.* hostname or ?edit=1 in dev"
```

---

### Task 26: Live preview re-render on staging push

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Subscribe to staging changes and re-render**

In `src/main.ts`, inside `renderApp()` after `ensureEditMounted` is called, add:

```typescript
  if (editApi) {
    editApi.staging.subscribe(() => rerender())
  }
```

- [ ] **Step 2: Apply staged mods inside the render path**

Find the single-walk render section in `renderApp()`:

```typescript
    const walk = currentWalks[0]
    const pf = privacyZone.getMeters() > 0
    mapRenderer.showWalk(applyPrivacy(walk), { privacyFade: pf })
    renderPanels(layout.sidebar, walk, currentManifest, currentUnit, onPhotoSelect)
```

Replace with (and convert `renderApp` to `async` if it isn't already):

```typescript
    const walk = currentWalks[0]
    let displayWalk = walk
    if (editApi) {
      const { applyMods } = await import('./edit/applier')
      const tended = applyMods(walk, editApi.staging.list())
      if (tended) displayWalk = tended
    }
    const pf = privacyZone.getMeters() > 0
    mapRenderer.showWalk(applyPrivacy(displayWalk), { privacyFade: pf })
    renderPanels(layout.sidebar, displayWalk, currentManifest, currentUnit, onPhotoSelect)
```

Update any callsite that synchronously invoked `renderApp()` to `await renderApp()`. The viewer's existing `let rerender = () => {}` is now `let rerender = async () => {}`.

> **Note:** `await import('./edit/applier')` keeps the applier out of the view-only bundle. View hosts have `editApi === null` and never run this branch.

- [ ] **Step 3: Manual smoke test**

`npm run dev` → `http://localhost:5173/?edit=1` → drop a multi-walk pilgrim.
- Click an intention's × → intention disappears from the panel immediately.
- Click ↩ in the drawer → intention reappears.
- Drag a trim handle → polyline updates as you drag.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat(edit): live preview — apply staged mods inside render path"
```

---

### Task 27: Cross-link between view and edit hostnames

**Files:**
- Modify: `src/ui/dropzone.ts`

- [ ] **Step 1: Locate the dropzone container**

Open `src/ui/dropzone.ts` and find where buttons/sample lists are appended to the dropzone element (likely a variable named `zone`, `dropzone`, or `el`).

- [ ] **Step 2: Append a small cross-link**

Add (substituting the actual variable name for the dropzone container):

```typescript
const isEditHost = location.hostname.startsWith('edit.')
const crossLink = document.createElement('a')
crossLink.className = 'cross-link'
crossLink.style.fontSize = '0.85rem'
crossLink.style.opacity = '0.6'
crossLink.style.marginTop = '1rem'
crossLink.style.display = 'inline-block'
if (isEditHost) {
  crossLink.textContent = 'View only? Open in the viewer'
  crossLink.href = `https://view.pilgrimapp.org/${location.search}`
} else {
  crossLink.textContent = 'Tend a file? Open in the editor'
  crossLink.href = `https://edit.pilgrimapp.org/${location.search}`
}
zone.appendChild(crossLink)   // ← swap `zone` for the actual dropzone variable
```

- [ ] **Step 3: Manual confirm**

`npm run dev` → drop zone shows "Tend a file? Open in the editor".

- [ ] **Step 4: Commit**

```bash
git add src/ui/dropzone.ts
git commit -m "feat(ui): cross-link between view and edit hostnames"
```

---

## Phase 7: End-to-end Tests

### Task 28: Fixture round-trip test

**Files:**
- Create: `tests/edit/integration.test.ts`

- [ ] **Step 1: Write the integration test**

Create `tests/edit/integration.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { parsePilgrim } from '../../src/parsers/pilgrim'
import { serializeTendedPilgrim } from '../../src/edit/save'
import type { Modification } from '../../src/parsers/types'

const KUMANO_PATH = resolve(__dirname, '../../samples/kumano-kodo.pilgrim')

function mkMod(op: Modification['op'], payload: unknown, walkId?: string): Modification {
  return { id: `m-${Math.random()}`, at: Date.now(), op, walkId, payload: payload as Modification['payload'] }
}

describe('integration — open, tend, save, re-parse', () => {
  it('archives a walk, edits an intention, saves, and the result re-parses cleanly', async () => {
    const buf = readFileSync(KUMANO_PATH).buffer.slice(0)
    const original = await parsePilgrim(buf as ArrayBuffer)
    expect(original.walks.length).toBeGreaterThan(1)
    const targetId = original.walks[0].id
    const editId = original.walks[1].id

    const result = await serializeTendedPilgrim({
      originalBuffer: buf as ArrayBuffer,
      manifest: original.manifest,
      rawWalks: original.rawWalks,
      modifications: [
        mkMod('archive_walk', {}, targetId),
        mkMod('edit_intention', { text: 'fresh start' }, editId),
      ],
      includeHistory: true,
      originalFilename: 'kumano-kodo.pilgrim',
    })

    const reBuf = await result.blob.arrayBuffer()
    const reParsed = await parsePilgrim(reBuf)

    expect(reParsed.walks.length).toBe(original.walks.length - 1)
    expect(reParsed.manifest.archivedCount).toBe(1)
    expect(reParsed.manifest.archived![0].id).toBe(targetId)

    const editedWalk = reParsed.walks.find(w => w.id === editId)
    expect(editedWalk).toBeDefined()
    expect(editedWalk!.intention).toBe('fresh start')

    expect(reParsed.manifest.modifications!.length).toBeGreaterThanOrEqual(2)
  })

  it('tend-a-tended-file: cumulative modifications log', async () => {
    const buf = readFileSync(KUMANO_PATH).buffer.slice(0)
    const first = await parsePilgrim(buf as ArrayBuffer)

    const r1 = await serializeTendedPilgrim({
      originalBuffer: buf as ArrayBuffer,
      manifest: first.manifest,
      rawWalks: first.rawWalks,
      modifications: [mkMod('edit_intention', { text: 'pass 1' }, first.walks[0].id)],
      includeHistory: true,
      originalFilename: 'kumano-kodo.pilgrim',
    })

    const buf2 = await r1.blob.arrayBuffer()
    const second = await parsePilgrim(buf2)

    const r2 = await serializeTendedPilgrim({
      originalBuffer: buf2,
      manifest: second.manifest,
      rawWalks: second.rawWalks,
      modifications: [mkMod('edit_intention', { text: 'pass 2' }, second.walks[0].id)],
      includeHistory: true,
      originalFilename: 'kumano-kodo-tended.pilgrim',
    })

    const buf3 = await r2.blob.arrayBuffer()
    const third = await parsePilgrim(buf3)

    expect(third.manifest.modifications!.length).toBeGreaterThanOrEqual(2)
    expect(third.walks[0].intention).toBe('pass 2')
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/edit/integration.test.ts`
Expected: PASS (both cases).

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/edit/integration.test.ts
git commit -m "test(edit): fixture round-trip + tend-a-tended-file integration"
```

---

### Task 29: Hostname-gate DOM test

**Files:**
- Create: `tests/edit/hostname-gate.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/edit/hostname-gate.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'

describe('mountEditLayer', () => {
  beforeEach(() => {
    while (document.body.firstChild) document.body.removeChild(document.body.firstChild)
    document.body.classList.remove('tend-on')
  })

  it('adds a Tend button to the header', async () => {
    const header = document.createElement('div')
    document.body.appendChild(header)
    const { mountEditLayer } = await import('../../src/edit/index')
    mountEditLayer(header, document.body)
    const button = header.querySelector('.tend-toggle')
    expect(button).not.toBeNull()
    expect(button!.textContent).toBe('Tend')
  })

  it('clicking Tend toggles the body class', async () => {
    const header = document.createElement('div')
    document.body.appendChild(header)
    const { mountEditLayer } = await import('../../src/edit/index')
    mountEditLayer(header, document.body)
    const button = header.querySelector<HTMLButtonElement>('.tend-toggle')!
    button.click()
    expect(document.body.classList.contains('tend-on')).toBe(true)
    expect(button.textContent).toBe('Done')
    button.click()
    expect(document.body.classList.contains('tend-on')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/edit/hostname-gate.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/edit/hostname-gate.test.ts
git commit -m "test(edit): mountEditLayer wires Tend toggle to body class"
```

---

## Phase 8: Cleanup & Deploy

### Task 30: README + deploy notes

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add an "Editor" section to the README**

Append to `README.md` after the existing "Try it" section:

```markdown
## Editor

The same codebase serves a redactor / pruner at **edit.pilgrimapp.org**. Drop a `.pilgrim` or `.gpx` file, click **Tend**, and:

- Archive whole walks (skeletal records preserve lifetime totals).
- Delete sections, photos, voice recordings, pauses, activity segments.
- Trim route start/end via map handles.
- Edit intention, reflection, and voice-transcription text.

All client-side; nothing uploaded. The editor is hostname-gated — the view bundle at `view.pilgrimapp.org` does not load any edit code.

Local development:

```bash
npm run dev
# View mode (default):
open http://localhost:5173/
# Edit mode (opt-in):
open http://localhost:5173/?edit=1
```

Deploy: identical to the viewer — same GitHub Action, tag-triggered. Add a CNAME for `edit.pilgrimapp.org` pointing at the same Pages site.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: editor README section + deploy notes"
```

---

### Task 31: Final test sweep + cleanup

- [ ] **Step 1: Run the whole test suite**

Run: `npx vitest run`
Expected: PASS (all tests).

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Run a production build**

Run: `npm run build`
Expected: PASS — Vite emits `dist/`. Inspect:

```bash
ls -la dist/assets/
```

A separate `edit-XXXX.js` chunk should appear (~15-30KB minified). If present, tree-shaking is working as intended.

- [ ] **Step 4: Smoke test in dev (both URLs)**

Run: `npm run dev`
- Visit `http://localhost:5173/` → no Tend button.
- Visit `http://localhost:5173/?edit=1` → Tend button appears.
- Drop a sample `.pilgrim`, click Tend, archive a walk, save.
- Re-drop the saved file → archive present in `manifest.json` (unzip and inspect).

- [ ] **Step 5: Final commit (no-op if nothing changed)**

```bash
git status
# If anything tweaked during smoke: git add ... && git commit -m "chore: final cleanup"
```

---

## Self-Review

I checked the plan against the spec and found these notes:

**Spec coverage:** Every spec section maps to a task:
- §Scope (in/out) → captured in plan header + task scoping
- §Architecture → Tasks 1-2, 25, 27
- §UX (Tend toggle, affordances, drawer, archive modal, save flow, JSON mode, live preview, empty/error) → Tasks 16, 17, 18, 19-22, 24, 25, 26, 27
- §Data Model (Modification, ArchivedWalk, applier, coalescence, parser defaults) → Tasks 1, 2, 3-4, 6, 8-10
- §Stats Recompute & Trim → Tasks 5, 7, 10
- §GPX Support → Tasks 13, 14
- §iOS Compatibility (`isUserModified`, schemaVersion 1.0, schema validation) → Tasks 8, 11, 12
- §Testing Plan → Tasks 3-12, 14, 28-29

**Placeholders:** No "TBD" or unspecified code blocks. Two implementer-judgement notes (Task 20 selectors, Task 23 trim-handle polish) are explicit pointers, not unfinished work.

**Type consistency:** `Modification`, `ModOp`, `ModPayload`, `ArchivedWalk`, `EditApi`, `Staging`, `AffordanceContext` are defined in Tasks 1, 3, 25 and reused consistently. `serializeTendedPilgrim` / `serializeTendedGpx` signatures match between Tasks 11, 14, 25.

**One known scope-deferred polish:** Task 23's trim-handle UX is functional but light — no faded-dashed-line preview of the trimmed-off portion (called out in the spec as a polish item). The task note flags this for the implementer; v1 ships without it.
