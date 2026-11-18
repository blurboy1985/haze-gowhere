import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoveredLinkwayIndex } from "../src/domain/coveredLinkways";

const names = ["north", "south", "east", "west", "central"];
const fixture = (metric: string, value = 20) => ({
  data: {
    regionMetadata: names.map((name) => ({ name, labelLocation: { latitude: 1.35, longitude: 103.82 } })),
    items: [{ timestamp: "2026-11-18T21:00:00+08:00", readings: { [metric]: Object.fromEntries(names.map((name) => [name, value])) as Record<string, unknown> } }],
  },
});

function mockUpstream() {
  const psi = fixture("psi_twenty_four_hourly", 40);
  const pm = fixture("pm25_one_hourly");
  const fetch = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/psi") ? psi : pm)));
  vi.stubGlobal("fetch", fetch);
  return { psi, pm, fetch };
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("complete haze readings only", () => {
  it("preserves actual zero, valid values, and the complete-reading cache", async () => {
    const { pm, fetch } = mockUpstream();
    pm.data.items[0]!.readings.pm25_one_hourly!.north = 0;
    pm.data.items[0]!.readings.pm25_one_hourly!.south = 200;
    const { latestHazeReading } = await import("./haze");
    const reading = await latestHazeReading();
    expect(reading.regions.find((r) => r.region === "north")).toMatchObject({ pm25: 0, band: 1 });
    expect(reading.regions.find((r) => r.region === "south")).toMatchObject({ pm25: 200, band: 3 });
    expect(await latestHazeReading()).toEqual(reading);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  for (const metric of ["pm25_one_hourly", "psi_twenty_four_hourly"]) {
    for (const value of [undefined, null, -1, "20", "NaN"]) {
      it(`rejects ${metric} regional value ${String(value)} instead of fabricating zero`, async () => {
        const { pm, psi } = mockUpstream();
        const response = metric === "pm25_one_hourly" ? pm : psi;
        response.data.items[0]!.readings[metric]!.north = value;
        const { latestHazeReading, HazeReadingsUnavailableError } = await import("./haze");
        await expect(latestHazeReading()).rejects.toBeInstanceOf(HazeReadingsUnavailableError);
      });
    }
    it(`rejects a missing ${metric} map`, async () => {
      const { pm, psi } = mockUpstream();
      delete (metric === "pm25_one_hourly" ? pm : psi).data.items[0]!.readings[metric];
      const { latestHazeReading } = await import("./haze");
      await expect(latestHazeReading()).rejects.toThrow("unavailable");
    });
  }

  it("rejects non-finite values even before JSON serialization", async () => {
    const { pm, psi } = mockUpstream();
    pm.data.items[0]!.readings.pm25_one_hourly!.north = Infinity;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith("/psi") ? psi : pm })));
    const { latestHazeReading } = await import("./haze");
    await expect(latestHazeReading()).rejects.toThrow("unavailable");
  });

  it("does not cache partial readings; a subsequent valid response recovers", async () => {
    const { pm, fetch } = mockUpstream();
    delete pm.data.items[0]!.readings.pm25_one_hourly!.north;
    const { latestHazeReading } = await import("./haze");
    await expect(latestHazeReading()).rejects.toThrow("unavailable");
    pm.data.items[0]!.readings.pm25_one_hourly!.north = 200;
    expect((await latestHazeReading()).regions[0]).toMatchObject({ pm25: 200, band: 3 });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("does not return an expired good reading when the refresh is incomplete", async () => {
    const { pm } = mockUpstream();
    const { latestHazeReading } = await import("./haze");
    await latestHazeReading();
    vi.advanceTimersByTime(5 * 60 * 1000);
    delete pm.data.items[0]!.readings.pm25_one_hourly!.north;
    await expect(latestHazeReading()).rejects.toThrow("unavailable");
  });

  it("does not let a development override hide missing upstream readings", async () => {
    const { pm } = mockUpstream();
    delete pm.data.items[0]!.readings.pm25_one_hourly!.north;
    const { latestHazeReading } = await import("./haze");
    await expect(latestHazeReading("0")).rejects.toThrow("unavailable");
  });

  it.each(["http", "empty", "malformed"])("fails closed for %s responses", async (failure) => {
    const { pm, fetch } = mockUpstream();
    if (failure === "http") fetch.mockImplementation(async () => new Response("", { status: 503 }));
    if (failure === "empty") pm.data.items = [];
    if (failure === "malformed") fetch.mockImplementation(async () => new Response("{}"));
    const { latestHazeReading, HazeReadingsUnavailableError } = await import("./haze");
    await expect(latestHazeReading()).rejects.toBeInstanceOf(HazeReadingsUnavailableError);
  });
});

describe("API unavailable response", () => {
  it.each(["pm25_one_hourly", "psi_twenty_four_hourly"])("blocks route recommendations when %s is incomplete, including minimise mode", async (metric) => {
    const { pm, psi, fetch } = mockUpstream();
    delete (metric === "pm25_one_hourly" ? pm : psi).data.items[0]!.readings[metric]!.north;
    const { createApi } = await import("./api");
    const api = createApi({
      env: { MOCK_ROUTING: "1" },
      loadLinkways: async () => CoveredLinkwayIndex.empty(),
      loadIndoor: async () => null,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await api.handle("/api/haze", new URLSearchParams())).toEqual({
      status: 502, body: { error: "Haze readings are unavailable right now." },
    });
    for (const minimise of ["0", "1"]) {
      const result = await api.handle("/api/routes", new URLSearchParams({
        from: "1.35,103.82", to: "1.36,103.83", minimise,
      }));
      expect(result).toEqual({
        status: 502,
        body: { code: "HAZE_UNAVAILABLE", error: "Haze readings are unavailable right now. Routes cannot be recommended safely." },
      });
      expect(result!.body).not.toHaveProperty("routes");
    }
    expect(fetch.mock.calls.every(([url]) => url.includes("api-open.data.gov.sg"))).toBe(true);
  });
});
