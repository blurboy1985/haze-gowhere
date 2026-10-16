import { splitWalkByCover, type CoveredLinkwayIndex } from "./coveredLinkways";
import { INDOOR_WALK_M_PER_MIN, inIndoorBbox, type IndoorGraph } from "./indoorGraph";
import type { Leg, Route } from "./types";

/** The stop end snaps to an Indoor Link this close (inside the station for trains; an open-air walk from a bus stop). */
const STATION_SNAP_M = 150;
/** The other end (street address, mall) must be this close to the walking network. */
const PLACE_SNAP_M = 60;
/** An Indoor Variant is only offered if it saves at least this many Exposed minutes on the replaced walk. */
const MIN_EXPOSED_SAVING_MIN = 1;

const exposedMinutes = (legs: Leg[]) => legs.reduce((s, l) => s + (l.tier === "exposed" ? l.minutes : 0), 0);
const minutesFor = (metres: number) => metres / INDOOR_WALK_M_PER_MIN;

/**
 * Re-route the walk between a station and the place next to it over the indoor graph.
 * `stationAtEnd`: true for the first walk (ends at the boarding stop), false for the last walk (starts at the alighting stop).
 * `enclosedStop`: true when the stop is an (underground) train station, so the hop to the Indoor Link is Protected;
 * a bus stop is open-air, so that hop is Exposed.
 */
function indoorWalk(
  run: Leg[],
  stationAtEnd: boolean,
  enclosedStop: boolean,
  graph: IndoorGraph,
  linkways: CoveredLinkwayIndex,
): { legs: Leg[]; names: string[] } | null {
  const first = run[0]?.path[0];
  const lastLeg = run[run.length - 1];
  const last = lastLeg?.path[lastLeg.path.length - 1];
  if (!first || !last) return null;
  const station = stationAtEnd ? last : first;
  const place = stationAtEnd ? first : last;
  if (!inIndoorBbox(station) || !inIndoorBbox(place)) return null;

  const s = graph.snap(station, STATION_SNAP_M, true);
  const p = graph.snap(place, PLACE_SNAP_M);
  if (!s || !p || s.node === p.node) return null;
  const runs = stationAtEnd ? graph.route(p.node, s.node) : graph.route(s.node, p.node);
  if (!runs) return null;

  const legs: Leg[] = [];
  const names: string[] = [];
  const stationHop: Leg = enclosedStop
    ? { mode: "walk", tier: "protected", minutes: minutesFor(s.metres), path: [station, graph.nodes[s.node]!], label: "Walk inside station" }
    : { mode: "walk", tier: "exposed", minutes: minutesFor(s.metres), path: [station, graph.nodes[s.node]!], label: "Walk" };
  const placeHop: Leg = { mode: "walk", tier: "exposed", minutes: minutesFor(p.metres), path: [place, graph.nodes[p.node]!], label: "Walk" };
  // Hops are built station→node and place→node; flip whichever one walks toward its end point.
  if (stationAtEnd) stationHop.path.reverse(); // ... → node → station
  else placeHop.path.reverse(); // ... → node → place

  if (!stationAtEnd && s.metres > 0) legs.push(stationHop);
  if (stationAtEnd && p.metres > 0) legs.push(placeHop);
  for (const r of runs) {
    if (r.tier === "protected") {
      const shown = r.names.filter((n) => !n.endsWith("(connector)")).slice(0, 3);
      const label = shown.length ? `Walk via ${shown.join(", ")} (indoor)` : "Walk (indoor)";
      legs.push({ mode: "walk", tier: "protected", minutes: minutesFor(r.metres), path: r.path, label });
      for (const n of r.names) if (!names.includes(n)) names.push(n);
    } else if (r.tier === "covered") {
      legs.push({ mode: "walk", tier: "covered", minutes: minutesFor(r.metres), path: r.path, label: "Walk (covered)" });
    } else {
      // OSM marks it open; the LTA linkway layer may still put a roof over parts of it.
      for (const piece of splitWalkByCover(r.path, linkways))
        legs.push({ mode: "walk", tier: piece.covered ? "covered" : "exposed", minutes: minutesFor(piece.metres), path: piece.path, label: piece.covered ? "Walk (covered linkway)" : "Walk" });
    }
  }
  if (stationAtEnd && s.metres > 0) legs.push(stationHop);
  if (!stationAtEnd && p.metres > 0) legs.push(placeHop);
  return { legs, names };
}

/**
 * Indoor Variants (ADR 0002): for each public-transport Route, a copy whose first and/or last walk goes through
 * CBD Indoor Links, when that saves Exposed time. Walk-only Routes are left alone.
 */
export function indoorVariants(routes: Route[], graph: IndoorGraph, linkways: CoveredLinkwayIndex): Route[] {
  const variants: Route[] = [];
  for (const route of routes) {
    const rideIdx = route.legs.map((l, i) => (l.mode === "walk" ? -1 : i)).filter((i) => i >= 0);
    if (rideIdx.length === 0) continue;
    const firstRide = rideIdx[0]!;
    const lastRide = rideIdx[rideIdx.length - 1]!;
    const lead = route.legs.slice(0, firstRide);
    const middle = route.legs.slice(firstRide, lastRide + 1);
    const trail = route.legs.slice(lastRide + 1);

    let changed = false;
    const indoorLinks: string[] = [];
    // The ride next to each walk decides whether its stop is enclosed (train) or open-air (bus).
    const boardRide = route.legs.slice(firstRide).find((l) => l.mode === "bus" || l.mode === "train");
    const alightRide = route.legs[lastRide]!;
    const pick = (run: Leg[], stationAtEnd: boolean): Leg[] => {
      if (run.length === 0) return run;
      const ride = stationAtEnd ? boardRide : alightRide;
      const alt = indoorWalk(run, stationAtEnd, ride?.mode === "train", graph, linkways);
      if (!alt || exposedMinutes(alt.legs) > exposedMinutes(run) - MIN_EXPOSED_SAVING_MIN) return run;
      changed = true;
      for (const n of alt.names) if (!indoorLinks.includes(n)) indoorLinks.push(n);
      return alt.legs;
    };
    const legs = [...pick(lead, true), ...middle, ...pick(trail, false)];
    if (changed) variants.push({ id: `${route.id}-indoor`, summary: `${route.summary} · indoor link`, legs, indoorLinks });
  }
  return variants;
}

/** Indoor Links are only used while malls and CityLink are open: 06:00 to 23:00 Singapore time. */
export function indoorLinksOpen(when: Date): boolean {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", hour: "2-digit", hourCycle: "h23" }).format(when));
  return hour >= 6 && hour < 23;
}

