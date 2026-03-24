const STORAGE_KEY = 'pilgrim-viewer-mapbox-token'

export function getMapboxToken(): string | null {
  const envToken = import.meta.env.VITE_MAPBOX_TOKEN
  if (envToken) return envToken as string

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return stored
  } catch {
    // localStorage not available (SSR, privacy mode)
  }

  return null
}

export function saveMapboxToken(token: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, token)
  } catch {
    // localStorage not available
  }
}

export function renderTokenPrompt(
  container: HTMLElement,
  onToken: (token: string) => void
): void {
  const wrapper = document.createElement('div')
  wrapper.className = 'token-prompt'

  const heading = document.createElement('h2')
  heading.textContent = 'Mapbox Token Required'
  wrapper.appendChild(heading)

  const desc = document.createElement('p')
  desc.textContent = 'To display maps, you need a Mapbox access token. Get one free at mapbox.com, then paste it below.'
  wrapper.appendChild(desc)

  const input = document.createElement('input')
  input.type = 'text'
  input.placeholder = 'pk.your_mapbox_token'
  wrapper.appendChild(input)

  const button = document.createElement('button')
  button.textContent = 'Save Token'
  button.addEventListener('click', () => {
    const token = input.value.trim()
    if (token) {
      saveMapboxToken(token)
      onToken(token)
    }
  })
  wrapper.appendChild(button)

  container.appendChild(wrapper)
}
