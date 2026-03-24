export type UnitSystem = 'metric' | 'imperial'

const METERS_PER_MILE = 1609.344
const METERS_PER_FOOT = 0.3048

export function formatDistance(meters: number, unit: UnitSystem = 'metric'): string {
  if (unit === 'imperial') {
    const miles = meters / METERS_PER_MILE
    return `${miles.toFixed(2)} mi`
  }

  if (meters < 1000) {
    return `${Math.round(meters)} m`
  }

  const km = meters / 1000
  return `${km.toFixed(2)} km`
}

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds)
  if (total >= 3600) {
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    return `${hours}h ${minutes}m`
  }

  const minutes = Math.floor(total / 60)
  const remainingSeconds = total % 60
  return `${minutes}m ${remainingSeconds}s`
}

export function formatElevation(meters: number, unit: UnitSystem = 'metric'): string {
  if (unit === 'imperial') {
    const feet = Math.round(meters / METERS_PER_FOOT)
    return `${feet} ft`
  }

  return `${Math.round(meters)} m`
}

export function formatSpeed(meters: number, seconds: number, unit: UnitSystem = 'metric'): string {
  if (meters === 0 || seconds === 0) {
    return '--'
  }

  if (unit === 'imperial') {
    const miles = meters / METERS_PER_MILE
    const secondsPerMile = seconds / miles
    const minutes = Math.floor(secondsPerMile / 60)
    const remainingSeconds = Math.round(secondsPerMile % 60)
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')} /mi`
  }

  const km = meters / 1000
  const secondsPerKm = seconds / km
  const minutes = Math.floor(secondsPerKm / 60)
  const remainingSeconds = Math.round(secondsPerKm % 60)
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')} /km`
}
