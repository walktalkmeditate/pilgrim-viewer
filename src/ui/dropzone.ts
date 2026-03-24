const VALID_EXTENSIONS = ['.pilgrim', '.gpx']

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

export function createDropZone(
  container: HTMLElement,
  onFile: (name: string, buffer: ArrayBuffer) => void,
): { openFilePicker: () => void } {
  const wrapper = document.createElement('div')
  wrapper.className = 'dropzone'

  const title = document.createElement('h1')
  title.className = 'dropzone-title'
  title.textContent = 'Pilgrim Viewer'

  const subtitle = document.createElement('p')
  subtitle.className = 'dropzone-subtitle'
  subtitle.textContent = 'Drop .pilgrim or .gpx file to view'

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

  async function loadSample(filename: string): Promise<void> {
    try {
      const resp = await fetch(`${import.meta.env.BASE_URL}samples/${filename}`)
      if (!resp.ok) throw new Error('Failed to load sample')
      const buffer = await resp.arrayBuffer()
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

  const privacy = document.createElement('p')
  privacy.className = 'dropzone-privacy'
  privacy.textContent = 'Your data stays on your device. Nothing is uploaded.'

  wrapper.appendChild(title)
  wrapper.appendChild(subtitle)
  wrapper.appendChild(button)
  wrapper.appendChild(input)
  wrapper.appendChild(samples)
  wrapper.appendChild(privacy)
  wrapper.appendChild(errorMsg)
  container.appendChild(wrapper)

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

  container.addEventListener('dragover', (e) => {
    e.preventDefault()
    wrapper.classList.add('drag-active')
  })

  container.addEventListener('dragleave', () => {
    wrapper.classList.remove('drag-active')
  })

  container.addEventListener('drop', (e) => {
    e.preventDefault()
    wrapper.classList.remove('drag-active')
    const file = e.dataTransfer?.files[0]
    if (file) {
      void processFile(file)
    }
  })

  return {
    openFilePicker: () => input.click(),
  }
}
