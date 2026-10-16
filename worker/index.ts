/**
 * Cloudflare Worker entry (wrangler.jsonc). /api/* runs the shared API from server/api.ts; every other path is
 * served from static assets (the built web app, with SPA fallback) without invoking this Worker.
 * The linkway and indoor data are static assets too (/data/*), loaded lazily and cached per isolate.
 */
import { areasFromGeoJson, CoveredLinkwayIndex, linesFromGeoJson } from "../src/domain/coveredLinkways";
import { IndoorGraph, type IndoorGraphData } from "../src/domain/indoorGraph";
import { createApi, type ApiConfig } from "../server/api";

interface Env extends Partial<Record<keyof ApiConfig["env"], string>> {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

let api: ReturnType<typeof createApi> | null = null;

async function asset<T>(env: Env, path: string): Promise<T> {
  const res = await env.ASSETS.fetch(new Request(`https://assets.local${path}`));
  if (!res.ok) throw new Error(`asset ${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

function apiFor(env: Env) {
  return (api ??= createApi({
    env,
    loadLinkways: async () => {
      const geojson = await asset<unknown>(env, "/data/covered-linkways.geojson");
      return new CoveredLinkwayIndex(linesFromGeoJson(geojson), areasFromGeoJson(geojson));
    },
    loadIndoor: async () => new IndoorGraph(await asset<IndoorGraphData>(env, "/data/cbd-indoor-graph.json")),
  }));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405 });
    const result = (await apiFor(env).handle(url.pathname, url.searchParams)) ?? { status: 404, body: { error: "Not found" } };
    return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
  },
};
