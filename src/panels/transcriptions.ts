import type { Walk } from '../parsers/types'

function formatRelativeTime(walkStart: Date, recordingStart: Date): string {
  const diffSeconds = Math.round((recordingStart.getTime() - walkStart.getTime()) / 1000)
  const minutes = Math.floor(diffSeconds / 60)
  const seconds = diffSeconds % 60
  return `at ${minutes}m ${seconds}s`
}

export function renderTranscriptionsPanel(container: HTMLElement, walk: Walk): void {
  if (!walk.voiceRecordings || walk.voiceRecordings.length === 0) return

  const withTranscriptions = walk.voiceRecordings.filter((r) => r.transcription)
  if (withTranscriptions.length === 0) return

  const panel = document.createElement('div')
  panel.className = 'panel'

  const heading = document.createElement('h2')
  heading.className = 'panel-heading'
  heading.textContent = 'Transcriptions'
  panel.appendChild(heading)

  const list = document.createElement('div')
  list.className = 'transcriptions-list'

  for (const recording of withTranscriptions) {
    const entry = document.createElement('div')
    entry.className = 'transcription-entry'

    const timeEl = document.createElement('div')
    timeEl.className = 'transcription-time'
    timeEl.textContent = formatRelativeTime(walk.startDate, recording.startDate)
    entry.appendChild(timeEl)

    const textEl = document.createElement('div')
    textEl.className = 'transcription-text'
    textEl.textContent = recording.transcription!
    entry.appendChild(textEl)

    if (recording.isEnhanced) {
      const enhancedEl = document.createElement('span')
      enhancedEl.className = 'transcription-enhanced'
      enhancedEl.textContent = '(enhanced)'
      entry.appendChild(enhancedEl)
    }

    list.appendChild(entry)
  }

  panel.appendChild(list)
  container.appendChild(panel)
}
