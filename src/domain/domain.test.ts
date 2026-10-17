import { describe, expect, it } from "vitest";
import { CoveredLinkwayIndex, linesFromGeoJson, splitWalkByCover } from "./coveredLinkways";
import {
  collapseSteps,
  fmtDistance,
  fmtEtaRange,
  lineBadge,
  routeBadges,
  routeCalloutPoint,
  routeStopMarkers,
  routeWalkMetres,
  stepBoundsPoints,
} from "./directions";
import { avoidanceStrength, nearestRegion, pm25Band } from "./haze";
import { describeNavState, nearestStepIndex } from "./navigation";
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

describe("directions", () => {
  const t0 = Date.UTC(2026, 9, 16, 2, 15); // 10:15 am SGT
  const min = 60_000;
  const geom = { points: encodePolyline([[1.35092, 103.84825], [1.3515, 103.849]]) };

  it("extracts boarding/alighting stops, stop counts, walking distance, and Singapore ETA from OneMap itineraries", () => {
    const it: OneMapPtItinerary = {
      duration: 25 * 60,
      legs: [
        {
          mode: "WALK",
          startTime: t0,
          endTime: t0 + 4 * min,
          distance: 320,
          from: { name: "ORIGIN" },
          to: { name: "BISHAN MRT STATION", stopCode: "NS17" },
          legGeometry: geom,
        },
        {
          mode: "SUBWAY",
          route: "NS",
          routeLongName: "NORTH SOUTH LINE",
          startTime: t0 + 7 * min,
          endTime: t0 + 22 * min,
          from: { name: "BISHAN MRT STATION", stopCode: "NS17" },
          to: { name: "ORCHARD MRT STATION", stopCode: "NS22" },
          intermediateStops: [{ name: "BRADDELL" }, { name: "TOA PAYOH" }, { name: "NOVENA" }, { name: "NEWTON" }],
          legGeometry: geom,
        },
        {
          mode: "WALK",
          startTime: t0 + 22 * min,
          endTime: t0 + 25 * min,
          distance: 180,
          from: { name: "ORCHARD MRT STATION", stopCode: "NS22" },
          to: { name: "DESTINATION" },
          legGeometry: geom,
        },
      ],
    };
    const route = routeFromPtItinerary(it, "pt-0", CoveredLinkwayIndex.empty());
    expect(route.departureTime).toBe(t0);
    expect(route.arrivalTime).toBe(t0 + 25 * min);
    expect(fmtEtaRange(route.departureTime, route.arrivalTime)).toBe("10:15 – 10:40 am");
    expect(routeWalkMetres(route.legs)).toBe(500);
    expect(routeBadges(route.legs)).toEqual([
      { code: "NS", colour: "#d42e12", textColour: "#ffffff", mode: "train" },
    ]);

    const steps = collapseSteps(route.legs);
    expect(steps.map((s) => ({ mode: s.mode, label: s.label, detail: s.detail }))).toEqual([
      { mode: "walk", label: "Walk", detail: "320 m · to Bishan (NS17)" },
      { mode: "wait", label: "Wait for North South Line", detail: "At Bishan (NS17) · open-air stop" },
      { mode: "train", label: "North South Line", detail: "Bishan (NS17) → Orchard (NS22) · 5 stops" },
      { mode: "walk", label: "Walk", detail: "180 m · from Orchard (NS22)" },
    ]);
  });

  it("collapses contiguous walk sub-legs while summing distance and preserving indoor labels and destination stop", () => {
    const steps = collapseSteps([
      { mode: "walk", tier: "exposed", minutes: 2, distanceMetres: 140, path: [[1.3, 103.8]] },
      { mode: "walk", tier: "protected", minutes: 3, distanceMetres: 210, path: [[1.3, 103.8]], label: "Walk via CityLink Mall (indoor)", toStop: "City Hall (EW13)" },
    ]);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      mode: "walk",
      label: "Walk via CityLink Mall (indoor)",
      minutes: 5,
      distanceMetres: 350,
      tiers: ["exposed", "protected"],
      detail: "350 m · to City Hall (EW13)",
      legIndices: [0, 1],
    });
  });

  it("assigns official LTA colours to MRT, LRT, and bus badges and formats distances", () => {
    expect(lineBadge({ mode: "train", label: "Circle Line" })?.colour).toBe("#fa9e0d");
    expect(lineBadge({ mode: "train", label: "Downtown Line" })?.colour).toBe("#005ec4");
    expect(lineBadge({ mode: "bus", label: "Bus 190" })).toEqual({
      code: "190",
      colour: "#538d22",
      textColour: "#ffffff",
      mode: "bus",
    });
    expect(fmtDistance(342)).toBe("340 m");
    expect(fmtDistance(1250)).toBe("1.3 km");
  });

  it("extracts boarding, alighting, and merged interchange stop markers, callout midpoint, and step bounds", () => {
    const legs = [
      { mode: "walk" as const, tier: "exposed" as const, minutes: 3, path: [[1.35, 103.84], [1.351, 103.848]] as LatLng[] },
      {
        mode: "train" as const,
        tier: "protected" as const,
        minutes: 10,
        label: "North South Line",
        lineCode: "NS",
        fromStop: "Bishan (NS17)",
        toStop: "Dhoby Ghaut (NS24)",
        path: [[1.351, 103.848], [1.299, 103.845]] as LatLng[],
      },
      {
        mode: "train" as const,
        tier: "protected" as const,
        minutes: 5,
        label: "North East Line",
        lineCode: "NE",
        fromStop: "Dhoby Ghaut (NE6)",
        toStop: "Chinatown (NE4)",
        path: [[1.2991, 103.8451], [1.284, 103.843]] as LatLng[],
      },
    ];
    const markers = routeStopMarkers(legs);
    expect(markers).toHaveLength(3);
    expect(markers[0]).toMatchObject({ kind: "board", label: "Board North South Line at Bishan (NS17)" });
    expect(markers[1]).toMatchObject({
      kind: "transfer",
      label: "Alight at Dhoby Ghaut (NS24) · Board North East Line at Dhoby Ghaut (NE6)",
    });
    expect(markers[2]).toMatchObject({ kind: "alight", label: "Alight at Chinatown (NE4)" });

    const mid = routeCalloutPoint(legs);
    expect(mid).not.toBeNull();
    expect(mid![0]).toBeGreaterThan(1.284);
    expect(mid![0]).toBeLessThan(1.351);

    expect(stepBoundsPoints(legs, 0)).toEqual([[1.35, 103.84], [1.351, 103.848]]);
    expect(stepBoundsPoints(legs, null)).toHaveLength(6);
  });
});

