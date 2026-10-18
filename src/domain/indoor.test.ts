import { describe, expect, it } from "vitest";
import { CoveredLinkwayIndex } from "./coveredLinkways";
import { IndoorGraph, inIndoorBbox, type IndoorGraphData } from "./indoorGraph";
import { indoorLinksOpen, indoorVariants } from "./indoorVariants";
import { routeTotals } from "./ranking";
import type { LatLng, Route } from "./types";

/**
 * Synthetic CBD-like graph (~110 m per 0.001°):
 *
 *   station S (0) ──P── 1 ──P── 2 ──P── mall M (3)      indoor link, ~330 m, "Test Link"
 *        └─────────────E (street, ~220 m)──────────┘    direct open street S → M
 */
const S: LatLng = [1.29, 103.85];
const M: LatLng = [1.292, 103.85];
const data: IndoorGraphData = {
  license: "ODbL-1.0",
  attribution: "test",
  osmTimestamp: "test",
  bbox: [1.275, 103.84, 1.305, 103.865],
  connectors: [],
  nodes: [S, [1.29, 103.851], [1.292, 103.851], M],
  edges: [
    [0, 1, 0, 0],
    [1, 2, 0, 0],
    [2, 3, 0, 0],
    [0, 3, 2, -1],
  ],
  names: ["Test Link"],
};
const graph = new IndoorGraph(data);
const noLinkways = CoveredLinkwayIndex.empty();

describe("IndoorGraph", () => {
  it("prefers the longer Protected link over the shorter open street", () => {
    const runs = graph.route(0, 3)!;
    expect(runs.map((r) => r.tier)).toEqual(["protected"]);
    expect(runs[0]!.names).toEqual(["Test Link"]);
  });

  it("snaps only to Protected nodes when asked", () => {
    const g2 = new IndoorGraph({ ...data, edges: [[0, 3, 2, -1], [1, 2, 0, 0]] });
    expect(g2.snap(S, 150)?.node).toBe(0);
    expect(g2.snap(S, 150, true)?.node).toBe(1); // ~111 m away, but on the Protected edge
    expect(g2.snap(S, 50, true)).toBeNull();
  });

  it("knows the CBD bbox", () => {
    expect(inIndoorBbox([1.2934, 103.8555])).toBe(true); // Esplanade
    expect(inIndoorBbox([1.3509, 103.8483])).toBe(false); // Bishan
  });
});

describe("indoorVariants", () => {
  const trainThenWalk: Route = {
    id: "pt-0",
    summary: "Circle Line",
    legs: [
      { mode: "train", tier: "protected", minutes: 10, path: [[1.28, 103.85], S], label: "Circle Line" },
      { mode: "walk", tier: "exposed", minutes: 3, path: [S, M], label: "Walk" },
    ],
  };

  it("offers a variant whose last walk uses the Indoor Link", () => {
    const [v] = indoorVariants([trainThenWalk], graph, noLinkways);
    expect(v?.id).toBe("pt-0-indoor");
    expect(v?.summary).toBe("Circle Line · indoor link");
    expect(v?.indoorLinks).toEqual(["Test Link"]);
    const t = routeTotals(v!);
    expect(t.exposedMinutes).toBeCloseTo(0);
    expect(t.totalMinutes).toBeGreaterThan(routeTotals(trainThenWalk).totalMinutes); // longer, but Protected
    expect(v!.legs[0]!.mode).toBe("train"); // ride untouched
  });

  it("offers nothing when the saving is under 1 Exposed minute", () => {
    const short: Route = { ...trainThenWalk, legs: [trainThenWalk.legs[0]!, { ...trainThenWalk.legs[1]!, minutes: 0.5 }] };
    expect(indoorVariants([short], graph, noLinkways)).toEqual([]);
  });

  it("leaves walk-only Routes and Routes outside the CBD alone", () => {
    const walkOnly: Route = { id: "walk", summary: "Walk", legs: [trainThenWalk.legs[1]!] };
    const bishan: Route = {
      ...trainThenWalk,
      legs: [trainThenWalk.legs[0]!, { mode: "walk", tier: "exposed", minutes: 3, path: [[1.351, 103.848], [1.353, 103.848]] }],
    };
    expect(indoorVariants([walkOnly, bishan], graph, noLinkways)).toEqual([]);
  });

  it("re-routes the first walk too, keeping its direction toward the station", () => {
    const walkThenTrain: Route = {
      id: "pt-1",
      summary: "Circle Line",
      legs: [
        { mode: "walk", tier: "exposed", minutes: 3, path: [M, S], label: "Walk" },
        { mode: "train", tier: "protected", minutes: 10, path: [S, [1.28, 103.85]], label: "Circle Line" },
      ],
    };
    const [v] = indoorVariants([walkThenTrain], graph, noLinkways);
    const walk = v!.legs.filter((l) => l.mode === "walk").flatMap((l) => l.path);
    expect(walk[0]).toEqual(M);
    expect(walk[walk.length - 1]).toEqual(S);
  });
});

