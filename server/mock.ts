import { distanceMetres } from "../src/domain/geo";
import type { OneMapDirectResponse, OneMapPtItinerary, OneMapPtResponse } from "../src/domain/onemapRoutes";
import { encodePolyline } from "../src/domain/polyline";
import type { LatLng } from "../src/domain/types";

/**
 * Synthetic OneMap-shaped responses for local development without a OneMap account.
 * Geometry is straight-line interpolation; the UI flags results as mock.
 */
const WALK_M_PER_MIN = 80;
const BUS_M_PER_MIN = 300;
const TRAIN_M_PER_MIN = 600;
const DRIVE_M_PER_MIN = 500;
const MIN = 60_000;

const lerp = (a: LatLng, b: LatLng, t: number): LatLng => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const line = (a: LatLng, b: LatLng, steps = 8): LatLng[] => Array.from({ length: steps + 1 }, (_, i) => lerp(a, b, i / steps));

export function mockWalk(start: LatLng, end: LatLng): OneMapDirectResponse {
  const m = distanceMetres(start, end) * 1.25;
  return { route_geometry: encodePolyline(line(start, end, 20)), route_summary: { total_time: (m / WALK_M_PER_MIN) * 60, total_distance: m } };
}

export function mockDrive(start: LatLng, end: LatLng): OneMapDirectResponse {
  const m = distanceMetres(start, end) * 1.3;
  return { route_geometry: encodePolyline(line(start, end, 20)), route_summary: { total_time: (m / DRIVE_M_PER_MIN) * 60 + 180, total_distance: m } };
}

type Stage = { mode: "WALK" | "BUS" | "SUBWAY"; to: number; name?: string; waitMin?: number };

function itinerary(start: LatLng, end: LatLng, when: Date, stages: Stage[]): OneMapPtItinerary {
  let t = when.getTime();
  let from = 0;
  const legs = stages.map((s) => {
    t += (s.waitMin ?? 0) * MIN;
    const a = lerp(start, end, from);
    const b = lerp(start, end, s.to);
    const speed = s.mode === "WALK" ? WALK_M_PER_MIN : s.mode === "BUS" ? BUS_M_PER_MIN : TRAIN_M_PER_MIN;
    const minutes = Math.max(1, distanceMetres(a, b) / speed);
    const leg = {
      mode: s.mode,
      startTime: t,
      endTime: t + minutes * MIN,
      routeShortName: s.mode === "BUS" ? s.name : undefined,
      routeLongName: s.mode === "SUBWAY" ? s.name : undefined,
      legGeometry: { points: encodePolyline(line(a, b)) },
    };
    t = leg.endTime;
    from = s.to;
    return leg;
  });
  return { duration: (t - when.getTime()) / 1000, legs };
}

export function mockPublicTransport(start: LatLng, end: LatLng, when: Date): OneMapPtResponse {
  if (distanceMetres(start, end) < 800) return { plan: { itineraries: [] } };
  return {
    plan: {
      itineraries: [
        itinerary(start, end, when, [
          { mode: "WALK", to: 0.06 },
          { mode: "SUBWAY", to: 0.92, name: "North South Line", waitMin: 3 },
          { mode: "WALK", to: 1 },
        ]),
        itinerary(start, end, when, [
          { mode: "WALK", to: 0.03 },
          { mode: "BUS", to: 0.97, name: "190", waitMin: 7 },
          { mode: "WALK", to: 1 },
        ]),
        itinerary(start, end, when, [
          { mode: "WALK", to: 0.25 },
          { mode: "SUBWAY", to: 1, name: "Circle Line", waitMin: 2 },
        ]),
      ],
    },
  };
}
