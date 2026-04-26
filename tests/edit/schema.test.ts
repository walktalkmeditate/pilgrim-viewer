// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { validatePilgrimManifest } from '../../src/edit/save'

describe('validatePilgrimManifest — iOS schema invariants', () => {
  it('accepts a manifest with all required fields', () => {
    const m = {
      schemaVersion: '1.0',
      exportDate: 1745000000,
      appVersion: '1.0.0',
      walkCount: 0,
      preferences: { distanceUnit: 'km', altitudeUnit: 'm', speedUnit: 'min/km', energyUnit: 'kcal' },
    }
    expect(() => validatePilgrimManifest(m)).not.toThrow()
  })

  it('rejects schemaVersion other than "1.0"', () => {
    const m = {
      schemaVersion: '2.0', exportDate: 0, appVersion: '1.0.0', walkCount: 0,
      preferences: { distanceUnit: 'km', altitudeUnit: 'm', speedUnit: 'min/km', energyUnit: 'kcal' },
    }
    expect(() => validatePilgrimManifest(m)).toThrow(/schemaVersion/)
  })

  it('rejects missing required field', () => {
    const m = { exportDate: 0, appVersion: '1.0.0', walkCount: 0,
      preferences: { distanceUnit: 'km', altitudeUnit: 'm', speedUnit: 'min/km', energyUnit: 'kcal' } }
    expect(() => validatePilgrimManifest(m)).toThrow()
  })

  it('rejects non-string distanceUnit', () => {
    const m = {
      schemaVersion: '1.0', exportDate: 0, appVersion: '1.0.0', walkCount: 0,
      preferences: { distanceUnit: 5, altitudeUnit: 'm', speedUnit: 'min/km', energyUnit: 'kcal' },
    }
    expect(() => validatePilgrimManifest(m)).toThrow()
  })

  it('tolerates additive editor fields (archived, modifications, archivedCount)', () => {
    const m = {
      schemaVersion: '1.0', exportDate: 0, appVersion: '1.0.0', walkCount: 0,
      preferences: { distanceUnit: 'km', altitudeUnit: 'm', speedUnit: 'min/km', energyUnit: 'kcal' },
      archived: [], archivedCount: 0, modifications: [],
    }
    expect(() => validatePilgrimManifest(m)).not.toThrow()
  })
})
