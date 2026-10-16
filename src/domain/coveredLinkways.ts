import { distanceMetres, distanceToSegmentMetres, midpoint } from "./geo";
import type { LatLng } from "./types";

/** A walking step within this distance of a covered linkway counts as walking under it. */
const COVERED_TOLERANCE_M = 12;
/** Grid cell size in degrees (~110 m). */
const CELL_DEG = 0.001;

type Segment = [LatLng, LatLng];

/** Spatial index over LTA covered-linkway line segments. */
export class CoveredLinkwayIndex {
  private cells = new Map<string, Segment[]>();
  readonly segmentCount: number;

  constructor(lines: LatLng[][]) {
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
