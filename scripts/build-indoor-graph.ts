/**
 * Build the CBD indoor walking graph used for Indoor Variants (ADR 0002) from OpenStreetMap.
 *
 *   npm run build:indoor -- --fetch <osm.json>   # download from Overpass to <osm.json> (keep it outside the repo), then build
 *   npm run build:indoor -- <osm.json>           # build from a saved download
 *
 * Writes server/data/cbd-indoor-graph.json. That file is a Derivative Database of OSM, licensed ODbL 1.0;
 * this script plus scripts/fixtures/indoor-connectors.json is the published method to recreate it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { distanceMetres } from "../src/domain/geo";
import { INDOOR_BBOX, TIER_CODE, type IndoorGraphData } from "../src/domain/indoorGraph";
import type { LatLng, Tier } from "../src/domain/types";

const [S, W, N, E] = INDOOR_BBOX;
const QUERY = `[out:json][timeout:180][bbox:${S},${W},${N},${E}];way["highway"];out body;>;out skel qt;`;
// Public Overpass mirrors are often down; try each in turn.
const MIRRORS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
/** A connector end must land on a Protected node at most this far away, or the build fails. */
const CONNECTOR_SNAP_M = 30;

interface OsmNode { type: "node"; id: number; lat: number; lon: number }
interface OsmWay { type: "way"; id: number; nodes: number[]; tags?: Record<string, string> }
interface OsmFile { osm3s?: { timestamp_osm_base?: string }; elements: (OsmNode | OsmWay)[] }
export interface Connector { name: string; from: LatLng; to: LatLng; note: string }

const PED = new Set(["footway", "path", "pedestrian", "steps", "corridor", "elevator", "crossing"]);
const NOT_WALKABLE = new Set(["motorway", "motorway_link", "construction", "proposed", "raceway", "abandoned"]);
const FOOT_OK = new Set(["yes", "designated", "permissive"]);
/**
 * Pedestrian streets tagged tunnel=yes that are (or may be) roofed but open-air: the Clarke Quay canopy (Read, Clarke)
 * and, unverified, Albert/Princess Street by Bugis. Treated as Covered so we never overclaim Protected.
 */
const CANOPY_STREETS = new Set(["Read Street", "Clarke Street", "Albert Street", "Princess Street"]);

function walkable(t: Record<string, string>): boolean {
  if (NOT_WALKABLE.has(t.highway ?? "") || t.foot === "no" || t.area === "yes") return false;
  if ((t.access === "private" || t.access === "no") && !FOOT_OK.has(t.foot ?? "")) return false;
  // Road tunnels (Central Expressway, Fort Canning Tunnel...) are not walkable unless foot access is explicit.
  if (t.tunnel === "yes" && !PED.has(t.highway ?? "") && t.highway !== "cycleway" && !FOOT_OK.has(t.foot ?? "")) return false;
  return true;
}

/**
 * ADR 0002 tiering: corridor / indoor / tunnel=yes on pedestrian ways → Protected; layer/level < 0 alone is NOT
 * (riverside paths under bridges carry it); covered / building_passage → Covered; everything else → Exposed.
 */
export function classify(t: Record<string, string>): Tier {
  if (t.covered === "no" || t.indoor === "no") return "exposed";
  const pedestrian = PED.has(t.highway ?? "") || t.highway === "cycleway";
  const roofed = t.covered === "yes" || t.covered === "building_arcade" || t.tunnel === "building_passage" || t.tunnel === "covered";
  if (!pedestrian) return roofed ? "covered" : "exposed";
  if (CANOPY_STREETS.has(t.name ?? "")) return "covered";
  if (t.highway === "corridor" || (t.indoor && t.indoor !== "no") || t.tunnel === "yes") return "protected";
  return roofed ? "covered" : "exposed";
}

