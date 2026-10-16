import { splitWalkByCover, type CoveredLinkwayIndex } from "./coveredLinkways";
import { decodePolyline } from "./polyline";
import type { Leg, Route } from "./types";

/** Subset of OneMap `routeType=pt` response we rely on (OpenTripPlanner-shaped). */
export interface OneMapPtLeg {
  mode: string; // WALK | BUS | SUBWAY | TRAM | RAIL
  startTime: number; // epoch ms
  endTime: number; // epoch ms
  route?: string;
  routeShortName?: string;
  routeLongName?: string;
  legGeometry: { points: string };
}
export interface OneMapPtItinerary {
  duration: number; // seconds
  legs: OneMapPtLeg[];
}
/** OneMap public-transport modes: mixed, bus-only, or rail-only. */
export type PtMode = "TRANSIT" | "BUS" | "RAIL";

export interface OneMapPtResponse {
  plan?: { itineraries?: OneMapPtItinerary[] };
}

/** Subset of OneMap `routeType=walk|drive` response. */
export interface OneMapDirectResponse {
  route_geometry?: string;
  route_summary?: { total_time: number; total_distance: number };
}

const TRAIN_MODES = new Set(["SUBWAY", "TRAM", "RAIL"]);
const minutesBetween = (startMs: number, endMs: number) => Math.max(0, (endMs - startMs) / 60_000);

/** Walking is Exposed, except stretches along a covered linkway, which are Covered. */
function walkLegs(path: Leg["path"], minutes: number, index: CoveredLinkwayIndex): Leg[] {
  const runs = splitWalkByCover(path, index);
  const totalMetres = runs.reduce((s, r) => s + r.metres, 0);
  if (runs.length === 0 || totalMetres === 0) return [{ mode: "walk", tier: "exposed", minutes, path, label: "Walk" }];
  return runs.map((r) => ({
    mode: "walk",
    tier: r.covered ? "covered" : "exposed",
    minutes: (minutes * r.metres) / totalMetres,
    path: r.path,
    label: r.covered ? "Walk (covered linkway)" : "Walk",
  }));
}

function lineName(leg: OneMapPtLeg): string {
  if (leg.mode === "BUS") return `Bus ${leg.routeShortName ?? leg.route ?? ""}`.trim();
  // OneMap returns train line names in capitals, e.g. "NORTH SOUTH LINE".
  const name = leg.routeLongName ?? leg.route ?? "Train";
  return name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function routeFromPtItinerary(it: OneMapPtItinerary, id: string, index: CoveredLinkwayIndex): Route {
  const legs: Leg[] = [];
  const rides: string[] = [];
  let prevEnd: number | null = null;
  for (const l of it.legs) {
    const path = decodePolyline(l.legGeometry.points);
    const ride = l.mode === "BUS" ? "bus" : TRAIN_MODES.has(l.mode) ? "train" : null;
    // Waiting to board: bus stops are roofed but open-air (Covered); MRT/LRT stations are treated as enclosed (Protected).
    if (ride && prevEnd !== null && l.startTime > prevEnd) {
      const waitMin = minutesBetween(prevEnd, l.startTime);
      if (waitMin >= 0.5) {
        legs.push({
          mode: "wait",
          tier: ride === "bus" ? "covered" : "protected",
          minutes: waitMin,
          path: path.slice(0, 1),
          label: `Wait for ${lineName(l)}`,
        });
      }
    }
    const minutes = minutesBetween(l.startTime, l.endTime);
    if (ride) {
      legs.push({ mode: ride, tier: "protected", minutes, path, label: lineName(l) });
      rides.push(lineName(l));
    } else {
      legs.push(...walkLegs(path, minutes, index));
    }
    prevEnd = l.endTime;
  }
  return { id, summary: rides.length ? rides.join(" → ") : "Walk", legs };
}

export function routeFromWalk(res: OneMapDirectResponse, id: string, index: CoveredLinkwayIndex): Route | null {
  if (!res.route_geometry || !res.route_summary) return null;
  const path = decodePolyline(res.route_geometry);
  return { id, summary: "Walk", legs: walkLegs(path, res.route_summary.total_time / 60, index) };
}

/**
 * Merge itineraries from several OneMap mode queries, keeping the first of any that ride the
 * same sequence of services (walking differences alone don't make a distinct Route).
 */
export function mergeItineraries(groups: OneMapPtItinerary[][]): OneMapPtItinerary[] {
  const seen = new Set<string>();
  const out: OneMapPtItinerary[] = [];
  for (const it of groups.flat()) {
    const key = it.legs.filter((l) => l.mode !== "WALK").map((l) => `${l.mode}:${l.route ?? ""}`).join(">") || "WALK";
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}
