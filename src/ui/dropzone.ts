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

  const samplesLabel = document.createElement('span')
  samplesLabel.className = 'dropzone-samples-label'
  samplesLabel.textContent = 'or try a sample:'

  samples.appendChild(samplesLabel)

  const sampleFiles = [
    { name: 'kumano-kodo.pilgrim', label: 'Kumano Kodo (5 days)' },
    { name: 'camino-santiago.pilgrim', label: 'Camino de Santiago (5 days)' },
    { name: 'shikoku-88.pilgrim', label: 'Shikoku 88 (4 days)' },
    { name: 'kumano-kodo.gpx', label: 'GPX only' },
  ]

  for (const sample of sampleFiles) {
    const link = document.createElement('button')
    link.className = 'dropzone-sample-link'
    link.textContent = sample.label
    link.addEventListener('click', async () => {
      try {
        const resp = await fetch(`${import.meta.env.BASE_URL}samples/${sample.name}`)
        if (!resp.ok) throw new Error('Failed to load sample')
        const buffer = await resp.arrayBuffer()
        onFile(sample.name, buffer)
      } catch {
        showError()
      }
    })
    samples.appendChild(link)
  }

  wrapper.appendChild(title)
  wrapper.appendChild(subtitle)
  wrapper.appendChild(button)
  wrapper.appendChild(input)
  wrapper.appendChild(samples)
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
