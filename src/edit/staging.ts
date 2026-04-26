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

export function createStaging(): Staging {
  const mods: Modification[] = []
  const listeners = new Set<() => void>()

  function notify(): void {
    for (const l of listeners) l()
  }

  return {
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
