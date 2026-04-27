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
    default: {
      const _exhaustive: never = mod.op
      return `Unknown change (${_exhaustive})`
    }
  }
}

export interface DrawerCallbacks {
  // Returning a Promise lets the drawer disable the save button until
  // the save settles. main.ts wires this to wait for either
  // `pilgrim-edit-saved` or `pilgrim-edit-save-failed` so a slow zip
  // generation (large files with photos) can't be re-triggered by a
  // panicked second click.
  onSave: (includeHistory: boolean) => void | Promise<void>
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

  const SAVE_LABEL = 'Save tended file'
  const saveBtn = document.createElement('button')
  saveBtn.className = 'staging-drawer-save'
  saveBtn.textContent = SAVE_LABEL
  let saving = false
  saveBtn.addEventListener('click', async () => {
    if (saving) return
    saving = true
    saveBtn.disabled = true
    saveBtn.textContent = 'Saving…'
    try {
      await callbacks.onSave(historyCheckbox.checked)
    } finally {
      saving = false
      saveBtn.disabled = false
      saveBtn.textContent = SAVE_LABEL
    }
  })

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
