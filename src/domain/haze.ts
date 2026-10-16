import { distanceMetres } from "./geo";
import type { LatLng, Pm25Band, RegionReading } from "./types";

/** NEA 1-hr PM2.5 bands (µg/m³): ≤55 Normal, 56–150 Elevated, 151–250 High, ≥251 Very High. */
export function pm25Band(pm25: number): Pm25Band {
  if (pm25 <= 55) return 1;
  if (pm25 <= 150) return 2;
  if (pm25 <= 250) return 3;
  return 4;
}

export const BAND_DESCRIPTOR: Record<Pm25Band, string> = {
  1: "Normal",
  2: "Elevated",
  3: "High",
  4: "Very High",
};

export function psiDescriptor(psi: number): string {
  if (psi <= 50) return "Good";
  if (psi <= 100) return "Moderate";
  if (psi <= 200) return "Unhealthy";
  if (psi <= 300) return "Very Unhealthy";
  return "Hazardous";
}

const AVOIDANCE_BY_BAND: Record<Pm25Band, number> = { 1: 0, 2: 1, 3: 3, 4: 6 };
export const MAX_AVOIDANCE = AVOIDANCE_BY_BAND[4];

/** Minutes of extra travel accepted to save one Exposed minute. */
export function avoidanceStrength(band: Pm25Band, alwaysMinimise: boolean): number {
  return alwaysMinimise ? MAX_AVOIDANCE : AVOIDANCE_BY_BAND[band];
}

/** NEA publishes only a label point per region, so the nearest label stands in for region membership. */
export function nearestRegion(point: LatLng, regions: RegionReading[]): RegionReading {
  let best = regions[0];
  if (!best) throw new Error("No region readings");
  let bestDist = distanceMetres(point, best.label);
  for (const r of regions.slice(1)) {
    const d = distanceMetres(point, r.label);
    if (d < bestDist) {
      best = r;
      bestDist = d;
    }
  }
  return best;
}
