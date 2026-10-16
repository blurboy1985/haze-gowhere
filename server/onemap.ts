import type { OneMapDirectResponse, OneMapPtResponse } from "../src/domain/onemapRoutes";
import type { LatLng } from "../src/domain/types";

const BASE = "https://www.onemap.gov.sg";
/** Refresh this long before OneMap's stated expiry (tokens last ~3 days). */
const REFRESH_MARGIN_MS = 60 * 60 * 1000;

export interface Place {
  name: string;
  address: string;
  postal: string;
  location: LatLng;
}

export class OneMapClient {
  private token: { value: string; expiresAt: number } | null = null;
  private pending: Promise<string> | null = null;

  constructor(private readonly email: string, private readonly password: string) {}

  get hasCredentials(): boolean {
    return Boolean(this.email && this.password);
  }

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt - REFRESH_MARGIN_MS) return this.token.value;
    this.pending ??= (async () => {
      try {
        const res = await fetch(`${BASE}/api/auth/post/getToken`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: this.email, password: this.password }),
        });
        if (!res.ok) throw new Error(`OneMap auth failed: HTTP ${res.status}`);
        const body = (await res.json()) as { access_token: string; expiry_timestamp: string };
        this.token = { value: body.access_token, expiresAt: Number(body.expiry_timestamp) * 1000 };
        return body.access_token;
      } finally {
        this.pending = null;
      }
    })();
    return this.pending;
  }

  private async authedGet<T>(path: string, params: Record<string, string>): Promise<T> {
    const res = await fetch(`${BASE}${path}?${new URLSearchParams(params)}`, {
      headers: { Authorization: await this.accessToken() },
    });
    if (!res.ok) throw new Error(`OneMap ${path} failed: HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  /** Address / postal code / building search. Public; no token needed. */
  async search(query: string): Promise<Place[]> {
    const params = new URLSearchParams({ searchVal: query, returnGeom: "Y", getAddrDetails: "Y", pageNum: "1" });
    const res = await fetch(`${BASE}/api/common/elastic/search?${params}`);
    if (!res.ok) throw new Error(`OneMap search failed: HTTP ${res.status}`);
    const body = (await res.json()) as {
      results: { SEARCHVAL: string; ADDRESS: string; POSTAL: string; LATITUDE: string; LONGITUDE: string }[];
    };
    return body.results.slice(0, 8).map((r) => ({
      name: r.SEARCHVAL,
      address: r.ADDRESS,
      postal: r.POSTAL === "NIL" ? "" : r.POSTAL,
      location: [Number(r.LATITUDE), Number(r.LONGITUDE)],
    }));
  }

  async reverseGeocode([lat, lng]: LatLng): Promise<string | null> {
    const body = await this.authedGet<{ GeocodeInfo?: { BUILDINGNAME?: string; BLOCK?: string; ROAD?: string }[] }>(
      "/api/public/revgeocode",
      { location: `${lat},${lng}`, buffer: "50", addressType: "All", otherFeatures: "N" },
    );
    const g = body.GeocodeInfo?.[0];
    if (!g) return null;
    // OneMap's placeholder for land with no building nearby.
    if (g.BUILDINGNAME === "SINGAPORE - MAIN ISLAND") return null;
    if (g.BUILDINGNAME && g.BUILDINGNAME !== "NIL") return g.BUILDINGNAME;
    return [g.BLOCK, g.ROAD].filter((s) => s && s !== "NIL").join(" ") || null;
  }

  walk(start: LatLng, end: LatLng): Promise<OneMapDirectResponse> {
    return this.authedGet("/api/public/routingsvc/route", { start: start.join(","), end: end.join(","), routeType: "walk" });
  }

  drive(start: LatLng, end: LatLng): Promise<OneMapDirectResponse> {
    return this.authedGet("/api/public/routingsvc/route", { start: start.join(","), end: end.join(","), routeType: "drive" });
  }

  publicTransport(start: LatLng, end: LatLng, when: Date): Promise<OneMapPtResponse> {
    const { date, time } = singaporeDateTime(when);
    return this.authedGet("/api/public/routingsvc/route", {
      start: start.join(","),
      end: end.join(","),
      routeType: "pt",
      date,
      time,
      mode: "TRANSIT",
      maxWalkDistance: "1000",
      numItineraries: "3",
    });
  }
}

/** OneMap wants MM-DD-YYYY and HH:MM:SS in Singapore time. */
function singaporeDateTime(when: Date): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Singapore",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(when)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.month}-${parts.day}-${parts.year}`, time: `${parts.hour}:${parts.minute}:${parts.second}` };
}
