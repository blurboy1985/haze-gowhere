import "dotenv/config";
import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { LatLng } from "../src/domain/types";
import { latestHazeReading } from "./haze";
import { loadCoveredLinkways } from "./linkways";
import { mockDrive, mockPublicTransport, mockWalk } from "./mock";
import { OneMapClient } from "./onemap";
import { planTrip, type RouteSource } from "./planTrip";

const onemap = new OneMapClient(process.env.ONEMAP_EMAIL ?? "", process.env.ONEMAP_PASSWORD ?? "");
const mock = process.env.MOCK_ROUTING === "1" || !onemap.hasCredentials;
const source: RouteSource = mock
  ? { walk: async (a, b) => mockWalk(a, b), drive: async (a, b) => mockDrive(a, b), publicTransport: async (a, b, t) => mockPublicTransport(a, b, t) }
  : onemap;
const linkways = loadCoveredLinkways();

/** Rough Singapore bounding box; rejects points OneMap cannot route. */
function parsePoint(raw: unknown): LatLng | null {
  if (typeof raw !== "string") return null;
  const [lat, lng] = raw.split(",").map(Number);
  if (lat === undefined || lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < 1.15 || lat > 1.48 || lng < 103.6 || lng > 104.1) return null;
  return [lat, lng];
}

const app = express();

app.get("/api/haze", async (_req, res) => {
  try {
    res.json(await latestHazeReading());
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Haze readings are unavailable right now." });
  }
});

app.get("/api/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) return res.json([]);
  try {
    res.json(await onemap.search(q));
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Search is unavailable right now." });
  }
});

app.get("/api/reverse", async (req, res) => {
  const point = parsePoint(req.query.at);
  if (!point) return res.status(400).json({ error: "Point must be in Singapore." });
  if (mock) return res.json({ name: null });
  try {
    res.json({ name: await onemap.reverseGeocode(point) });
  } catch (err) {
    console.error(err);
    res.json({ name: null });
  }
});

app.get("/api/routes", async (req, res) => {
  const start = parsePoint(req.query.from);
  const end = parsePoint(req.query.to);
  if (!start || !end) return res.status(400).json({ error: "Starting Point and Destination must both be in Singapore." });
  try {
    const haze = await latestHazeReading();
    res.json(await planTrip({ start, end, alwaysMinimise: req.query.minimise === "1", when: new Date() }, source, haze, linkways, mock));
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Could not plan routes right now. Please try again." });
  }
});

// Production: serve the built web app from the same origin.
const dist = fileURLToPath(new URL("../dist", import.meta.url));
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(`${dist}/index.html`));
}

const port = Number(process.env.API_PORT ?? 8787);
app.listen(port, () => console.log(`[server] http://localhost:${port} (routing: ${mock ? "MOCK" : "OneMap"})`));
