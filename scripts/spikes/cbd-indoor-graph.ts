/**
 * Throwaway spike for issue #7: can OSM's indoor/underground walkways in the CBD route through Protected space?
 * Not production code; nothing in src/ or server/ imports it. Findings: docs/spikes/2026-10-cbd-indoor-graph.md.
 *
 *   npx tsx scripts/spikes/cbd-indoor-graph.ts <osm.json> --fetch   # download from Overpass, then analyse
 *   npx tsx scripts/spikes/cbd-indoor-graph.ts <osm.json>           # analyse a saved download (offline)
 *
 * Keep the download outside the repo: OSM data is ODbL, and committing it would make this repo a derived database.
 *
 * Builds a walking graph from every highway=* way in the CBD bbox (snapping on shared OSM node ids), gives each edge
 * an Exposure Tier from its tags, then reports Protected-only connectivity and tier-weighted Dijkstra routes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { LatLng, Tier } from "../../src/domain/types";

const BBOX = "1.275,103.840,1.305,103.865";
const QUERY = `[out:json][timeout:180][bbox:${BBOX}];way["highway"];out body;>;out skel qt;`;
// overpass-api.de answered 406/502 and kumi.systems 500 during the spike; the mail.ru mirror worked.
const MIRRORS = ["https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass-api.de/api/interpreter"];
const WALK_M_PER_MIN = 80;
const K = 6; // cost = minutes + K × Exposed minutes (Band 4 / "always minimise")
const SNAP_INSIDE_M = 150;

interface OsmNode { type: "node"; id: number; lat: number; lon: number }
interface OsmWay { type: "way"; id: number; nodes: number[]; tags: Record<string, string> }
type Basis = "corridor" | "indoor" | "tunnel" | "layer" | "covered" | "open";
interface Edge { to: number; m: number; tier: Tier; basis: Basis; way: OsmWay }

const PED = new Set(["footway", "path", "pedestrian", "steps", "corridor", "elevator", "crossing"]);
const NOT_WALKABLE = new Set(["motorway", "motorway_link", "construction", "proposed", "raceway", "abandoned"]);
const FOOT_OK = new Set(["yes", "designated", "permissive"]);

// ---------- data ----------

async function fetchOsm(out: string): Promise<void> {
  for (const url of MIRRORS) {
    const res = await fetch(url, { method: "POST", body: new URLSearchParams({ data: QUERY }), headers: { "User-Agent": "haze-gowhere-spike/0.1", Accept: "application/json" } }).catch(() => undefined);
    const body = res?.ok ? await res.text() : "";
    if (body.startsWith("{")) { writeFileSync(out, body); console.error(`fetched ${body.length} bytes from ${url}`); return; }
    console.error(`${url}: ${res?.status ?? "network error"}`);
  }
  throw new Error("every Overpass mirror failed");
}

function walkable(w: OsmWay): boolean {
  const t = w.tags;
  if (NOT_WALKABLE.has(t.highway ?? "") || t.foot === "no" || t.area === "yes") return false;
  if ((t.access === "private" || t.access === "no") && !FOOT_OK.has(t.foot ?? "")) return false;
  // Road tunnels (Central Expressway, Fort Canning Tunnel...) are not walkable unless foot access is explicit.
  if (t.tunnel === "yes" && !PED.has(t.highway ?? "") && t.highway !== "cycleway" && !FOOT_OK.has(t.foot ?? "")) return false;
  return true;
}

/**
 * Spike rule from #7: corridor / indoor / tunnel / layer<0 → Protected; covered → Covered; else Exposed.
 * Only pedestrian ways and cycleways can be Protected: a service road at layer=-1 is a car-park ramp or basement
 * driveway, not somewhere we would send a walker.
 */
function classify(t: Record<string, string>): { tier: Tier; basis: Basis } {
  if (t.covered === "no" || t.indoor === "no") return { tier: "exposed", basis: "open" };
  if (!PED.has(t.highway ?? "") && t.highway !== "cycleway") return t.covered === "yes" ? { tier: "covered", basis: "covered" } : { tier: "exposed", basis: "open" };
  if (t.highway === "corridor") return { tier: "protected", basis: "corridor" };
  if (t.indoor && t.indoor !== "no") return { tier: "protected", basis: "indoor" };
  if (t.tunnel === "yes") return { tier: "protected", basis: "tunnel" };
  if (/^-\d/.test(t.layer ?? "") || /^-\d/.test(t.level ?? "")) return { tier: "protected", basis: "layer" };
  // building_passage is a ground-level opening through a building: roofed but open-air, so Covered not Protected.
  if (t.covered === "yes" || t.covered === "building_arcade" || t.tunnel === "building_passage" || t.tunnel === "covered") return { tier: "covered", basis: "covered" };
  return { tier: "exposed", basis: "open" };
}

