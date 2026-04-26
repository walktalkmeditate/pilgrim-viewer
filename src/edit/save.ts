import JSZip from 'jszip'
import { XMLParser, XMLBuilder } from 'fast-xml-parser'
import type { Modification, PilgrimManifest, ArchivedWalk } from '../parsers/types'
import { walkToArchived } from './archive'
import { applyMods } from './applier'
import { parsePilgrimWalkJSON } from '../parsers/pilgrim'
import { haversineDistance } from '../parsers/geo'

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
      Object.keys(obj).forEach(k => delete obj[k])
      Object.assign(obj, (m.payload as { walk: Record<string, unknown> }).walk)
      changed = true
      return obj
    }
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

  // Re-extract the ORIGINAL manifest as a raw object. The viewer's
  // PilgrimManifest type drops fields the iOS importer requires
  // (customPromptStyles, intentions, events, plus 3 preferences
  // sub-fields). Spreading from `manifest` would lose them and break
  // the iOS reimport — Codable rejects on missing required fields and
  // silently drops the walk on a per-walk decode failure. We use the
  // raw original as the base and overlay only the fields we change.
  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) throw new Error('Original .pilgrim is missing manifest.json')
  const rawManifest = JSON.parse(await manifestFile.async('text')) as Record<string, unknown>
  void manifest  // typed view used by callers; raw is what we serialize from

  const archivedIds = modsArchivingWalk(modifications)
  const existingArchived = Array.isArray(rawManifest.archived) ? (rawManifest.archived as ArchivedWalk[]) : []
  const newArchived: ArchivedWalk[] = [...existingArchived]
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

  const existingMods = Array.isArray(rawManifest.modifications) ? (rawManifest.modifications as Modification[]) : []
  const newMods = includeHistory ? [...existingMods, ...modifications] : []

  // Build the new manifest from the RAW original so iOS-required
  // fields (customPromptStyles, intentions, events, full preferences)
  // round-trip intact. Override only the fields we manage.
  const newManifest: Record<string, unknown> = {
    ...rawManifest,
    schemaVersion: '1.0',
    walkCount: activeCount,
    archivedCount: newArchived.length,
    archived: newArchived,
    modifications: newMods,
  }

  zip.file('manifest.json', JSON.stringify(newManifest))

  validatePilgrimManifest(newManifest)

  const blob = await zip.generateAsync({ type: 'blob' })
  return { blob, filename: tendedFilename(originalFilename) }
}

// Mirrors the strict Codable contract of iOS's PilgrimManifest in
// `pilgrim-ios/.../PilgrimPackageModels.swift`. ALL fields required;
// missing or wrong-typed → Swift JSONDecoder throws → iOS importer
// rejects the file. Run on every save to fail loudly here instead of
// silently producing an unimportable file.
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
  for (const key of ['distanceUnit', 'altitudeUnit', 'speedUnit', 'energyUnit', 'zodiacSystem']) {
    if (typeof p[key] !== 'string') {
      throw new Error(`manifest.preferences.${key} must be a string`)
    }
  }
  for (const key of ['celestialAwareness', 'beginWithIntention']) {
    if (typeof p[key] !== 'boolean') {
      throw new Error(`manifest.preferences.${key} must be a boolean`)
    }
  }
  // Top-level array fields iOS Codable requires (non-optional in Swift).
  for (const key of ['customPromptStyles', 'intentions', 'events']) {
    if (!Array.isArray(m[key])) {
      throw new Error(`manifest.${key} must be an array (iOS Codable rejects missing/non-array)`)
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
    // Walk every <trkseg> across every <trk> in document order so we can
    // identify the absolute first and last segments. Per-segment trim
    // would over-trim multi-segment GPX (a 5-segment route with a 200m
    // start trim becomes 5 × 200 = 1000m chopped, and the joins between
    // segments break too). Instead: apply startMeters to the first seg
    // only, endMeters to the last seg only.
    const allSegs: Record<string, unknown>[] = []
    const trks = asArray(gpx.trk as Record<string, unknown> | Record<string, unknown>[] | undefined)
    for (const trk of trks) {
      const segs = asArray(trk.trkseg as Record<string, unknown> | Record<string, unknown>[] | undefined)
      for (const seg of segs) allSegs.push(seg)
    }
    if (allSegs.length === 1) {
      // Single segment — both trims act on the same point list.
      const only = allSegs[0]
      const trkpts = asArray(only.trkpt as Record<string, unknown> | Record<string, unknown>[] | undefined)
      only.trkpt = trimTrkpts(trkpts, startMeters, endMeters)
    } else if (allSegs.length > 1) {
      const first = allSegs[0]
      const last = allSegs[allSegs.length - 1]
      const firstTrkpts = asArray(first.trkpt as Record<string, unknown> | Record<string, unknown>[] | undefined)
      first.trkpt = trimTrkpts(firstTrkpts, startMeters, 0)
      const lastTrkpts = asArray(last.trkpt as Record<string, unknown> | Record<string, unknown>[] | undefined)
      last.trkpt = trimTrkpts(lastTrkpts, 0, endMeters)
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
