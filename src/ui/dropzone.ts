import { createRouteAnimation } from './route-animation'

const VALID_EXTENSIONS = ['.pilgrim', '.gpx']

const QUOTES = [
  'The cedar trees here must be hundreds of years old',
  'Met a Korean woman who has been walking for 30 days',
  'I put my hand on the stone wall and it is warm',
  'The path changes every time because you change',
  'The whole country is whispering the way',
  'The water is so loud it fills your chest',
]

const QUOTE_INTERVAL_MS = 20_000
const QUOTE_FADE_MS = 800

function hasValidExtension(filename: string): boolean {
  return VALID_EXTENSIONS.some((ext) => filename.toLowerCase().endsWith(ext))
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}

function createQuoteRotator(container: HTMLElement): { stop: () => void } {
  const el = document.createElement('p')
  el.className = 'dropzone-quote'
  let index = 0
  el.textContent = QUOTES[index]
  container.appendChild(el)

  let timeoutId = 0

  const intervalId = setInterval(() => {
    el.classList.add('fading')

    timeoutId = window.setTimeout(() => {
      index = (index + 1) % QUOTES.length
      el.textContent = QUOTES[index]
      el.classList.remove('fading')
    }, QUOTE_FADE_MS)
  }, QUOTE_INTERVAL_MS)

  return {
    stop(): void {
      clearInterval(intervalId)
      clearTimeout(timeoutId)
    },
  }
}

export function createDropZone(
  container: HTMLElement,
  onFile: (name: string, buffer: ArrayBuffer) => void,
): { openFilePicker: () => void; stop: () => void } {
  const wrapper = document.createElement('div')
  wrapper.className = 'dropzone'

  let animation: { stop: () => void } | null = null

  const staffMark = document.createElement('div')
  staffMark.className = 'dropzone-staff'
  // Walking staff SVG — safe: static constant
  staffMark.innerHTML = '<svg viewBox="0 0 32 64" width="16" height="32"><path d="M14 4 C16 20, 18 40, 20 60" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><circle cx="13.5" cy="3" r="1.5" fill="currentColor"/></svg>' // eslint-disable-line

  const title = document.createElement('h1')
  title.className = 'dropzone-title'
  title.textContent = 'Pilgrim Viewer'

  const subtitle = document.createElement('p')
  subtitle.className = 'dropzone-subtitle'
  subtitle.textContent = 'See your walks. Your data stays with you.'

  const button = document.createElement('button')
  button.className = 'dropzone-button'
  button.textContent = 'Choose File'

  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.pilgrim,.gpx'
  input.className = 'dropzone-input'

  const errorMsg = document.createElement('p')
  errorMsg.className = 'dropzone-error'
  errorMsg.textContent = 'Please use a .pilgrim or .gpx file'

  const samples = document.createElement('div')
  samples.className = 'dropzone-samples'

  const samplesLabel = document.createElement('div')
  samplesLabel.className = 'dropzone-samples-label'
  samplesLabel.textContent = 'or try a sample — same route, see the difference:'

  samples.appendChild(samplesLabel)

  const samplePairs = [
    { route: 'Kumano Kodo, 5 days', gpx: 'kumano-kodo.gpx', pilgrim: 'kumano-kodo.pilgrim' },
    { route: 'Camino de Santiago, 5 days', gpx: 'camino-santiago.gpx', pilgrim: 'camino-santiago.pilgrim' },
    { route: 'Shikoku 88, 4 days', gpx: 'shikoku-88.gpx', pilgrim: 'shikoku-88.pilgrim' },
  ]

  function stopAnimations(): void {
    if (animation) animation.stop()
    quoteRotator.stop()
  }

  async function loadSample(filename: string): Promise<void> {
    try {
      const resp = await fetch(`${import.meta.env.BASE_URL}samples/${filename}`)
      if (!resp.ok) throw new Error('Failed to load sample')
      const buffer = await resp.arrayBuffer()
      stopAnimations()
      onFile(filename, buffer)
    } catch {
      showError()
    }
  }

  for (const pair of samplePairs) {
    const row = document.createElement('div')
    row.className = 'dropzone-sample-row'

    const routeName = document.createElement('span')
    routeName.className = 'dropzone-sample-route'
    routeName.textContent = pair.route

    const gpxLink = document.createElement('button')
    gpxLink.className = 'dropzone-sample-link dropzone-sample-gpx'
    gpxLink.textContent = '.gpx'
    gpxLink.addEventListener('click', () => { void loadSample(pair.gpx) })

    const pilgrimLink = document.createElement('button')
    pilgrimLink.className = 'dropzone-sample-link dropzone-sample-pilgrim'
    pilgrimLink.textContent = '.pilgrim'
    pilgrimLink.addEventListener('click', () => { void loadSample(pair.pilgrim) })

    row.appendChild(routeName)
    row.appendChild(gpxLink)
    row.appendChild(pilgrimLink)
    samples.appendChild(row)
  }

  const githubLink = document.createElement('a')
  githubLink.className = 'dropzone-github'
  githubLink.href = 'https://github.com/walktalkmeditate/pilgrim-viewer'
  githubLink.setAttribute('aria-label', 'View source on GitHub')
  // GitHub Invertocat mark — safe: static SVG string, no user content
  githubLink.innerHTML = '<svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>' // eslint-disable-line

  wrapper.appendChild(staffMark)
  wrapper.appendChild(title)
  wrapper.appendChild(subtitle)
  wrapper.appendChild(button)
  wrapper.appendChild(input)
  wrapper.appendChild(errorMsg)
  wrapper.appendChild(samples)

  const quoteRotator = createQuoteRotator(wrapper)

  wrapper.appendChild(githubLink)

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
  wrapper.appendChild(crossLink)

  container.appendChild(wrapper)

  animation = createRouteAnimation(wrapper)

  function showError(): void {
    errorMsg.classList.add('visible')
  }

  function hideError(): void {
    errorMsg.classList.remove('visible')
  }

  async function processFile(file: File): Promise<void> {
    if (!hasValidExtension(file.name)) {
      showError()
      return
    }
    hideError()
    try {
      const buffer = await readFileAsArrayBuffer(file)
      stopAnimations()
      onFile(file.name, buffer)
    } catch {
      showError()
    }
  }

  button.addEventListener('click', () => input.click())

  input.addEventListener('change', () => {
    const file = input.files?.[0]
    if (file) {
      void processFile(file)
    }
  })

  const controller = new AbortController()
  const signal = controller.signal

  container.addEventListener('dragover', (e) => {
    e.preventDefault()
    wrapper.classList.add('drag-active')
  }, { signal })

  container.addEventListener('dragleave', () => {
    wrapper.classList.remove('drag-active')
  }, { signal })

  container.addEventListener('drop', (e) => {
    e.preventDefault()
    wrapper.classList.remove('drag-active')
    const file = e.dataTransfer?.files[0]
    if (file) {
      void processFile(file)
    }
  }, { signal })

  return {
    openFilePicker: () => input.click(),
    stop: () => {
      stopAnimations()
      controller.abort()
    },
  }
}
