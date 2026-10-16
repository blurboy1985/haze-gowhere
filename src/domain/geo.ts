import type { LatLng } from "./types";

const EARTH_RADIUS_M = 6_371_000;
const toRad = (d: number) => (d * Math.PI) / 180;

export function distanceMetres(a: LatLng, b: LatLng): number {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function pathLengthMetres(path: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += distanceMetres(path[i - 1]!, path[i]!);
  return total;
}

/** Distance from p to segment ab, using a local flat projection (fine at Singapore's scale). */
export function distanceToSegmentMetres(p: LatLng, a: LatLng, b: LatLng): number {
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos(toRad(p[0]));
  const ax = (a[1] - p[1]) * mPerDegLng;
  const ay = (a[0] - p[0]) * mPerDegLat;
  const bx = (b[1] - p[1]) * mPerDegLng;
  const by = (b[0] - p[0]) * mPerDegLat;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

export function midpoint(a: LatLng, b: LatLng): LatLng {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}
