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