describe("indoorLinksOpen", () => {
  it("is open 06:00–23:00 Singapore time", () => {
    expect(indoorLinksOpen(new Date("2026-10-17T05:59:00+08:00"))).toBe(false);
    expect(indoorLinksOpen(new Date("2026-10-17T06:00:00+08:00"))).toBe(true);
    expect(indoorLinksOpen(new Date("2026-10-17T22:59:00+08:00"))).toBe(true);
    expect(indoorLinksOpen(new Date("2026-10-17T23:00:00+08:00"))).toBe(false);
  });
});

describe("indoorVariants timetable", () => {
  const departure = Date.parse("2026-10-19T09:10+08:00");
  const approach: Route = {
    id: "scheduled", summary: "Circle Line", departureTime: departure, arrivalTime: departure + 13 * 60_000,
    legs: [
      { mode: "walk", tier: "exposed", minutes: 3, path: [M, S] },
      { mode: "train", tier: "protected", minutes: 10, path: [S, [1.28, 103.85]] },
    ],
  };

  it("moves departure earlier for a longer indoor approach while retaining scheduled boarding and arrival", () => {
    const [variant] = indoorVariants([approach], graph, noLinkways, departure - 10 * 60_000);
    expect(variant).toBeDefined();
    expect(variant!.departureTime).toBeLessThan(departure);
    expect(variant!.arrivalTime).toBe(approach.arrivalTime);
    const approachMinutes = variant!.legs.filter((l) => l.mode === "walk").reduce((sum, l) => sum + l.minutes, 0);
    expect(variant!.departureTime! + approachMinutes * 60_000).toBeCloseTo(departure + 3 * 60_000, -1);
    expect((variant!.arrivalTime! - variant!.departureTime!) / 60_000).toBeCloseTo(routeTotals(variant!).totalMinutes, 4);
  });

  it("rejects an indoor approach requiring departure before the user's requested time", () => {
    expect(indoorVariants([approach], graph, noLinkways, departure)).toEqual([]);
  });

  it("moves departure later for a shorter approach without claiming an earlier train arrival", () => {
    const longer: Route = { ...approach, arrivalTime: departure + 20 * 60_000, legs: [{ ...approach.legs[0]!, minutes: 10 }, approach.legs[1]!] };
    const [variant] = indoorVariants([longer], graph, noLinkways, departure);
    expect(variant!.departureTime).toBeGreaterThan(departure);
    expect(variant!.arrivalTime).toBe(longer.arrivalTime);
  });
});

describe("indoorVariants stop enclosure", () => {
  // Stop 60 m off the indoor network, which then runs to the mall.
  const stop: LatLng = [1.2905, 103.8504];
  const graph2 = new IndoorGraph({ ...data, nodes: [...data.nodes], edges: data.edges.filter(([a, b]) => !(a === 0 && b === 3)) });
  const ride = (mode: "bus" | "train"): Route => ({
    id: mode,
    summary: mode,
    legs: [
      { mode, tier: "protected", minutes: 10, path: [[1.28, 103.85], stop], label: mode },
      { mode: "walk", tier: "exposed", minutes: 6, path: [stop, M], label: "Walk" },
    ],
  });

  it("counts the hop from a train station as Protected but from a bus stop as Exposed", () => {
    const [train] = indoorVariants([ride("train")], graph2, noLinkways);
    const [bus] = indoorVariants([ride("bus")], graph2, noLinkways);
    expect(routeTotals(train!).exposedMinutes).toBeCloseTo(0);
    expect(routeTotals(bus!).exposedMinutes).toBeGreaterThan(0.5);
    expect(bus!.legs[1]!.tier).toBe("exposed");
  });
});

describe("indoorVariants geometry", () => {
  // Both ends sit off the graph, so the station and place hops are non-zero.
  const station: LatLng = [1.2899, 103.8501];
  const place: LatLng = [1.2921, 103.8499];
  const continuous = (legs: Route["legs"]) =>
    legs.every((l, i) => i === 0 || JSON.stringify(legs[i - 1]!.path[legs[i - 1]!.path.length - 1]) === JSON.stringify(l.path[0]));
  const walks = (r: Route) => r.legs.filter((l) => l.mode === "walk");

  it("draws the last walk as one continuous line from station to place", () => {
    const route: Route = {
      id: "t",
      summary: "t",
      legs: [
        { mode: "train", tier: "protected", minutes: 10, path: [[1.28, 103.85], station] },
        { mode: "walk", tier: "exposed", minutes: 4, path: [station, place] },
      ],
    };
    const [v] = indoorVariants([route], graph, noLinkways);
    const w = walks(v!);
    expect(w[0]!.path[0]).toEqual(station);
    expect(w[w.length - 1]!.path[w[w.length - 1]!.path.length - 1]).toEqual(place);
    expect(continuous(w)).toBe(true);
  });

  it("draws the first walk as one continuous line from place to station", () => {
    const route: Route = {
      id: "t",
      summary: "t",
      legs: [
        { mode: "walk", tier: "exposed", minutes: 4, path: [place, station] },
        { mode: "train", tier: "protected", minutes: 10, path: [station, [1.28, 103.85]] },
      ],
    };
    const [v] = indoorVariants([route], graph, noLinkways);
    const w = walks(v!);
    expect(w[0]!.path[0]).toEqual(place);
    expect(w[w.length - 1]!.path[w[w.length - 1]!.path.length - 1]).toEqual(station);
    expect(continuous(w)).toBe(true);
  });
});
