/**
 * Haversine distance for optional clock-in geofence checks (WGS84).
 */

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const r1 = (lat1 * Math.PI) / 180;
  const r2 = (lat2 * Math.PI) / 180;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(r1) * Math.cos(r2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

export type GeofenceConfig = {
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
};

export function isInsideGeofence(
  punchLat: number,
  punchLng: number,
  fence: GeofenceConfig,
): boolean {
  const d = haversineMeters(punchLat, punchLng, fence.centerLat, fence.centerLng);
  return d <= fence.radiusMeters;
}