function haversine(a: OsmNode, b: OsmNode): number {
  const r = Math.PI / 180, R = 6371008.8;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const distTo = (n: OsmNode, [lat, lon]: LatLng) => haversine(n, { type: "node", id: 0, lat, lon });
const [S, W, N, E] = BBOX.split(",").map(Number) as [number, number, number, number];
const inBbox = (n: OsmNode) => n.lat >= S && n.lat <= N && n.lon >= W && n.lon <= E;

// ---------- graph ----------

interface Graph { nodes: Map<number, OsmNode>; adj: Map<number, Edge[]>; edges: { a: number; b: number; e: Edge }[]; ways: OsmWay[] }

function buildGraph(elements: (OsmNode | OsmWay)[]): Graph {
  const nodes = new Map<number, OsmNode>();
  for (const e of elements) if (e.type === "node") nodes.set(e.id, e);
  const ways = elements.filter((e): e is OsmWay => e.type === "way" && !!e.tags?.highway);
  const adj = new Map<number, Edge[]>();
  const edges: Graph["edges"] = [];
  const link = (a: number, e: Edge) => (adj.get(a) ?? adj.set(a, []).get(a)!).push(e);
  for (const w of ways.filter(walkable)) {
    const { tier, basis } = classify(w.tags);
    for (let i = 1; i < w.nodes.length; i++) {
      const a = nodes.get(w.nodes[i - 1]!), b = nodes.get(w.nodes[i]!);
      if (!a || !b || (!inBbox(a) && !inBbox(b))) continue; // `>` pulls in whole ways; clip to the bbox
      const m = haversine(a, b);
      const e = { to: b.id, m, tier, basis, way: w };
      link(a.id, e);
      link(b.id, { ...e, to: a.id }); // walking ignores oneway
      edges.push({ a: a.id, b: b.id, e });
    }
  }
  return { nodes, adj, edges, ways };
}

class UnionFind {
  private parent = new Map<number, number>();
  find(x: number): number {
    let p = this.parent.get(x) ?? x;
    if (p !== x) { p = this.find(p); this.parent.set(x, p); }
    return p;
  }
  union(a: number, b: number) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.parent.set(ra, rb); }
}

interface Component { root: number; nodes: Set<number>; m: number; names: Map<string, number> }

function components(g: Graph, keep: (e: Edge) => boolean, joinWithinM = 0): Component[] {
  const uf = new UnionFind();
  const kept = g.edges.filter(({ e }) => keep(e));
  for (const { a, b } of kept) uf.union(a, b);
  if (joinWithinM > 0) {
    // Pretend mapping gaps shorter than joinWithinM are real links (e.g. a corridor that stops at a mall's wall).
    const ids = [...new Set(kept.flatMap(({ a, b }) => [a, b]))];
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        if (haversine(g.nodes.get(ids[i]!)!, g.nodes.get(ids[j]!)!) <= joinWithinM) uf.union(ids[i]!, ids[j]!);
  }
  const out = new Map<number, Component>();
  for (const { a, b, e } of kept) {
    const root = uf.find(a);
    const c = out.get(root) ?? out.set(root, { root, nodes: new Set(), m: 0, names: new Map() }).get(root)!;
    c.nodes.add(a).add(b);
    c.m += e.m;
    const name = e.way.tags.name;
    if (name) c.names.set(name, (c.names.get(name) ?? 0) + e.m);
  }
  return [...out.values()].sort((x, y) => y.m - x.m);
}

// ---------- routing ----------

interface Leg { tier: Tier; m: number; name: string }
interface PathResult { m: number; byTier: Record<Tier, number>; legs: Leg[] }

