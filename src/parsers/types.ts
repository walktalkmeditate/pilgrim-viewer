export interface WalkStats {
  distance: number
  activeDuration: number
  pauseDuration: number
  ascent: number
  descent: number
  steps?: number
  burnedEnergy?: number
  talkDuration: number
  meditateDuration: number
}

export interface Weather {
  temperature: number
  condition: string
  humidity?: number
  windSpeed?: number
}

export interface Reflection {
  style?: string
  text?: string
}

export interface VoiceRecording {
  startDate: Date
  endDate: Date
  duration: number
  transcription?: string
  wordsPerMinute?: number
  isEnhanced?: boolean
}

export interface Activity {
  type: 'walk' | 'talk' | 'meditate'
  startDate: Date
  endDate: Date
}

export interface Pause {
  startDate: Date
  endDate: Date
  type: string
}

export interface LunarPhase {
  name: string
  illumination: number
  age: number
  isWaxing: boolean
}

export interface PlanetaryPosition {
  planet: string
  sign: string
  degree: number
  isRetrograde: boolean
}

export interface PlanetaryHour {
  planet: string
  planetaryDay: string
}

export interface ElementBalance {
  fire: number
  earth: number
  air: number
  water: number
  dominant?: string
}

export interface CelestialContext {
  lunarPhase: LunarPhase
  planetaryPositions: PlanetaryPosition[]
  planetaryHour: PlanetaryHour
  elementBalance: ElementBalance
  seasonalMarker?: string
  zodiacSystem: string
}

export interface GeoJSONProperties {
  timestamps?: number[]
  speeds?: number[]
  directions?: number[]
  horizontalAccuracies?: number[]
  verticalAccuracies?: number[]
  markerType?: string
  label?: string
  icon?: string
  timestamp?: number
}

export interface GeoJSONGeometry {
  type: string
  coordinates: number[][] | number[]
}

export interface GeoJSONFeature {
  type: 'Feature'
  geometry: GeoJSONGeometry
  properties: GeoJSONProperties
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection'
  features: GeoJSONFeature[]
}

export interface WalkPhoto {
  localIdentifier: string
  capturedAt: Date
  lat: number
  lng: number
  url: string
}

export interface Walk {
  id: string
  startDate: Date
  endDate: Date
  stats: WalkStats
  route: GeoJSONFeatureCollection
  weather?: Weather
  intention?: string
  reflection?: Reflection
  voiceRecordings: VoiceRecording[]
  activities: Activity[]
  pauses: Pause[]
  celestial?: CelestialContext
  favicon?: string
  photos?: WalkPhoto[]
  source: 'pilgrim' | 'gpx'
}

export interface PilgrimPreferences {
  distanceUnit: string
  altitudeUnit: string
  speedUnit: string
  energyUnit: string
}

export interface PilgrimManifest {
  schemaVersion: string
  exportDate: number
  appVersion: string
  walkCount: number
  preferences: PilgrimPreferences
}
