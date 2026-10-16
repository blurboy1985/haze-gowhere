import type { CoveredLinkwayIndex } from "../src/domain/coveredLinkways";
import { avoidanceStrength } from "../src/domain/haze";
import { decodePolyline } from "../src/domain/polyline";
import { routeFromPtItinerary, routeFromWalk, type OneMapDirectResponse, type OneMapPtResponse } from "../src/domain/onemapRoutes";
import { rankRoutes, tripBand } from "../src/domain/ranking";
import type { HazeReading, LatLng, Route, RoutesResponse } from "../src/domain/types";

/** Taxi Suggestion appears from this Trip Band upwards. */
const TAXI_FROM_BAND = 3;

export interface RouteSource {
  walk(start: LatLng, end: LatLng): Promise<OneMapDirectResponse>;
  drive(start: LatLng, end: LatLng): Promise<OneMapDirectResponse>;
  publicTransport(start: LatLng, end: LatLng, when: Date): Promise<OneMapPtResponse>;
}

export interface TripRequest {
  start: LatLng;
  end: LatLng;
  alwaysMinimise: boolean;
  when: Date;
}

export async function planTrip(
  req: TripRequest,
  source: RouteSource,
  haze: HazeReading,
  linkways: CoveredLinkwayIndex,
  mock: boolean,
): Promise<RoutesResponse> {
  const [walkRes, ptRes] = await Promise.allSettled([
    source.walk(req.start, req.end),
    source.publicTransport(req.start, req.end, req.when),
  ]);
  if (walkRes.status === "rejected" && ptRes.status === "rejected") throw walkRes.reason;

  const candidates: Route[] = [];
  if (walkRes.status === "fulfilled") {
    const walk = routeFromWalk(walkRes.value, "walk", linkways);
    if (walk) candidates.push(walk);
  }
  if (ptRes.status === "fulfilled") {
    (ptRes.value.plan?.itineraries ?? []).forEach((it, i) => candidates.push(routeFromPtItinerary(it, `pt-${i}`, linkways)));
  }

  const band = tripBand(candidates, req.start, req.end, haze.regions);
  const routes = rankRoutes(candidates, band, req.alwaysMinimise);

  let taxi: RoutesResponse["taxi"] = null;
  if (band >= TAXI_FROM_BAND) {
    try {
      const drive = await source.drive(req.start, req.end);
      if (drive.route_geometry && drive.route_summary) {
        taxi = { minutes: drive.route_summary.total_time / 60, path: decodePolyline(drive.route_geometry) };
      }
    } catch (err) {
      console.warn("[taxi] drive routing failed", err);
    }
  }

  return { tripBand: band, avoidanceStrength: avoidanceStrength(band, req.alwaysMinimise), routes, taxi, haze, mock };
}