function dijkstra(g: Graph, from: number, to: number, k: number): PathResult | undefined {
  const dist = new Map<number, number>([[from, 0]]);
  const prev = new Map<number, { node: number; e: Edge }>();
  const heap: [number, number][] = [[0, from]];
  const push = (item: [number, number]) => { heap.push(item); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p]![0] <= heap[i]![0]) break; [heap[p], heap[i]] = [heap[i]!, heap[p]!]; i = p; } };
  const pop = (): [number, number] => {
    const top = heap[0]!, last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) { const l = 2 * i + 1, r = l + 1; let s = i; if (l < heap.length && heap[l]![0] < heap[s]![0]) s = l; if (r < heap.length && heap[r]![0] < heap[s]![0]) s = r; if (s === i) break; [heap[s], heap[i]] = [heap[i]!, heap[s]!]; i = s; }
    }
    return top;
  };
  while (heap.length) {
    const [d, u] = pop();
    if (d > (dist.get(u) ?? Infinity)) continue;
    if (u === to) break;
    for (const e of g.adj.get(u) ?? []) {
      const min = e.m / WALK_M_PER_MIN;
      const nd = d + min + (e.tier === "exposed" ? k * min : 0);
      if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, { node: u, e }); push([nd, e.to]); }
    }
  }
  if (!dist.has(to)) return undefined;
  const steps: Edge[] = [];
  for (let n = to; n !== from; ) { const p = prev.get(n)!; steps.push(p.e); n = p.node; }
  steps.reverse();
  const byTier: Record<Tier, number> = { protected: 0, covered: 0, exposed: 0 };
  const legs: Leg[] = [];
  for (const e of steps) {
    byTier[e.tier] += e.m;
    const name = e.way.tags.name ?? `${e.way.tags.highway}${e.basis === "open" ? "" : `/${e.basis}`}`;
    const last = legs[legs.length - 1];
    if (last && last.tier === e.tier) { last.m += e.m; if (!last.name.includes(name) && last.name.split(" › ").length < 4) last.name += ` › ${name}`; }
    else legs.push({ tier: e.tier, m: e.m, name });
  }
  return { m: steps.reduce((s, e) => s + e.m, 0), byTier, legs };
}

function nearest(g: Graph, p: LatLng, ok: (id: number) => boolean): { id: number; m: number } | undefined {
  let best: { id: number; m: number } | undefined;
  for (const id of g.adj.keys()) {
    if (!ok(id)) continue;
    const m = distTo(g.nodes.get(id)!, p);
    if (!best || m < best.m) best = { id, m };
  }
  return best;
}

// ---------- report ----------

const LANDMARKS: { name: string; at: LatLng; match: RegExp }[] = [
  { name: "CityLink Mall", at: [1.2922, 103.85454], match: /CityLink/i },
  { name: "Esplanade Xchange", at: [1.29261, 103.85503], match: /Esplanade Xchange/i },
  { name: "Raffles City", at: [1.2939, 103.85335], match: /^Raffles City/i },
  { name: "One Raffles Link", at: [1.29205, 103.85587], match: /One Raffles Link/i },
  { name: "Suntec City", at: [1.29499, 103.85788], match: /Suntec/i },
  { name: "Marina Square", at: [1.29129, 103.85753], match: /Marina Square/i },
];

const ROUTES: { name: string; from: LatLng; to: LatLng; onemap: string }[] = [
  { name: "Raffles Place MRT → Suntec City", from: [1.284, 103.8515], to: [1.295, 103.858], onemap: "not in tuning set" },
  { name: "Bugis Junction → Suntec City", from: [1.2995, 103.8555], to: [1.295, 103.858], onemap: "Bus 133: 10 min, E 6, C 0" },
  { name: "Raffles Place → Marina Bay Sands", from: [1.284, 103.8515], to: [1.2834, 103.8607], onemap: "NSL → CCL: 13 min, E 6, C 2" },
  // Station egress: the walk a hybrid (OneMap train + OSM indoor last mile) would replace.
  { name: "City Hall MRT → Suntec City", from: [1.29305, 103.85262], to: [1.295, 103.858], onemap: "" },
  { name: "Esplanade MRT → Suntec City", from: [1.29344, 103.85553], to: [1.295, 103.858], onemap: "" },
  { name: "Promenade MRT → Suntec City", from: [1.29311, 103.86056], to: [1.295, 103.858], onemap: "" },
  { name: "Bayfront MRT → Marina Bay Sands", from: [1.2826, 103.85968], to: [1.2834, 103.8607], onemap: "" },
  { name: "Bayfront MRT → The Shoppes at MBS", from: [1.2826, 103.85968], to: [1.28402, 103.85889], onemap: "" },
  { name: "Bugis MRT → Bugis Junction", from: [1.29995, 103.85628], to: [1.2995, 103.8555], onemap: "" },
];

