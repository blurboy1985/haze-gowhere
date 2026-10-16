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

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

export const fetchHaze = () => getJson<HazeReading>("/api/haze");

export const searchPlaces = (q: string, signal?: AbortSignal) =>
  getJson<Place[]>(`/api/search?q=${encodeURIComponent(q)}`, signal);

export const reverseGeocode = (p: LatLng) =>
  getJson<{ name: string | null }>(`/api/reverse?at=${p.join(",")}`).then((r) => r.name);

export const fetchRoutes = (from: LatLng, to: LatLng, minimise: boolean, signal?: AbortSignal) =>
  getJson<RoutesResponse>(`/api/routes?from=${from.join(",")}&to=${to.join(",")}&minimise=${minimise ? 1 : 0}`, signal);
