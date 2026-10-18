import { describe, expect, it } from "vitest";
import { CoveredLinkwayIndex } from "./coveredLinkways";
import { describeRouteTradeoff } from "./directions";
import { mergeItineraries, routeFromPtItinerary, type OneMapPtItinerary } from "./onemapRoutes";
import { encodePolyline } from "./polyline";
import { rankRoutes, routeTotals } from "./ranking";
import type { Route } from "./types";

const minute = 60_000;
const t0 = Date.parse("2026-10-19T09:00+08:00");
const geometry = { points: encodePolyline([[1.27632, 103.85456], [1.27622, 103.85528]]) };
const itinerary = (from = "NS17", to = "NS22", offset = 0, walkMinutes = 1): OneMapPtItinerary => ({
  duration: (walkMinutes + 10) * 60,
  legs: [
    { mode: "WALK", startTime: t0 + offset * minute, endTime: t0 + (offset + walkMinutes) * minute, legGeometry: geometry },
    { mode: "SUBWAY", route: "NS", from: { stopCode: from }, to: { stopCode: to },
      startTime: t0 + (offset + walkMinutes) * minute, endTime: t0 + (offset + walkMinutes + 10) * minute, legGeometry: geometry },
  ],
});

describe("route accuracy", () => {
  it("retains different boarding and alighting stations on the same service", () => {
    expect(mergeItineraries([[itinerary()], [itinerary("NS18"), itinerary("NS17", "NS23")]])).toHaveLength(3);
  });

  it("replaces a worse first occurrence with an earlier, less walking itinerary", () => {
    const better = itinerary();
    expect(mergeItineraries([[itinerary("NS17", "NS22", 5, 3)], [better]])).toEqual([better]);
  });

  it("preserves a useful less-walking alternative even when it arrives later", () => {
    expect(mergeItineraries([[itinerary("NS17", "NS22", 0, 3)], [itinerary("NS17", "NS22", 5, 1)]])).toHaveLength(2);
  });

  it("deduplicates service metadata even when route IDs are absent", () => {
    const ns = itinerary();
    const cc = itinerary();
    ns.legs[1]!.route = undefined;
    ns.legs[1]!.routeShortName = "NS";
    cc.legs[1]!.route = undefined;
    cc.legs[1]!.routeShortName = "CC";
    expect(mergeItineraries([[ns, cc]])).toHaveLength(2);
  });

  it("counts a short boarding wait in both duration and exposure", () => {
    const trip = itinerary();
    trip.legs[1]!.startTime += 20_000;
    trip.legs[1]!.endTime += 20_000;
    const route = routeFromPtItinerary(trip, "test", CoveredLinkwayIndex.empty());
    expect(route.legs.find((l) => l.mode === "wait")?.minutes).toBeCloseTo(1 / 3);
    expect(routeTotals(route).totalMinutes).toBeCloseTo(11 + 1 / 3);
    expect(routeTotals(route).coveredMinutes).toBeCloseTo(1 / 3);
  });

  it.each([
    ["MARINA BAY MRT STATION", "NS27", "MARINA BAY MRT STATION", "CC33", "protected"],
    ["BISHAN MRT STATION", "NS17", "BISHAN MRT STATION", "CC15", "covered"],
    ["NEWTON MRT STATION", "NS21", "ORCHARD MRT STATION", "NS22", "exposed"],
  ])("classifies platform transfers without sheltering street walks: %s to %s", (from, fromCode, to, toCode, tier) => {
    const trip = itinerary();
    trip.legs[0]!.from = { name: from, stopCode: fromCode };
    trip.legs[0]!.to = { name: to, stopCode: toCode };
    const route = routeFromPtItinerary(trip, "test", CoveredLinkwayIndex.empty());
    expect(route.legs[0]!.tier).toBe(tier);
  });

  const ride = (id: string, minutes: number, departureWaitMinutes = 0, exposed = 0): Route => ({
    id, summary: id, departureWaitMinutes,
    legs: [
      { mode: "train", tier: "protected", minutes: minutes - exposed, path: [] },
      { mode: "walk", tier: "exposed", minutes: exposed, path: [] },
    ],
  });

  it("recommends earlier arrival over a shorter trip departing much later", () => {
    const ranked = rankRoutes([ride("later", 10, 30), ride("earlier", 20)], 1, false);
    expect(ranked[0]!.id).toBe("earlier");
    expect(describeRouteTradeoff(ranked[0]!, ranked)).toBe("Earliest arrival");
  });

  it("does not count waiting at the origin as outdoor exposure", () => {
    const [route] = rankRoutes([ride("later", 10, 5)], 3, false);
    expect(route!.totalMinutes).toBe(10);
    expect(route!.exposureCost).toBe(15);
    expect(route!.exposedMinutes).toBe(0);
  });

  it("keeps the earliest-arriving route visible alongside haze recommendations", () => {
    const ranked = rankRoutes([ride("fast", 10, 0, 5), ride("a", 11), ride("b", 12), ride("c", 13)], 4, false);
    expect(ranked.map((r) => r.id)).toEqual(["a", "b", "fast"]);
  });
});
