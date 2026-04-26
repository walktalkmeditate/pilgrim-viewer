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
