// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { validatePilgrimManifest } from '../../src/edit/save'

// Helper: a manifest with every iOS-required field correctly populated.
// Tests then mutate to break ONE field at a time.
function validIosManifest(): Record<string, unknown> {
  return {
    schemaVersion: '1.0',
    exportDate: 1745000000,
    appVersion: '1.0.0',
    walkCount: 0,
    preferences: {
      distanceUnit: 'km',
      altitudeUnit: 'm',
      speedUnit: 'min/km',
      energyUnit: 'kcal',
      celestialAwareness: true,
      zodiacSystem: 'tropical',
      beginWithIntention: true,
    },
    customPromptStyles: [],
    intentions: [],
    events: [],
  }
}

describe('validatePilgrimManifest — iOS schema invariants', () => {
  it('accepts a manifest with all iOS-required fields', () => {
    expect(() => validatePilgrimManifest(validIosManifest())).not.toThrow()
  })

  it('rejects schemaVersion other than "1.0"', () => {
    const m = { ...validIosManifest(), schemaVersion: '2.0' }
    expect(() => validatePilgrimManifest(m)).toThrow(/schemaVersion/)
  })

  it('rejects missing exportDate', () => {
    const m = validIosManifest()
    delete m.exportDate
    expect(() => validatePilgrimManifest(m)).toThrow(/exportDate/)
  })

  it('rejects non-string distanceUnit', () => {
    const m = validIosManifest()
    ;(m.preferences as Record<string, unknown>).distanceUnit = 5
    expect(() => validatePilgrimManifest(m)).toThrow(/distanceUnit/)
  })

  // iOS-required fields the viewer's PilgrimManifest type drops on parse.
  // Validator must catch their absence so we don't ship unimportable files.

  it('rejects missing customPromptStyles', () => {
    const m = validIosManifest()
    delete m.customPromptStyles
    expect(() => validatePilgrimManifest(m)).toThrow(/customPromptStyles/)
  })

  it('rejects missing intentions', () => {
    const m = validIosManifest()
    delete m.intentions
    expect(() => validatePilgrimManifest(m)).toThrow(/intentions/)
  })

  it('rejects missing events', () => {
    const m = validIosManifest()
    delete m.events
    expect(() => validatePilgrimManifest(m)).toThrow(/events/)
  })

  it('rejects non-boolean celestialAwareness', () => {
    const m = validIosManifest()
    ;(m.preferences as Record<string, unknown>).celestialAwareness = 'true'
    expect(() => validatePilgrimManifest(m)).toThrow(/celestialAwareness/)
  })

  it('rejects missing zodiacSystem', () => {
    const m = validIosManifest()
    delete (m.preferences as Record<string, unknown>).zodiacSystem
    expect(() => validatePilgrimManifest(m)).toThrow(/zodiacSystem/)
  })

  it('rejects missing beginWithIntention', () => {
    const m = validIosManifest()
    delete (m.preferences as Record<string, unknown>).beginWithIntention
    expect(() => validatePilgrimManifest(m)).toThrow(/beginWithIntention/)
  })

  it('tolerates additive editor fields (archived, modifications, archivedCount)', () => {
    const m = { ...validIosManifest(), archived: [], archivedCount: 0, modifications: [] }
    expect(() => validatePilgrimManifest(m)).not.toThrow()
  })
})
