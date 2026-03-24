function toRad(deg: number): number {
  return deg * Math.PI / 180
}

export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// coords: [[lon, lat, alt?], ...] — GeoJSON order
export function totalDistance(coords: number[][]): number {
  let sum = 0
  for (let i = 1; i < coords.length; i++) {
    sum += haversineDistance(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0])
  }
  return sum
}

// Ignores elevation changes smaller than threshold to filter GPS noise.
export function elevationGain(
  elevations: number[],
  threshold = 2
): { ascent: number; descent: number } {
  let ascent = 0
  let descent = 0
  for (let i = 1; i < elevations.length; i++) {
    const diff = elevations[i] - elevations[i - 1]
    if (diff > threshold) ascent += diff
    else if (diff < -threshold) descent += Math.abs(diff)
  }
  return { ascent, descent }
}
