export type LatLngLike = { lat: number; lng: number }

function toRad(deg: number) {
  return (deg * Math.PI) / 180
}

// Great-circle distance using the Haversine formula.
export function distanceMeters(a: LatLngLike, b: LatLngLike) {
  const R = 6371e3 // earth radius in meters

  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)

  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)

  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
  return R * c
}

