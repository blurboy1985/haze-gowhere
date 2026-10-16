import { distanceMetres, distanceToSegmentMetres, midpoint } from "./geo";
import type { LatLng } from "./types";

/** A walking step within this distance of a covered linkway counts as walking under it. */
const COVERED_TOLERANCE_M = 12;
/** Grid cell size in degrees (~110 m). */
const CELL_DEG = 0.001;

type Segment = [LatLng, LatLng];

/** Spatial index over LTA covered-linkway outlines (segments) and areas (polygon rings). */
export class CoveredLinkwayIndex {
  private cells = new Map<string, Segment[]>();
  private areaCells = new Map<string, LatLng[][]>();
  readonly segmentCount: number;

  /** `lines`: outlines matched within tolerance. `areas`: closed rings a point can be inside. */
  constructor(lines: LatLng[][], areas: LatLng[][] = []) {
    for (const ring of areas) {
      if (ring.length < 3) continue;
      const lats = ring.map((p) => p[0]);
      const lngs = ring.map((p) => p[1]);
      const box: Segment = [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]];
      for (const key of cellsForSegment(box)) {
        const bucket = this.areaCells.get(key);
        if (bucket) bucket.push(ring);
        else this.areaCells.set(key, [ring]);
      }
    }
    let count = 0;
    for (const line of lines) {
      for (let i = 1; i < line.length; i++) {
        const seg: Segment = [line[i - 1]!, line[i]!];
        for (const key of cellsForSegment(seg)) {
          const bucket = this.cells.get(key);
          if (bucket) bucket.push(seg);
          else this.cells.set(key, [seg]);
        }
        count++;
      }
    }
    this.segmentCount = count;
  }

  static empty(): CoveredLinkwayIndex {
    return new CoveredLinkwayIndex([]);
  }

  isCovered(p: LatLng): boolean {
    const cx = Math.floor(p[1] / CELL_DEG);
    const cy = Math.floor(p[0] / CELL_DEG);
    for (const ring of this.areaCells.get(`${cx}:${cy}`) ?? []) if (insideRing(p, ring)) return true;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const [a, b] of this.cells.get(`${cx + dx}:${cy + dy}`) ?? []) {
          if (distanceToSegmentMetres(p, a, b) <= COVERED_TOLERANCE_M) return true;
        }
      }
    }
    return false;
  }
}

/** Ray-casting point-in-polygon test. */
function insideRing([lat, lng]: LatLng, ring: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i]!;
    const [yj, xj] = ring[j]!;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function* cellsForSegment([a, b]: Segment): Generator<string> {
  const minX = Math.floor(Math.min(a[1], b[1]) / CELL_DEG);
  const maxX = Math.floor(Math.max(a[1], b[1]) / CELL_DEG);
  const minY = Math.floor(Math.min(a[0], b[0]) / CELL_DEG);
  const maxY = Math.floor(Math.max(a[0], b[0]) / CELL_DEG);
  for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) yield `${x}:${y}`;
}

export interface WalkRun {
  covered: boolean;
  path: LatLng[];
  metres: number;
}

/** Split a walking path into consecutive runs that are under a covered linkway or not. */
export function splitWalkByCover(path: LatLng[], index: CoveredLinkwayIndex): WalkRun[] {
  const runs: WalkRun[] = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const covered = index.isCovered(midpoint(a, b));
    const metres = distanceMetres(a, b);
    const last = runs[runs.length - 1];
    if (last && last.covered === covered) {
      last.path.push(b);
      last.metres += metres;
    } else {
      runs.push({ covered, path: [a, b], metres });
    }
  }
  return runs;
}

type Geometry = { type: string; coordinates: unknown };

/** Read line and polygon-outline features (WGS84) from a GeoJSON FeatureCollection. */
export function linesFromGeoJson(geojson: unknown): LatLng[][] {
  const lines: LatLng[][] = [];
  const features = (geojson as { features?: { geometry?: Geometry | null }[] }).features ?? [];
  const toLine = (coords: number[][]) => coords.map(([lng, lat]) => [lat, lng] as LatLng);
  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "LineString") lines.push(toLine(g.coordinates as number[][]));
    else if (g.type === "MultiLineString") for (const l of g.coordinates as number[][][]) lines.push(toLine(l));
    else if (g.type === "Polygon") lines.push(toLine((g.coordinates as number[][][])[0] ?? []));
    else if (g.type === "MultiPolygon") for (const p of g.coordinates as number[][][][]) lines.push(toLine(p[0] ?? []));
  }
  return lines;
}

/** Outer rings of Polygon / MultiPolygon features (WGS84), as [lat, lng]. */
export function areasFromGeoJson(geojson: unknown): LatLng[][] {
  const rings: LatLng[][] = [];
  const features = (geojson as { features?: { geometry?: Geometry | null }[] }).features ?? [];
  const toRing = (coords: number[][]) => coords.map(([lng, lat]) => [lat, lng] as LatLng);
  for (const f of features) {
    const g = f.geometry;
    if (g?.type === "Polygon") rings.push(toRing((g.coordinates as number[][][])[0] ?? []));
    else if (g?.type === "MultiPolygon") for (const p of g.coordinates as number[][][][]) rings.push(toRing(p[0] ?? []));
  }
  return rings;
}
