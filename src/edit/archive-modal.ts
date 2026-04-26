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
