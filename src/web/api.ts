import type { HazeReading, LatLng, RoutesResponse } from "../domain/types";

export interface Place {
  name: string;
  address: string;
  postal: string;
  location: LatLng;
}

/** A Starting Point or Destination as chosen by the commuter. */
export interface ChosenPoint {
  name: string;
  location: LatLng;
}

export class ApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
  }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const failure = body as { error?: string; code?: string };
    throw new ApiError(failure.error ?? `Request failed (${res.status})`, failure.code);
  }
  return body as T;
}

export const fetchHaze = () => getJson<HazeReading>("/api/haze");

export const searchPlaces = (q: string, signal?: AbortSignal) =>
  getJson<Place[]>(`/api/search?q=${encodeURIComponent(q)}`, signal);

export const reverseGeocode = (p: LatLng) =>
  getJson<{ name: string | null }>(`/api/reverse?at=${p.join(",")}`).then((r) => r.name);

export const fetchRoutes = (from: LatLng, to: LatLng, minimise: boolean, departAt: string | null = null, signal?: AbortSignal) => {
  const atParam = departAt ? `&at=${encodeURIComponent(departAt)}` : "";
  return getJson<RoutesResponse>(`/api/routes?from=${from.join(",")}&to=${to.join(",")}&minimise=${minimise ? 1 : 0}${atParam}`, signal);
};
