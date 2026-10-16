import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CoveredLinkwayIndex, linesFromGeoJson } from "../src/domain/coveredLinkways";

/** LTA covered linkways, converted to WGS84 GeoJSON. See README for how to produce this file. */
export const LINKWAY_FILE = fileURLToPath(new URL("./data/covered-linkways.geojson", import.meta.url));

export function loadCoveredLinkways(): CoveredLinkwayIndex {
  if (!existsSync(LINKWAY_FILE)) {
    console.warn(`[linkways] ${LINKWAY_FILE} not found: all walking will count as Exposed`);
    return CoveredLinkwayIndex.empty();
  }
  const index = new CoveredLinkwayIndex(linesFromGeoJson(JSON.parse(readFileSync(LINKWAY_FILE, "utf8"))));
  console.log(`[linkways] loaded ${index.segmentCount} covered-linkway segments`);
  return index;
}
