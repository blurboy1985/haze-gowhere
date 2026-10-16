import { describe, expect, it } from "vitest";
import { CoveredLinkwayIndex, linesFromGeoJson, splitWalkByCover } from "./coveredLinkways";
import { avoidanceStrength, nearestRegion, pm25Band } from "./haze";
import { mergeItineraries, routeFromPtItinerary, routeFromWalk, type OneMapPtItinerary } from "./onemapRoutes";
import { decodePolyline, encodePolyline } from "./polyline";
import { rankRoutes, routeTotals, tripBand } from "./ranking";
import type { LatLng, RegionReading, Route } from "./types";

const regions: RegionReading[] = [
  { region: "north", label: [1.41803, 103.82], psi24: 156, pm25: 66, band: 2 },
  { region: "south", label: [1.29587, 103.82], psi24: 181, pm25: 117, band: 2 },
  { region: "east", label: [1.35735, 103.94], psi24: 195, pm25: 113, band: 2 },
  { region: "west", label: [1.35735, 103.7], psi24: 198, pm25: 125, band: 2 },
  { region: "central", label: [1.35735, 103.82], psi24: 219, pm25: 180, band: 3 },
];

describe("polyline", () => {
  it("decodes Google's reference example", () => {
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ]);
  });
  it("round-trips", () => {
    const pts: LatLng[] = [[1.30398, 103.83212], [1.30081, 103.84521]];
    expect(decodePolyline(encodePolyline(pts))).toEqual(pts);
  });
});

describe("haze", () => {
  it("bands PM2.5 per NEA thresholds", () => {
    expect([55, 56, 150, 151, 250, 251].map(pm25Band)).toEqual([1, 2, 2, 3, 3, 4]);
  });
  it("sets avoidance strength by band, maxed when always minimising", () => {
    expect([1, 2, 3, 4].map((b) => avoidanceStrength(b as 1, false))).toEqual([0, 1, 3, 6]);
    expect(avoidanceStrength(1, true)).toBe(6);
  });
  it("picks the nearest region label", () => {
    expect(nearestRegion([1.44, 103.79], regions).region).toBe("north"); // Woodlands
    expect(nearestRegion([1.33, 103.95], regions).region).toBe("east"); // Bedok
  });
});

describe("covered linkways", () => {
  // A linkway running east along lat 1.30000 from lng 103.8000 to 103.8010 (~110 m).
  const index = new CoveredLinkwayIndex([[[1.3, 103.8], [1.3, 103.801]]]);

  it("treats a walk along the linkway as covered and a walk away from it as not", () => {
    const runs = splitWalkByCover(
      [[1.30005, 103.8], [1.30005, 103.801], [1.302, 103.801]],
      index,
    );
    expect(runs.map((r) => r.covered)).toEqual([true, false]);
  });

  it("treats a point inside a wide covered area as covered even far from its edges", () => {
    // ~110 m square canopy: its centre is ~55 m from every edge, beyond the outline tolerance.
    const square: LatLng[] = [[1.3, 103.8], [1.3, 103.801], [1.301, 103.801], [1.301, 103.8], [1.3, 103.8]];
    const outlineOnly = new CoveredLinkwayIndex([square]);
    const withArea = new CoveredLinkwayIndex([square], [square]);
    expect(outlineOnly.isCovered([1.3005, 103.8005])).toBe(false);
    expect(withArea.isCovered([1.3005, 103.8005])).toBe(true);
    expect(withArea.isCovered([1.3030, 103.8005])).toBe(false);
  });

  it("reads GeoJSON lines as [lat, lng]", () => {
    const lines = linesFromGeoJson({
      type: "FeatureCollection",
      features: [{ geometry: { type: "LineString", coordinates: [[103.8, 1.3], [103.801, 1.3]] } }],
    });
    expect(lines).toEqual([[[1.3, 103.8], [1.3, 103.801]]]);
  });
});

