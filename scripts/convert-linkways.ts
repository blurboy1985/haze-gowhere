/**
 * Convert LTA DataMall "Covered Linkway" (SVY21 shapefile) to the WGS84 GeoJSON the server loads.
 *
 *   npx tsx scripts/convert-linkways.ts <path/to/CoveredLinkWay.shp> [Sep2026]
 *
 * Writes server/data/covered-linkways.geojson. Coordinates are rounded to 6 dp (~0.1 m).
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import proj4 from "proj4";
import * as shapefile from "shapefile";

const SVY21 =
  "+proj=tmerc +lat_0=1.366666666666667 +lon_0=103.8333333333333 +k=1 +x_0=28001.642 +y_0=38744.572 +ellps=WGS84 +units=m +no_defs";
const toWgs84 = proj4(SVY21, "WGS84");
const round = (n: number) => Math.round(n * 1e6) / 1e6;

type Ring = number[][];
const convertRing = (ring: Ring): Ring => ring.map(([x, y]) => toWgs84.forward([x!, y!]).map(round));

const [shpPath, edition = "unknown"] = process.argv.slice(2);
if (!shpPath) {
  console.error("Usage: npx tsx scripts/convert-linkways.ts <CoveredLinkWay.shp> [edition, e.g. Sep2026]");
  process.exit(1);
}

const source = await shapefile.open(shpPath);
const features: unknown[] = [];
for (let r = await source.read(); !r.done; r = await source.read()) {
  const g = r.value.geometry;
  if (!g) continue;
  if (g.type === "Polygon") features.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: g.coordinates.map(convertRing) } });
  else if (g.type === "MultiPolygon")
    features.push({ type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: g.coordinates.map((p) => p.map(convertRing)) } });
  else if (g.type === "LineString") features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: convertRing(g.coordinates) } });
}

const out = {
  type: "FeatureCollection",
  attribution: `Contains information from Covered Linkway (${edition}) accessed from LTA DataMall, made available under the Singapore Open Data Licence v1.0`,
  features,
};
const target = fileURLToPath(new URL("../server/data/covered-linkways.geojson", import.meta.url));
writeFileSync(target, JSON.stringify(out));
console.log(`Wrote ${features.length} features to ${target}`);