const km = (m: number) => (m / 1000).toFixed(2);
const mins = (m: number) => (m / WALK_M_PER_MIN).toFixed(1);

function landmarkComponents(g: Graph, comps: Component[]): Map<string, Set<number>> {
  const owner = new Map<number, number>();
  comps.forEach((c, i) => c.nodes.forEach((n) => owner.set(n, i)));
  const out = new Map<string, Set<number>>();
  for (const l of LANDMARKS) {
    const hits = new Set<number>();
    for (const { a, e } of g.edges) if (e.tier === "protected" && l.match.test(e.way.tags.name ?? "") && owner.has(a)) hits.add(owner.get(a)!);
    if (!hits.size) for (const [n, i] of owner) if (distTo(g.nodes.get(n)!, l.at) <= 80) hits.add(i);
    out.set(l.name, hits);
  }
  return out;
}

function gap(g: Graph, a: Component, b: Component): number {
  let best = Infinity;
  for (const x of a.nodes) for (const y of b.nodes) best = Math.min(best, haversine(g.nodes.get(x)!, g.nodes.get(y)!));
  return best;
}

function connectivitySection(g: Graph, title: string, keep: (e: Edge) => boolean, joinWithinM = 0): string[] {
  const comps = components(g, keep, joinWithinM);
  const total = comps.reduce((s, c) => s + c.m, 0);
  const small = comps.filter((c) => c.m < 100).length;
  const lines = [`### ${title}`, "", `${comps.length} components, ${km(total)} km. Largest 5 hold ${((comps.slice(0, 5).reduce((s, c) => s + c.m, 0) / total) * 100).toFixed(0)}% of the length; ${small} components are shorter than 100 m.`, ""];
  lines.push("| # | Length | Nodes | Main names |", "|---|---|---|---|");
  comps.slice(0, 10).forEach((c, i) => {
    const names = [...c.names.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4).map(([n]) => n).join(", ") || "(unnamed)";
    lines.push(`| ${i} | ${c.m.toFixed(0)} m | ${c.nodes.size} | ${names} |`);
  });
  const lm = landmarkComponents(g, comps);
  lines.push("", "| Landmark | Component(s) |", "|---|---|");
  for (const [name, set] of lm) lines.push(`| ${name} | ${set.size ? [...set].sort((x, y) => x - y).join(", ") : "none"} |`);
  const all = new Set([...lm.values()].flatMap((s) => [...s]));
  const shared = [...all].filter((i) => [...lm.values()].every((s) => s.has(i)));
  lines.push("", `All six landmarks share one component: **${shared.length ? `yes (#${shared.join(", #")})` : "no"}** (${all.size} distinct components touched).`);
  // Gaps between the components the landmarks touch.
  const touched = [...all].sort((x, y) => x - y);
  if (touched.length > 1 && touched.length <= 12) {
    lines.push("", "Closest approach between landmark components:", "");
    for (let i = 0; i < touched.length; i++)
      for (let j = i + 1; j < touched.length; j++) {
        const d = gap(g, comps[touched[i]!]!, comps[touched[j]!]!);
        if (d <= 150) lines.push(`- ${touched[i]} ↔ ${touched[j]}: ${d.toFixed(0)} m`);
      }
  }
  return lines;
}

function routeSection(g: Graph): string[] {
  // Snap only onto the main walk network, so a start point on an unconnected mall-interior island still routes.
  const main = components(g, () => true)[0]!.nodes;
  const isProtected = (id: number) => main.has(id) && (g.adj.get(id) ?? []).some((e) => e.tier === "protected");
  const lines = ["## Routes", "", `Cost = minutes + ${K} × Exposed minutes, ${WALK_M_PER_MIN} m/min. "Street" snaps each end to the nearest walkable node; "inside" snaps to the nearest Protected node within ${SNAP_INSIDE_M} m (i.e. you start in the station or finish inside the mall).`, ""];
  lines.push("| Route | Snap | k | Walk | Exposed | Covered | Protected | Snap gap (from/to) | OneMap |", "|---|---|---|---|---|---|---|---|---|");
  const details: string[] = [];
  for (const r of ROUTES) {
    for (const mode of ["street", "inside"] as const) {
      const snap = (p: LatLng) => (mode === "inside" ? nearest(g, p, (id) => isProtected(id) && distTo(g.nodes.get(id)!, p) <= SNAP_INSIDE_M) : undefined) ?? nearest(g, p, (id) => main.has(id))!;
      const a = snap(r.from), b = snap(r.to);
      for (const k of [0, K]) {
        const res = dijkstra(g, a.id, b.id, k);
        if (!res) { lines.push(`| ${r.name} | ${mode} | ${k} | unreachable | | | | | |`); continue; }
        const t = res.byTier;
        lines.push(`| ${r.name} | ${mode} | ${k} | ${mins(res.m)} min | ${mins(t.exposed)} | ${mins(t.covered)} | ${mins(t.protected)} | ${a.m.toFixed(0)} m / ${b.m.toFixed(0)} m | ${k === K && mode === "street" ? r.onemap : ""} |`);
        if (k === K) details.push(`- **${r.name}** (${mode}, k=${K}): ${res.legs.filter((l) => l.m >= 15).map((l) => `${l.tier[0]!.toUpperCase()} ${l.m.toFixed(0)} m ${l.name}`).join(" → ")}`);
      }
    }
  }
  return [...lines, "", "Legs ≥ 15 m (P/C/E = tier):", "", ...details];
}

function dataQuality(g: Graph): string[] {
  const walkWays = g.ways.filter(walkable);
  const byBasis = new Map<Basis, number>();
  for (const { e } of g.edges) byBasis.set(e.basis, (byBasis.get(e.basis) ?? 0) + e.m);
  const prot = g.edges.filter(({ e }) => e.tier === "protected");
  const protPed = prot.filter(({ e }) => PED.has(e.way.tags.highway ?? ""));
  const unnamed = prot.filter(({ e }) => !e.way.tags.name).reduce((s, { e }) => s + e.m, 0);
  const withLevel = prot.filter(({ e }) => e.way.tags.level !== undefined).reduce((s, { e }) => s + e.m, 0);
  const protM = prot.reduce((s, { e }) => s + e.m, 0);
  const deadEnds = [...new Set(prot.flatMap(({ a, b }) => [a, b]))].filter((n) => (g.adj.get(n) ?? []).length === 1).length;
  return [
    "## Data quality", "",
    `- ${g.ways.length} highway ways in bbox, ${walkWays.length} walkable, ${g.edges.length} edges, ${km(g.edges.reduce((s, x) => s + x.e.m, 0))} km.`,
    `- Edge length by basis: ${[...byBasis.entries()].map(([b, m]) => `${b} ${km(m)} km`).join(", ")}.`,
    `- Protected ${km(protM)} km, of which ${km(protPed.reduce((s, { e }) => s + e.m, 0))} km on pedestrian highway types; ${((unnamed / protM) * 100).toFixed(0)}% unnamed; ${((withLevel / protM) * 100).toFixed(0)}% carry a level=* tag.`,
    `- Protected nodes that are dead ends (degree 1 in the whole graph): ${deadEnds}.`,
    "",
  ];
}

const [dataPath] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!dataPath) throw new Error("usage: tsx scripts/spikes/cbd-indoor-graph.ts <osm.json> [--fetch]");
if (process.argv.includes("--fetch")) await fetchOsm(dataPath);
const osm = JSON.parse(readFileSync(dataPath, "utf8")) as { osm3s?: { timestamp_osm_base?: string }; elements: (OsmNode | OsmWay)[] };
const g = buildGraph(osm.elements);
const protectedOnly = (e: Edge) => e.tier === "protected";
const strict = (e: Edge) => e.tier === "protected" && e.basis !== "layer";
console.log([
  `# CBD indoor graph spike: bbox ${BBOX}, OSM data as of ${osm.osm3s?.timestamp_osm_base ?? "unknown"}`, "",
  ...dataQuality(g),
  "## Connectivity", "",
  ...connectivitySection(g, "Protected-only (corridor / indoor / tunnel / layer<0)", protectedOnly), "",
  ...connectivitySection(g, "Strict Protected (no layer-only edges)", strict), "",
  ...connectivitySection(g, "Protected-only, joining gaps ≤ 25 m", protectedOnly, 25), "",
  ...connectivitySection(g, "Protected + Covered", (e) => e.tier !== "exposed"), "",
  ...routeSection(g),
].join("\n"));
