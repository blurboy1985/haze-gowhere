import { splitWalkByCover, type CoveredLinkwayIndex } from "./coveredLinkways";
import { isOpenAirStation } from "./openAirStations";
import { decodePolyline } from "./polyline";
import type { Leg, Route } from "./types";

export interface OneMapPtStop {
  name?: string;
  stopCode?: string;
}

/** Subset of OneMap `routeType=pt` response we rely on (OpenTripPlanner-shaped). */
export interface OneMapPtLeg {
  mode: string; // WALK | BUS | SUBWAY | TRAM | RAIL
  startTime: number; // epoch ms
  endTime: number; // epoch ms
  distance?: number; // metres
  route?: string;
  routeShortName?: string;
  routeLongName?: string;
  /** Boarding stop; stopCode is the station code for trains, e.g. "NS16" or "BP6". */
  from?: OneMapPtStop;
  /** Alighting stop. */
  to?: OneMapPtStop;
  /** Intermediate stops passed along the ride. */
  intermediateStops?: OneMapPtStop[];
  numIntermediateStops?: number;
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

function titleCaseStop(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(Mrt|Lrt|Int|Blk|Opp|Bef|Aft|Stn)\b/g, (m) => (m.toLowerCase() === "mrt" || m.toLowerCase() === "lrt" ? m.toUpperCase() : m));
}

export function formatStop(stop?: OneMapPtStop): string | undefined {
  const rawName = stop?.name?.trim();
  const code = stop?.stopCode?.trim();
  if (rawName && /^(origin|destination)$/i.test(rawName)) return undefined;
  const cleanedName = rawName
    ? titleCaseStop(rawName).replace(/\s+(MRT|LRT)\s+Station$/i, "")
    : undefined;
  if (cleanedName && code && code !== "NIL") return `${cleanedName} (${code})`;
  if (cleanedName) return cleanedName;
  if (code && code !== "NIL") return code;
  return undefined;
}

/** Walking is Exposed, except stretches along a covered linkway, which are Covered. */
function walkLegs(path: Leg["path"], minutes: number, index: CoveredLinkwayIndex, explicitMetres?: number): Leg[] {
  const runs = splitWalkByCover(path, index);
  const totalMetres = runs.reduce((s, r) => s + r.metres, 0);
  if (runs.length === 0 || totalMetres === 0) {
    const dist = explicitMetres && explicitMetres > 0 ? Math.round(explicitMetres) : undefined;
    return [{ mode: "walk", tier: "exposed", minutes, path, label: "Walk", ...(dist ? { distanceMetres: dist } : {}) }];
  }
  const scale = explicitMetres && explicitMetres > 0 ? explicitMetres / totalMetres : 1;
  return runs.map((r) => ({
    mode: "walk",
    tier: r.covered ? "covered" : "exposed",
    minutes: (minutes * r.metres) / totalMetres,
    path: r.path,
    label: r.covered ? "Walk (covered linkway)" : "Walk",
    distanceMetres: Math.max(1, Math.round(r.metres * scale)),
  }));
}

function lineName(leg: OneMapPtLeg): string {
  if (leg.mode === "BUS") return `Bus ${leg.routeShortName ?? leg.route ?? ""}`.trim();
  // OneMap returns train line names in capitals, e.g. "NORTH SOUTH LINE".
  const name = leg.routeLongName ?? leg.route ?? "Train";
  return name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function ptLineCode(leg: OneMapPtLeg): string | undefined {
  const short = (leg.routeShortName ?? leg.route ?? "").trim().toUpperCase();
  if (leg.mode === "BUS") return short || undefined;
  if (/^[A-Z]{2,3}$/.test(short)) return short;
  const stopPrefix = leg.from?.stopCode?.trim().match(/^([A-Z]{2,3})\d+$/)?.[1];
  return stopPrefix;
}

export function routeFromPtItinerary(it: OneMapPtItinerary, id: string, index: CoveredLinkwayIndex): Route {
  const legs: Leg[] = [];
  const rides: string[] = [];
  let prevEnd: number | null = null;
  for (const l of it.legs) {
    const path = decodePolyline(l.legGeometry.points);
    const ride = l.mode === "BUS" ? "bus" : TRAIN_MODES.has(l.mode) ? "train" : null;
    const fromStop = formatStop(l.from);
    const toStop = formatStop(l.to);
    // Waiting to board: bus stops and elevated/at-grade platforms are roofed but open-air (Covered);
    // underground stations are enclosed (Protected).
    if (ride && prevEnd !== null && l.startTime > prevEnd) {
      const waitMin = minutesBetween(prevEnd, l.startTime);
      if (waitMin >= 0.5) {
        const openAir = ride === "bus" || isOpenAirStation(l.from?.stopCode);
        legs.push({
          mode: "wait",
          tier: openAir ? "covered" : "protected",
          minutes: waitMin,
          path: path.slice(0, 1),
          label: `Wait for ${lineName(l)}`,
          ...(fromStop ? { fromStop } : {}),
        });
      }
    }
    const minutes = minutesBetween(l.startTime, l.endTime);
    if (ride) {
      const stopCount =
        l.intermediateStops !== undefined
          ? l.intermediateStops.length + 1
          : l.numIntermediateStops !== undefined
            ? l.numIntermediateStops + 1
            : undefined;
      const lineCode = ptLineCode(l);
      legs.push({
        mode: ride,
        tier: "protected",
        minutes,
        path,
        label: lineName(l),
        ...(fromStop ? { fromStop } : {}),
        ...(toStop ? { toStop } : {}),
        ...(stopCount && stopCount > 0 ? { stopCount } : {}),
        ...(lineCode ? { lineCode } : {}),
      });
      rides.push(lineName(l));
    } else {
      const wLegs = walkLegs(path, minutes, index, l.distance);
      if (fromStop && wLegs[0]) wLegs[0].fromStop = fromStop;
      if (toStop && wLegs[wLegs.length - 1]) wLegs[wLegs.length - 1]!.toStop = toStop;
      legs.push(...wLegs);
    }
    prevEnd = l.endTime;
  }
  const firstStart = it.legs[0]?.startTime;
  const lastEnd = it.legs[it.legs.length - 1]?.endTime;
  return {
    id,
    summary: rides.length ? rides.join(" → ") : "Walk",
    legs,
    ...(firstStart && firstStart > 0 ? { departureTime: firstStart } : {}),
    ...(lastEnd && lastEnd > 0 ? { arrivalTime: lastEnd } : {}),
  };
}

export function routeFromWalk(res: OneMapDirectResponse, id: string, index: CoveredLinkwayIndex): Route | null {
  if (!res.route_geometry || !res.route_summary) return null;
  const path = decodePolyline(res.route_geometry);
  return {
    id,
    summary: "Walk",
    legs: walkLegs(path, res.route_summary.total_time / 60, index, res.route_summary.total_distance),
  };
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
