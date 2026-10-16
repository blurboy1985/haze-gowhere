import { distanceMetres } from "./geo";
import type { LatLng, Tier } from "./types";

/** CBD bbox [south, west, north, east] covered by the indoor graph (ADR 0002). */
export const INDOOR_BBOX: [number, number, number, number] = [1.275, 103.84, 1.305, 103.865];

export const TIER_CODE = { protected: 0, covered: 1, exposed: 2 } as const satisfies Record<Tier, number>;
const TIERS: Tier[] = ["protected", "covered", "exposed"];

/** Serialized graph (server/data/cbd-indoor-graph.json). Edges: [nodeA, nodeB, tierCode, nameIndex | -1]. */
export interface IndoorGraphData {
  license: string;
  attribution: string;
  osmTimestamp: string;
  bbox: [number, number, number, number];
  connectors: string[];
  nodes: LatLng[];
  edges: [number, number, 0 | 1 | 2, number][];
  names: string[];
}

export const INDOOR_WALK_M_PER_MIN = 80;
/** Path search weights Exposure like Band 4, since the point of an Indoor Variant is to cut Exposed time. */
const SEARCH_K = 6;
const TIER_WEIGHT = [1, 1 + SEARCH_K / 4, 1 + SEARCH_K];

export interface IndoorRun {
  tier: Tier;
  metres: number;
  path: LatLng[];
  /** Named ways along this run, e.g. "CityLink Mall". */
  names: string[];
}

export function inIndoorBbox([lat, lng]: LatLng): boolean {
  const [s, w, n, e] = INDOOR_BBOX;
  return lat >= s && lat <= n && lng >= w && lng <= e;
}

export class IndoorGraph {
  readonly nodes: LatLng[];
  readonly names: string[];
  readonly osmTimestamp: string;
  // Compressed adjacency: neighbours of node i are adj[start[i]..start[i+1]).
  private start: Int32Array;
  private adjNode: Int32Array;
  private adjTier: Uint8Array;
  private adjName: Int32Array;
  private adjMetres: Float32Array;
  private protectedNode: Uint8Array;

  constructor(data: IndoorGraphData) {
    this.nodes = data.nodes;
    this.names = data.names;
    this.osmTimestamp = data.osmTimestamp;
    const n = data.nodes.length;
    const degree = new Int32Array(n + 1);
    for (const [a, b] of data.edges) {
      degree[a]!++;
      degree[b]!++;
    }
    this.start = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) this.start[i + 1] = this.start[i]! + degree[i]!;
    const m = this.start[n]!;
    this.adjNode = new Int32Array(m);
    this.adjTier = new Uint8Array(m);
    this.adjName = new Int32Array(m);
    this.adjMetres = new Float32Array(m);
    this.protectedNode = new Uint8Array(n);
    const fill = this.start.slice(0, n);
    const put = (from: number, to: number, tier: number, name: number, metres: number) => {
      const k = fill[from]!++;
      this.adjNode[k] = to;
      this.adjTier[k] = tier;
      this.adjName[k] = name;
      this.adjMetres[k] = metres;
    };
    for (const [a, b, tier, name] of data.edges) {
      const metres = distanceMetres(data.nodes[a]!, data.nodes[b]!);
      put(a, b, tier, name, metres);
      put(b, a, tier, name, metres);
      if (tier === TIER_CODE.protected) this.protectedNode[a] = this.protectedNode[b] = 1;
    }
  }

  /** Nearest node within maxM (optionally only nodes on a Protected edge), or null. */
  snap(p: LatLng, maxM: number, protectedOnly = false): { node: number; metres: number } | null {
    let best = -1;
    let bestD = maxM;
    for (let i = 0; i < this.nodes.length; i++) {
      if (protectedOnly && !this.protectedNode[i]) continue;
      const q = this.nodes[i]!;
      // Cheap reject before the trig: 1e-3 degrees is ~111 m.
      if (Math.abs(q[0] - p[0]) * 111_000 > bestD || Math.abs(q[1] - p[1]) * 111_000 > bestD) continue;
      const d = distanceMetres(p, q);
      if (d <= bestD) [best, bestD] = [i, d];
    }
    return best < 0 ? null : { node: best, metres: bestD };
  }

  /** Least-Exposure walk between two nodes, as consecutive same-tier runs; null if unreachable. */
  route(from: number, to: number): IndoorRun[] | null {
    const n = this.nodes.length;
    const cost = new Float64Array(n).fill(Infinity);
    const prevEdge = new Int32Array(n).fill(-1);
    const prevNode = new Int32Array(n).fill(-1);
    const heap = new MinHeap();
    cost[from] = 0;
    heap.push(0, from);
    while (heap.size) {
      const [c, u] = heap.pop();
      if (c > cost[u]!) continue;
      if (u === to) break;
      for (let k = this.start[u]!; k < this.start[u + 1]!; k++) {
        const v = this.adjNode[k]!;
        const nc = c + (this.adjMetres[k]! / INDOOR_WALK_M_PER_MIN) * TIER_WEIGHT[this.adjTier[k]!]!;
        if (nc < cost[v]!) {
          cost[v] = nc;
          prevEdge[v] = k;
          prevNode[v] = u;
          heap.push(nc, v);
        }
      }
    }
    if (cost[to] === Infinity) return null;

    const steps: number[] = [];
    for (let v = to; v !== from; v = prevNode[v]!) steps.push(prevEdge[v]!);
    steps.reverse();
    const runs: IndoorRun[] = [];
    let at = from;
    for (const k of steps) {
      const tier = TIERS[this.adjTier[k]!]!;
      const next = this.adjNode[k]!;
      const name = this.adjName[k]! >= 0 ? this.names[this.adjName[k]!]! : null;
      const last = runs[runs.length - 1];
      if (last && last.tier === tier) {
        last.path.push(this.nodes[next]!);
        last.metres += this.adjMetres[k]!;
        if (name && !last.names.includes(name)) last.names.push(name);
      } else {
        runs.push({ tier, metres: this.adjMetres[k]!, path: [this.nodes[at]!, this.nodes[next]!], names: name ? [name] : [] });
      }
      at = next;
    }
    return runs;
  }
}

class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(key: number, val: number) {
    const { keys, vals } = this;
    let i = keys.push(key) - 1;
    vals.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p]! <= key) break;
      keys[i] = keys[p]!;
      vals[i] = vals[p]!;
      i = p;
    }
    keys[i] = key;
    vals[i] = val;
  }
  pop(): [number, number] {
    const { keys, vals } = this;
    const top: [number, number] = [keys[0]!, vals[0]!];
    const key = keys.pop()!;
    const val = vals.pop()!;
    if (keys.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= keys.length) break;
        const r = l + 1;
        const c = r < keys.length && keys[r]! < keys[l]! ? r : l;
        if (keys[c]! >= key) break;
        keys[i] = keys[c]!;
        vals[i] = vals[c]!;
        i = c;
      }
      keys[i] = key;
      vals[i] = val;
    }
    return top;
  }
}
