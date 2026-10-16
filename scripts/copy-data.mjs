// Copy server/data (LTA linkways, OSM indoor graph) into dist/data so the Cloudflare Worker can load them as assets.
import { cpSync } from "node:fs";
cpSync(new URL("../server/data", import.meta.url), new URL("../dist/data", import.meta.url), { recursive: true });
console.log("copied server/data -> dist/data");
