import type { LatLng } from "./types";

export interface TripUrlPoint {
  name: string;
  location: LatLng;
}

export interface TripUrlState {
  start: TripUrlPoint | null;
  end: TripUrlPoint | null;
  minimise?: boolean;
  departAt?: string | null;
}

function parseCoord(raw: string | null): LatLng | null {
  if (!raw) return null;
  const [lat, lng] = raw.split(",").map(Number);
  if (lat === undefined || lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < 1.15 || lat > 1.48 || lng < 103.6 || lng > 104.1) return null;
  return [lat, lng];
}

const fmtCoord = ([lat, lng]: LatLng): string => `${Number(lat.toFixed(5))},${Number(lng.toFixed(5))}`;

/**
 * Parse a Singapore `datetime-local` (`YYYY-MM-DDTHH:mm`) or ISO string into a `Date`,
 * falling back to `fallbackNow` when absent or invalid.
 */
export function parseDepartureDate(raw: string | null | undefined, fallbackNow: Date = new Date()): Date {
  if (!raw) return fallbackNow;
  const trimmed = raw.trim();
  if (!trimmed) return fallbackNow;
  // Interpret timezone-less datetime-local strings as Singapore time (+08:00).
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed) ? `${trimmed}+08:00` : trimmed;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? fallbackNow : d;
}

/** Format a `Date` as `YYYY-MM-DDTHH:mm` in Singapore time for `<input type="datetime-local">`. */
export function defaultSgtDateTimeLocal(now: Date = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Singapore",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Parse shareable Trip parameters from a URL query string. */
export function parseTripUrl(search: string): TripUrlState {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const fromLoc = parseCoord(params.get("from"));
  const toLoc = parseCoord(params.get("to"));
  const fromName = params.get("fromName")?.trim();
  const toName = params.get("toName")?.trim();
  const minimiseParam = params.get("minimise");
  const atParam = params.get("at")?.trim();

  return {
    start: fromLoc ? { name: fromName || "Pinned start", location: fromLoc } : null,
    end: toLoc ? { name: toName || "Pinned destination", location: toLoc } : null,
    ...(minimiseParam === "1" || minimiseParam === "0" ? { minimise: minimiseParam === "1" } : {}),
    departAt: atParam && !Number.isNaN(parseDepartureDate(atParam, new Date(NaN)).getTime()) ? atParam : null,
  };
}

/** Serialize Trip state into a query string (`?from=...&to=...`), or `""` when empty. */
export function formatTripUrl(state: TripUrlState): string {
  const params = new URLSearchParams();
  if (state.start) {
    params.set("from", fmtCoord(state.start.location));
    if (state.start.name) params.set("fromName", state.start.name);
  }
  if (state.end) {
    params.set("to", fmtCoord(state.end.location));
    if (state.end.name) params.set("toName", state.end.name);
  }
  if (state.minimise) params.set("minimise", "1");
  if (state.departAt) params.set("at", state.departAt);
  const str = params.toString();
  return str ? `?${str}` : "";
}