describe("OneMap itinerary → Route", () => {
  const t0 = Date.UTC(2026, 9, 16, 13, 0);
  const min = 60_000;
  const itinerary: OneMapPtItinerary = {
    duration: 25 * 60,
    legs: [
      { mode: "WALK", startTime: t0, endTime: t0 + 5 * min, legGeometry: { points: encodePolyline([[1.3, 103.8], [1.302, 103.8]]) } },
      { mode: "BUS", routeShortName: "7", startTime: t0 + 9 * min, endTime: t0 + 15 * min, legGeometry: { points: encodePolyline([[1.302, 103.8], [1.31, 103.81]]) } },
      { mode: "SUBWAY", routeLongName: "NORTH SOUTH LINE", startTime: t0 + 17 * min, endTime: t0 + 25 * min, legGeometry: { points: encodePolyline([[1.31, 103.81], [1.33, 103.84]]) } },
    ],
  };

  it("tiers legs: walk Exposed, bus wait Covered, rides and train wait Protected", () => {
    const route = routeFromPtItinerary(itinerary, "pt-0", CoveredLinkwayIndex.empty());
    expect(route.legs.map((l) => [l.mode, l.tier, Math.round(l.minutes)])).toEqual([
      ["walk", "exposed", 5],
      ["wait", "covered", 4],
      ["bus", "protected", 6],
      ["wait", "protected", 2],
      ["train", "protected", 8],
    ]);
    expect(route.summary).toBe("Bus 7 → North South Line");
  });

  it("treats waiting on an open-air (elevated) platform as Covered, underground as Protected", () => {
    const geom = { points: encodePolyline([[1.37, 103.85], [1.284, 103.85]]) };
    const boardAt = (stopCode: string): OneMapPtItinerary => ({
      duration: 0,
      legs: [
        { mode: "WALK", startTime: 0, endTime: 3 * min, legGeometry: geom },
        { mode: "SUBWAY", route: "NS", from: { stopCode }, startTime: 6 * min, endTime: 26 * min, legGeometry: geom },
      ],
    });
    const waitTier = (code: string) =>
      routeFromPtItinerary(boardAt(code), "x", CoveredLinkwayIndex.empty()).legs.find((l) => l.mode === "wait")!.tier;
    expect(waitTier("NS16")).toBe("covered"); // Ang Mo Kio, elevated
    expect(waitTier("NS19")).toBe("protected"); // Toa Payoh, underground
    expect(waitTier("BP6")).toBe("covered"); // Bukit Panjang LRT
    expect(waitTier("DT1")).toBe("protected"); // Bukit Panjang DTL, underground
  });

  it("merges mode queries, dropping itineraries that ride the same services", () => {
    const geom = { points: encodePolyline([[1.3, 103.8], [1.31, 103.81]]) };
    const ride = (mode: string, route: string, walkMin: number): OneMapPtItinerary => ({
      duration: 0,
      legs: [
        { mode: "WALK", startTime: 0, endTime: walkMin * min, legGeometry: geom },
        { mode, route, startTime: walkMin * min, endTime: (walkMin + 10) * min, legGeometry: geom },
      ],
    });
    const merged = mergeItineraries([
      [ride("SUBWAY", "NS", 2)],
      [ride("BUS", "52", 3), ride("BUS", "162", 4)],
      [ride("SUBWAY", "NS", 5)], // same NS ride via a different walk: duplicate
    ]);
    expect(merged.map((it) => it.legs[1]!.route)).toEqual(["NS", "52", "162"]);
    expect(merged[0]!.legs[0]!.endTime).toBe(2 * min); // first occurrence kept
  });

  it("builds a walk-only Route from the walk response", () => {
    const route = routeFromWalk(
      { route_geometry: encodePolyline([[1.3, 103.8], [1.31, 103.8]]), route_summary: { total_time: 900, total_distance: 1100 } },
      "walk",
      CoveredLinkwayIndex.empty(),
    );
    const totals = routeTotals(route!);
    expect(totals.totalMinutes).toBeCloseTo(15);
    expect(totals.exposedMinutes).toBeCloseTo(15);
  });
});

describe("ranking", () => {
  const leg = (tier: "exposed" | "covered" | "protected", minutes: number, path: LatLng[] = [[1.3, 103.8]]) => ({
    mode: "walk" as const,
    tier,
    minutes,
    path,
  });
  const walk: Route = { id: "walk", summary: "Walk", legs: [leg("exposed", 15)] };
  const mrt: Route = { id: "mrt", summary: "MRT", legs: [leg("exposed", 3), leg("protected", 16)] };
  const slow: Route = { id: "slow", summary: "Slow", legs: [leg("protected", 40)] };

  it("prefers the fastest Route in Band 1", () => {
    expect(rankRoutes([walk, mrt], 1, false)[0]!.id).toBe("walk");
  });
  it("prefers the less Exposed Route in Band 2+", () => {
    const ranked = rankRoutes([walk, mrt], 2, false);
    expect(ranked.map((r) => r.id)).toEqual(["mrt", "walk"]);
    expect(ranked[0]!.recommended).toBe(true);
    expect(ranked[1]!.recommended).toBe(false);
  });
  it("drops Routes slower than twice the fastest", () => {
    expect(rankRoutes([walk, slow], 4, false).map((r) => r.id)).toEqual(["walk"]);
  });
  it("discounts Covered minutes against Exposed ones", () => {
    const covered: Route = { id: "covered", summary: "Covered", legs: [leg("covered", 17)] };
    expect(rankRoutes([walk, covered], 3, false)[0]!.id).toBe("covered");
  });
  it("takes the worst band touched by Exposed Legs", () => {
    const viaCentral: Route = { id: "c", summary: "c", legs: [leg("exposed", 3, [[1.355, 103.825]])] };
    const woodlands: LatLng = [1.44, 103.79];
    expect(tripBand([], woodlands, woodlands, regions)).toBe(2);
    expect(tripBand([viaCentral], woodlands, woodlands, regions)).toBe(3);
  });
});
