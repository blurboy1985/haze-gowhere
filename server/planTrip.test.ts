import { describe, expect, it, vi } from "vitest";
import { CoveredLinkwayIndex } from "../src/domain/coveredLinkways";
import { pm25Band } from "../src/domain/haze";
import type { HazeReading, LatLng, RegionName } from "../src/domain/types";
import { mockDrive, mockPublicTransport, mockWalk } from "./mock";
import { planTrip, type RouteSource } from "./planTrip";

const BISHAN: LatLng = [1.35092, 103.84825];
const ORCHARD: LatLng = [1.30398, 103.83191];

function hazeAt(pm25: number): HazeReading {
  const labels: Record<RegionName, LatLng> = {
    north: [1.41803, 103.82],
    south: [1.29587, 103.82],
    east: [1.35735, 103.94],
    west: [1.35735, 103.7],
    central: [1.35735, 103.82],
  };
  return {
    timestamp: "2026-10-16T21:00:00+08:00",
    regions: (Object.keys(labels) as RegionName[]).map((region) => ({ region, label: labels[region], psi24: 150, pm25, band: pm25Band(pm25) })),
  };
}

function stubSource(): RouteSource & { drive: ReturnType<typeof vi.fn> } {
  return {
    walk: async (a, b) => mockWalk(a, b),
    publicTransport: async (a, b, t) => mockPublicTransport(a, b, t),
    drive: vi.fn(async (a: LatLng, b: LatLng) => mockDrive(a, b)),
  };
}

const plan = (pm25: number, source = stubSource()) =>
  planTrip({ start: BISHAN, end: ORCHARD, alwaysMinimise: false, when: new Date("2026-10-16T13:00:00Z") }, source, hazeAt(pm25), CoveredLinkwayIndex.empty(), true);

describe("planTrip Taxi Suggestion", () => {
  it("is absent at Band 2 and drive routing is not called", async () => {
    const source = stubSource();
    const res = await plan(150, source);
    expect(res.tripBand).toBe(2);
    expect(res.taxi).toBeNull();
    expect(source.drive).not.toHaveBeenCalled();
  });

  it("is offered from Band 3 with the drive time and path", async () => {
    const res = await plan(151);
    expect(res.tripBand).toBe(3);
    expect(res.taxi?.minutes).toBeGreaterThan(0);
    expect(res.taxi?.path.length).toBeGreaterThan(1);
  });

  it("does not fail the Trip when drive routing fails", async () => {
    const source = stubSource();
    source.drive.mockRejectedValueOnce(new Error("OneMap down"));
    const res = await plan(300, source);
    expect(res.tripBand).toBe(4);
    expect(res.taxi).toBeNull();
    expect(res.routes.length).toBeGreaterThan(0);
  });
});

describe("planTrip ranking strength", () => {
  it("uses the Trip Band's Avoidance Strength", async () => {
    expect((await plan(40)).avoidanceStrength).toBe(0);
    expect((await plan(300)).avoidanceStrength).toBe(6);
  });
});
