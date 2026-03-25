import type { Walk } from '../parsers/types'
import type { UnitSystem } from '../parsers/units'
import type { BorderTheme } from '../map/border'
import type mapboxgl from 'mapbox-gl'
import { generateKeepsakeImage, generateFilename, triggerDownload } from '../map/export'

const THEMES: Array<{ id: BorderTheme; color: string; label: string }> = [
  { id: 'gold', color: '#C4956A', label: 'Gold' },
  { id: 'silver', color: '#A8B4C0', label: 'Silver' },
  { id: 'sepia', color: '#B89878', label: 'Sepia' },
  { id: 'forest', color: '#7A9B6F', label: 'Forest' },
]

export function showKeepsakeModal(
  map: mapboxgl.Map,
  statsText: string,
  walks: Walk[],
  unit: UnitSystem,
  selectedYear: number | null,
  initialTheme: BorderTheme = 'gold',
): void {
  let currentTheme = initialTheme
  let currentDataUrl: string | null = null
  let generating = false

  const overlay = document.createElement('div')
  overlay.className = 'keepsake-overlay'

  const modal = document.createElement('div')
  modal.className = 'keepsake-modal'

  const preview = document.createElement('div')
  preview.className = 'keepsake-preview'

  const img = document.createElement('img')
  img.className = 'keepsake-image'
  img.alt = 'Keepsake preview'
  preview.appendChild(img)

  const spinner = document.createElement('div')
  spinner.className = 'keepsake-spinner'
  spinner.textContent = 'Generating...'
  preview.appendChild(spinner)

  const controls = document.createElement('div')
  controls.className = 'keepsake-controls'

  const themeRow = document.createElement('div')
  themeRow.className = 'keepsake-themes'

  for (const t of THEMES) {
    const swatch = document.createElement('button')
    swatch.className = `keepsake-swatch${t.id === currentTheme ? ' active' : ''}`
    swatch.style.setProperty('--swatch-color', t.color)
    swatch.title = t.label
    swatch.addEventListener('click', () => {
      if (generating) return
      currentTheme = t.id
      for (const s of themeRow.querySelectorAll('.keepsake-swatch')) s.classList.remove('active')
      swatch.classList.add('active')
      generate()
    })
    themeRow.appendChild(swatch)
  }

  const btnRow = document.createElement('div')
  btnRow.className = 'keepsake-buttons'

  const saveBtn = document.createElement('button')
  saveBtn.className = 'keepsake-save'
  saveBtn.textContent = 'Save'
  saveBtn.disabled = true
  saveBtn.addEventListener('click', () => {
    if (!currentDataUrl) return
    const filename = generateFilename(selectedYear, walks)
    triggerDownload(currentDataUrl, filename)
  })

  const closeBtn = document.createElement('button')
  closeBtn.className = 'keepsake-close'
  closeBtn.textContent = 'Close'
  closeBtn.addEventListener('click', close)

  btnRow.appendChild(saveBtn)
  btnRow.appendChild(closeBtn)

  controls.appendChild(themeRow)
  controls.appendChild(btnRow)

  modal.appendChild(preview)
  modal.appendChild(controls)
  overlay.appendChild(modal)
  document.body.appendChild(overlay)

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close()
  })

  function close(): void {
    overlay.remove()
  }

  async function generate(): Promise<void> {
    if (generating) return
    generating = true
    spinner.style.display = 'flex'
    img.style.opacity = '0.3'
    saveBtn.disabled = true

    try {
      currentDataUrl = await generateKeepsakeImage(map, statsText, walks, unit, currentTheme)
      img.src = currentDataUrl
      img.style.opacity = '1'
      saveBtn.disabled = false
    } catch (err) {
      console.warn('Keepsake generation failed:', err)
      spinner.textContent = 'Failed to generate'
    } finally {
      generating = false
      spinner.style.display = 'none'
    }
  }

  generate()
}
