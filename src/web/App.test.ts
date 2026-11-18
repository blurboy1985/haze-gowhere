// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { ApiError, fetchHaze, fetchRoutes } from "./api";
import type { HazeReading, RoutesResponse } from "../domain/types";

vi.mock("./MapView", () => ({ MapView: () => null, TIER_COLOUR: { protected: "green", covered: "yellow", exposed: "red" } }));
vi.mock("./api", async (original) => ({
  ...await original<typeof import("./api")>(),
  fetchHaze: vi.fn(),
  fetchRoutes: vi.fn(),
}));

const haze: HazeReading = {
  timestamp: "2026-11-18T21:00:00+08:00",
  regions: [{ region: "north", label: [1.35, 103.82], pm25: 20, psi24: 40, band: 1 }],
};
const healthy: RoutesResponse = {
  haze, tripBand: 1, avoidanceStrength: 0, consideredCount: 1, taxi: null, mock: true,
  routes: [{
    id: "audit", summary: "Audit walk", recommended: true, exposureCost: 10,
    totalMinutes: 10, exposedMinutes: 10, coveredMinutes: 0, protectedMinutes: 0,
    legs: [{ mode: "walk", tier: "exposed", minutes: 10, path: [[1.35, 103.82], [1.36, 103.83]] }],
  }],
};
const unavailable = () => new ApiError("Haze readings are unavailable right now. Routes cannot be recommended safely.", "HAZE_UNAVAILABLE");
let root: Root;
let container: HTMLDivElement;
const toggle = () => act(async () => { container.querySelector<HTMLInputElement>('.toggle input')!.click(); });

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(fetchHaze).mockResolvedValue(haze);
  vi.mocked(fetchRoutes).mockReset().mockResolvedValue(healthy);
  localStorage.clear();
  window.history.replaceState(null, "", "/?from=1.35,103.82&to=1.36,103.83");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("clears old recommendations and readings on failure, then recovers after valid readings", async () => {
  await act(async () => root.render(createElement(App)));
  expect(container.textContent).toContain("Audit walk");
  vi.mocked(fetchRoutes).mockRejectedValueOnce(unavailable());
  await toggle();
  expect(container.textContent).not.toContain("Audit walk");
  expect(container.querySelector(".haze-error")?.textContent).toContain("Haze readings are unavailable");
  expect(container.querySelector(".region-band-pill")).toBeNull();
  await toggle();
  expect(container.textContent).toContain("Audit walk");
  expect(container.querySelector(".haze-error")).toBeNull();
});

it("ignores a superseded failure after a newer successful response", async () => {
  let rejectOld!: (error: Error) => void;
  vi.mocked(fetchRoutes).mockImplementationOnce(() => new Promise((_, reject) => { rejectOld = reject; }));
  await act(async () => root.render(createElement(App)));
  await toggle();
  expect(container.textContent).toContain("Audit walk");
  await act(async () => rejectOld(unavailable()));
  expect(container.textContent).toContain("Audit walk");
  expect(container.querySelector(".haze-error")).toBeNull();
});

it("ignores a superseded success after a newer unavailable response", async () => {
  let resolveOld!: (result: RoutesResponse) => void;
  vi.mocked(fetchRoutes).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  await act(async () => root.render(createElement(App)));
  vi.mocked(fetchRoutes).mockRejectedValueOnce(unavailable());
  await toggle();
  await act(async () => resolveOld(healthy));
  expect(container.textContent).not.toContain("Audit walk");
  expect(container.querySelector(".haze-error")?.textContent).toContain("Haze readings are unavailable");
});
