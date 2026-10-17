import type { CoveredLinkwayIndex } from "../src/domain/coveredLinkways";
import type { IndoorGraph } from "../src/domain/indoorGraph";
import { indoorLinksOpen } from "../src/domain/indoorVariants";
import { parseDepartureDate } from "../src/domain/tripUrl";
import type { LatLng } from "../src/domain/types";
import { latestHazeReading } from "./haze";
import { mockDrive, mockPublicTransport, mockWalk } from "./mock";
import { OneMapClient } from "./onemap";
import { planTrip, type RouteSource } from "./planTrip";

/**
 * The HTTP API, independent of any server framework. Express (server/index.ts, local and Docker) and the
 * Cloudflare Worker (worker/index.ts) both wrap it.
 */
export interface ApiConfig {
  env: {
    ONEMAP_EMAIL?: string;
    ONEMAP_PASSWORD?: string;
    MOCK_ROUTING?: string;
    /** Dev/test only. */
    HAZE_OVERRIDE_PM25?: string;
    /** Dev/test only. */
    INDOOR_ALWAYS_OPEN?: string;
  };
  loadLinkways: () => Promise<CoveredLinkwayIndex>;
  loadIndoor: () => Promise<IndoorGraph | null>;
}

export interface ApiResult {
  status: number;
  body: unknown;
}

/** Rough Singapore bounding box; rejects points OneMap cannot route. */
export function parsePoint(raw: string | null): LatLng | null {
  if (!raw) return null;
  const [lat, lng] = raw.split(",").map(Number);
  if (lat === undefined || lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < 1.15 || lat > 1.48 || lng < 103.6 || lng > 104.1) return null;
  return [lat, lng];
}

const once = <T>(load: () => Promise<T>) => {
  let p: Promise<T> | null = null;
  return () => (p ??= load().catch((err) => ((p = null), Promise.reject(err))));
};

export function createApi(config: ApiConfig) {
  const { env } = config;
  const onemap = new OneMapClient(env.ONEMAP_EMAIL ?? "", env.ONEMAP_PASSWORD ?? "");
  const mock = env.MOCK_ROUTING === "1" || !onemap.hasCredentials;
  const source: RouteSource = mock
    ? { walk: async (a, b) => mockWalk(a, b), drive: async (a, b) => mockDrive(a, b), publicTransport: async (a, b, t) => mockPublicTransport(a, b, t) }
    : onemap;
  const linkways = once(config.loadLinkways);
  const indoor = once(config.loadIndoor);
  const haze = () => latestHazeReading(env.HAZE_OVERRIDE_PM25);

  const fail = (err: unknown, status: number, message: string): ApiResult => {
    console.error(err);
    return { status, body: { error: message } };
  };

  /** Handles GET /api/*; returns null for paths that aren't API routes. */
  async function handle(pathname: string, params: URLSearchParams): Promise<ApiResult | null> {
    switch (pathname) {
      case "/api/haze":
        try {
          return { status: 200, body: await haze() };
        } catch (err) {
          return fail(err, 502, "Haze readings are unavailable right now.");
        }

      case "/api/search": {
        const q = (params.get("q") ?? "").trim();
        if (q.length < 2) return { status: 200, body: [] };
        try {
          return { status: 200, body: await onemap.search(q) };
        } catch (err) {
          return fail(err, 502, "Search is unavailable right now.");
        }
      }

      case "/api/reverse": {
        const point = parsePoint(params.get("at"));
        if (!point) return { status: 400, body: { error: "Point must be in Singapore." } };
        if (mock) return { status: 200, body: { name: null } };
        try {
          return { status: 200, body: { name: await onemap.reverseGeocode(point) } };
        } catch (err) {
          console.error(err);
          return { status: 200, body: { name: null } };
        }
      }

      case "/api/routes": {
        const start = parsePoint(params.get("from"));
        const end = parsePoint(params.get("to"));
        if (!start || !end) return { status: 400, body: { error: "Starting Point and Destination must both be in Singapore." } };
        try {
          const when = parseDepartureDate(params.get("at"));
          const open = env.INDOOR_ALWAYS_OPEN === "1" || indoorLinksOpen(when);
          const [reading, linkwayIndex, indoorGraph] = await Promise.all([haze(), linkways(), open ? indoor() : Promise.resolve(null)]);
          const body = await planTrip({ start, end, alwaysMinimise: params.get("minimise") === "1", when }, source, reading, linkwayIndex, mock, indoorGraph);
          return { status: 200, body };
        } catch (err) {
          return fail(err, 502, "Could not plan routes right now. Please try again.");
        }
      }

      default:
        return null;
    }
  }

  return { handle, mock };
}