export function buildIndoorGraph(osm: OsmFile, connectors: Connector[]): IndoorGraphData {
  const osmNodes = new Map<number, OsmNode>();
  for (const e of osm.elements) if (e.type === "node") osmNodes.set(e.id, e);
  const inBbox = (n: OsmNode) => n.lat >= S && n.lat <= N && n.lon >= W && n.lon <= E;

  const index = new Map<number, number>(); // OSM node id → our node index
  const nodes: LatLng[] = [];
  const nodeOf = (n: OsmNode) => {
    let i = index.get(n.id);
    if (i === undefined) {
      i = nodes.push([Math.round(n.lat * 1e6) / 1e6, Math.round(n.lon * 1e6) / 1e6]) - 1;
      index.set(n.id, i);
    }
    return i;
  };
  const names: string[] = [];
  const nameIdx = new Map<string, number>();
  const nameOf = (s: string | undefined) => {
    if (!s) return -1;
    let i = nameIdx.get(s);
    if (i === undefined) nameIdx.set(s, (i = names.push(s) - 1));
    return i;
  };

  const edges: IndoorGraphData["edges"] = [];
  const seen = new Set<string>();
  for (const e of osm.elements) {
    if (e.type !== "way" || !e.tags?.highway || !walkable(e.tags)) continue;
    const tier = TIER_CODE[classify(e.tags)];
    const name = nameOf(e.tags.name);
    for (let i = 1; i < e.nodes.length; i++) {
      const a = osmNodes.get(e.nodes[i - 1]!);
      const b = osmNodes.get(e.nodes[i]!);
      if (!a || !b || (!inBbox(a) && !inBbox(b))) continue; // `>` pulls in whole ways; clip to the bbox
      const ai = nodeOf(a);
      const bi = nodeOf(b);
      const key = ai < bi ? `${ai}-${bi}` : `${bi}-${ai}`;
      if (ai === bi || seen.has(key)) continue;
      seen.add(key);
      edges.push([ai, bi, tier, name]);
    }
  }

  // Connectors bridge real Indoor Links missing from OSM: snap each end to the nearest Protected node.
  const protectedNodes = new Set<number>();
  for (const [a, b, t] of edges) if (t === TIER_CODE.protected) protectedNodes.add(a).add(b);
  const snap = (p: LatLng, label: string) => {
    let best = -1;
    let bestD = Infinity;
    for (const i of protectedNodes) {
      const d = distanceMetres(p, nodes[i]!);
      if (d < bestD) [best, bestD] = [i, d];
    }
    if (best < 0 || bestD > CONNECTOR_SNAP_M) throw new Error(`connector "${label}": no Protected node within ${CONNECTOR_SNAP_M} m (nearest ${bestD.toFixed(0)} m)`);
    return best;
  };
  for (const c of connectors) edges.push([snap(c.from, c.name), snap(c.to, c.name), TIER_CODE.protected, nameOf(`${c.name} (connector)`)]);

  return {
    license: "ODbL-1.0",
    attribution: "© OpenStreetMap contributors. Derived from OpenStreetMap data available under the Open Database License (https://opendatacommons.org/licenses/odbl/1-0/). Rebuild with scripts/build-indoor-graph.ts.",
    osmTimestamp: osm.osm3s?.timestamp_osm_base ?? "unknown",
    bbox: INDOOR_BBOX,
    connectors: connectors.map((c) => c.name),
    nodes,
    edges,
    names,
  };
}

async function fetchOsm(out: string): Promise<void> {
  for (const url of MIRRORS) {
    const res = await fetch(url, {
      method: "POST",
      body: new URLSearchParams({ data: QUERY }),
      headers: { "User-Agent": "haze-gowhere/0.1 (github.com/blurboy1985/haze-gowhere)", Accept: "application/json" },
    }).catch(() => undefined);
    const body = res?.ok ? await res.text() : "";
    if (body.startsWith("{")) {
      writeFileSync(out, body);
      console.error(`fetched ${body.length} bytes from ${url}`);
      return;
    }
    console.error(`${url}: ${res?.status ?? "network error"}`);
  }
  throw new Error("every Overpass mirror failed; try again later");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === (await import("node:path")).resolve(process.argv[1]);
if (isMain) {
  const args = process.argv.slice(2);
  const osmPath = args.find((a) => !a.startsWith("--"));
  if (!osmPath) {
    console.error("Usage: npm run build:indoor -- [--fetch] <osm.json>");
    process.exit(1);
  }
  if (args.includes("--fetch")) await fetchOsm(osmPath);
  const connectors: Connector[] = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/indoor-connectors.json", import.meta.url)), "utf8"));
  const graph = buildIndoorGraph(JSON.parse(readFileSync(osmPath, "utf8")), connectors);
  const target = fileURLToPath(new URL("../server/data/cbd-indoor-graph.json", import.meta.url));
  writeFileSync(target, JSON.stringify(graph));
  const counts = [0, 0, 0];
  for (const e of graph.edges) counts[e[2]]!++;
  console.log(`Wrote ${graph.nodes.length} nodes, ${graph.edges.length} edges (protected ${counts[0]}, covered ${counts[1]}, exposed ${counts[2]}), ${connectors.length} connectors → ${target}`);
}
