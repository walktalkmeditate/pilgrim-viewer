import type { Walk, Modification, DeletableSection } from '../parsers/types'
import { recomputeStats } from './recompute'

export function applyMods(walk: Walk, mods: Modification[]): Walk | null {
  if (mods.length === 0) return walk
  if (mods.some(m => m.op === 'archive_walk')) return null

  const replace = mods.find(m => m.op === 'replace_walk')
  if (replace) {
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
