import type { Walk } from '../parsers/types'
import type { UnitSystem } from '../parsers/units'
import type { BorderTheme } from '../map/border'
import type mapboxgl from 'mapbox-gl'
import { generateKeepsakeImage, generateFilename, generateVideoFilename, triggerDownload, triggerBlobDownload } from '../map/export'
import { generateKeepsakeVideo } from '../map/keepsake-animator'
import type { VideoResult } from '../map/keepsake-animator'

const THEMES: Array<{ id: BorderTheme; color: string; label: string }> = [
  { id: 'gold', color: '#C4956A', label: 'Gold' },
  { id: 'silver', color: '#A8B4C0', label: 'Silver' },
  { id: 'sepia', color: '#B89878', label: 'Sepia' },
  { id: 'forest', color: '#7A9B6F', label: 'Forest' },
]

const HAS_MEDIA_RECORDER = typeof MediaRecorder !== 'undefined'

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
  let currentVideo: VideoResult | null = null
  let currentVideoUrl: string | null = null
  let generating = false
  let mode: 'image' | 'moment' = 'image'
  let abortController: AbortController | null = null

  const overlay = document.createElement('div')
  overlay.className = 'keepsake-overlay'

  const modal = document.createElement('div')
  modal.className = 'keepsake-modal'
  modal.setAttribute('role', 'dialog')
  modal.setAttribute('aria-modal', 'true')

  const preview = document.createElement('div')
  preview.className = 'keepsake-preview'

  const img = document.createElement('img')
  img.className = 'keepsake-image'
  img.alt = 'Keepsake preview'
  preview.appendChild(img)

  const video = document.createElement('video')
  video.className = 'keepsake-video'
  video.autoplay = true
  video.loop = true
  video.muted = true
  video.playsInline = true
  video.style.display = 'none'
  preview.appendChild(video)

  const spinner = document.createElement('div')
  spinner.className = 'keepsake-spinner'
  spinner.textContent = 'Generating...'
  preview.appendChild(spinner)

  const controls = document.createElement('div')
  controls.className = 'keepsake-controls'

  const modeToggle = document.createElement('div')
  modeToggle.className = 'keepsake-mode-toggle'

  const imageBtn = document.createElement('button')
  imageBtn.className = 'keepsake-mode-btn active'
  imageBtn.textContent = 'Image'
  imageBtn.addEventListener('click', () => switchMode('image'))

  const momentBtn = document.createElement('button')
  momentBtn.className = 'keepsake-mode-btn'
  momentBtn.textContent = 'Moment'
  if (!HAS_MEDIA_RECORDER) {
    momentBtn.disabled = true
    momentBtn.title = 'Video recording not supported in this browser'
  }
  momentBtn.addEventListener('click', () => switchMode('moment'))

  modeToggle.appendChild(imageBtn)
  modeToggle.appendChild(momentBtn)

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
  saveBtn.textContent = 'Save Image'
  saveBtn.disabled = true
  saveBtn.addEventListener('click', save)

  const closeBtn = document.createElement('button')
  closeBtn.className = 'keepsake-close'
  closeBtn.textContent = 'Close'
  closeBtn.addEventListener('click', close)

  btnRow.appendChild(saveBtn)
  btnRow.appendChild(closeBtn)

  controls.appendChild(modeToggle)
  controls.appendChild(themeRow)
  controls.appendChild(btnRow)

  modal.appendChild(preview)
  modal.appendChild(controls)
  overlay.appendChild(modal)
  document.body.appendChild(overlay)

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close()
  })

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') close()
  }
  document.addEventListener('keydown', onKeydown)

  function switchMode(newMode: 'image' | 'moment'): void {
    if (generating || mode === newMode) return
    mode = newMode
    imageBtn.classList.toggle('active', mode === 'image')
    momentBtn.classList.toggle('active', mode === 'moment')
    saveBtn.textContent = mode === 'image' ? 'Save Image' : 'Save Moment'
    generate()
  }

  function save(): void {
    if (mode === 'image' && currentDataUrl) {
      triggerDownload(currentDataUrl, generateFilename(selectedYear, walks))
    } else if (mode === 'moment' && currentVideo) {
      triggerBlobDownload(currentVideo.blob, generateVideoFilename(selectedYear, walks, currentVideo.mimeType))
    }
  }

  function close(): void {
    if (abortController) abortController.abort()
    document.removeEventListener('keydown', onKeydown)
    if (currentVideoUrl) URL.revokeObjectURL(currentVideoUrl)
    overlay.remove()
  }

  async function generate(): Promise<void> {
    if (generating) return
    generating = true
    if (abortController) abortController.abort()
    spinner.style.display = 'flex'
    spinner.textContent = mode === 'moment' ? 'Generating moment...' : 'Generating...'
    saveBtn.disabled = true

    img.style.display = mode === 'image' ? '' : 'none'
    video.style.display = mode === 'moment' ? '' : 'none'
    if (mode === 'image') img.style.opacity = '0.3'

    try {
      if (mode === 'image') {
        currentDataUrl = await generateKeepsakeImage(map, statsText, walks, unit, currentTheme)
        img.src = currentDataUrl
        img.style.opacity = '1'
      } else {
        abortController = new AbortController()
        const result = await generateKeepsakeVideo(map, statsText, walks, unit, currentTheme, abortController.signal)
        abortController = null
        if (currentVideoUrl) URL.revokeObjectURL(currentVideoUrl)
        currentVideo = result
        currentVideoUrl = URL.createObjectURL(result.blob)
        video.src = currentVideoUrl
      }
      saveBtn.disabled = false
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      console.warn('Keepsake generation failed:', err)
      spinner.textContent = 'Failed to generate'
      return
    } finally {
      generating = false
      spinner.style.display = 'none'
    }
  }

  generate()
}