describe("navigation", () => {
  const route: Route = {
    id: "pt-0",
    summary: "North South Line",
    legs: [
      { mode: "walk", tier: "exposed", minutes: 3, distanceMetres: 240, path: [[1.350, 103.848], [1.351, 103.849]] },
      { mode: "walk", tier: "covered", minutes: 1, distanceMetres: 80, path: [[1.351, 103.849], [1.3515, 103.8495]], toStop: "Bishan (NS17)" },
      { mode: "train", tier: "protected", minutes: 12, label: "North South Line", lineCode: "NS", fromStop: "Bishan (NS17)", toStop: "Orchard (NS22)", stopCount: 5, path: [[1.3515, 103.8495], [1.304, 103.832]] },
      { mode: "walk", tier: "exposed", minutes: 4, distanceMetres: 300, path: [[1.304, 103.832], [1.303, 103.831]] },
    ],
  };

  it("computes current and next step instructions, worst Exposure Tier, and remaining totals", () => {
    const step0 = describeNavState(route, 0)!;
    expect(step0).toMatchObject({
      stepIndex: 0,
      totalSteps: 3,
      dominantTier: "exposed",
      remainingMinutes: 20,
      remainingExposedMinutes: 7,
      remainingCoveredMinutes: 1,
      progressPercent: 0,
    });
    expect(step0.current.detail).toBe("320 m · to Bishan (NS17)");
    expect(step0.next?.label).toBe("North South Line");

    const step1 = describeNavState(route, 1)!;
    expect(step1).toMatchObject({
      stepIndex: 1,
      totalSteps: 3,
      dominantTier: "protected",
      remainingMinutes: 16,
      remainingExposedMinutes: 4,
      remainingCoveredMinutes: 0,
      progressPercent: 20,
    });

    const step2 = describeNavState(route, 2)!;
    expect(step2.next).toBeNull();
    expect(step2.remainingMinutes).toBe(4);
    expect(step2.remainingExposedMinutes).toBe(4);
    expect(step2.progressPercent).toBe(80);
  });

  it("snaps live GPS coordinates to the nearest collapsed step", () => {
    const nearStart = nearestStepIndex(route.legs, [1.3502, 103.8481]);
    expect(nearStart?.stepIndex).toBe(0);
    expect(nearStart?.distanceMetres).toBeLessThan(40);

    const nearEnd = nearestStepIndex(route.legs, [1.3031, 103.8311]);
    expect(nearEnd?.stepIndex).toBe(2);
    expect(nearEnd?.distanceMetres).toBeLessThan(30);
  });
});



