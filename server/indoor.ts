import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { IndoorGraph, type IndoorGraphData } from "../src/domain/indoorGraph";

/** CBD indoor walking graph derived from OSM (ODbL); rebuild with `npm run build:indoor`. See ADR 0002. */
export const INDOOR_GRAPH_FILE = fileURLToPath(new URL("./data/cbd-indoor-graph.json", import.meta.url));

export function loadIndoorGraph(): IndoorGraph | null {
  if (!existsSync(INDOOR_GRAPH_FILE)) {
    console.warn(`[indoor] ${INDOOR_GRAPH_FILE} not found: no Indoor Variants`);
    return null;
  }
  const data = JSON.parse(readFileSync(INDOOR_GRAPH_FILE, "utf8")) as IndoorGraphData;
  console.log(`[indoor] loaded CBD indoor graph: ${data.nodes.length} nodes, ${data.edges.length} edges, OSM ${data.osmTimestamp}`);
  return new IndoorGraph(data);
}
