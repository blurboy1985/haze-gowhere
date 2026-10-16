import { avoidanceStrength, nearestRegion } from "./haze";
import type { LatLng, Pm25Band, RankedRoute, RegionReading, Route, RouteTotals } from "./types";

/** Covered air is still haze; it only earns a small discount over Exposed. */
const COVERED_WEIGHT = 0.25;
/** Routes slower than this multiple of the fastest are dropped. */
const MAX_SLOWDOWN = 2;
const MAX_ROUTES = 3;

export function routeTotals(route: Route): RouteTotals {
  const t: RouteTotals = { totalMinutes: 0, exposedMinutes: 0, coveredMinutes: 0, protectedMinutes: 0 };
  for (const leg of route.legs) {
    t.totalMinutes += leg.minutes;
    if (leg.tier === "exposed") t.exposedMinutes += leg.minutes;
    else if (leg.tier === "covered") t.coveredMinutes += leg.minutes;
    else t.protectedMinutes += leg.minutes;
  }
  return t;
}

export function exposureCost(t: RouteTotals, strength: number): number {
  return t.totalMinutes + strength * t.exposedMinutes + strength * COVERED_WEIGHT * t.coveredMinutes;
}

/** Worst PM2.5 Band across the Starting Point, Destination, and the ends of every Exposed Leg of the candidate Routes. */
export function tripBand(routes: Route[], start: LatLng, end: LatLng, regions: RegionReading[]): Pm25Band {
  const points: LatLng[] = [start, end];
  for (const r of routes) {
    for (const leg of r.legs) {
      if (leg.tier !== "exposed" || leg.path.length === 0) continue;
      points.push(leg.path[0]!, leg.path[leg.path.length - 1]!);
    }
  }
  let worst: Pm25Band = 1;
  for (const p of points) {
    const band = nearestRegion(p, regions).band;
    if (band > worst) worst = band;
  }
  return worst;
}

export function rankRoutes(routes: Route[], band: Pm25Band, alwaysMinimise: boolean): RankedRoute[] {
  if (routes.length === 0) return [];
  const strength = avoidanceStrength(band, alwaysMinimise);
  const withTotals = routes.map((r) => ({ ...r, ...routeTotals(r) }));
  const fastest = Math.min(...withTotals.map((r) => r.totalMinutes));
  return withTotals
    .filter((r) => r.totalMinutes <= fastest * MAX_SLOWDOWN)
    .map((r) => ({ ...r, exposureCost: exposureCost(r, strength), recommended: false }))
    .sort((a, b) => a.exposureCost - b.exposureCost || a.totalMinutes - b.totalMinutes)
    .slice(0, MAX_ROUTES)
    .map((r, i) => ({ ...r, recommended: i === 0 }));
}
