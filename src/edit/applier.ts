import type { Walk, Modification, DeletableSection } from '../parsers/types'
import { recomputeStats } from './recompute'
import { trimRouteSeparately } from '../parsers/route-trim'

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

export function applyMods(walk: Walk, mods: Modification[]): Walk | null {
  if (mods.length === 0) return walk
  if (mods.some(m => m.op === 'archive_walk')) return null

  const replace = mods.find(m => m.op === 'replace_walk')
  if (replace) {
    const replaced = (replace.payload as { walk: Walk }).walk
    return { ...replaced, isUserModified: true }
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

  if (changed) {
    next = { ...next, isUserModified: true, stats: recomputeStats(next, walk.stats) }
  }

  return next
}
