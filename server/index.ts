import "dotenv/config";
import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApi } from "./api";
import { loadIndoorGraph } from "./indoor";
import { loadCoveredLinkways } from "./linkways";

/** Local / Docker server. Cloudflare runs the same API from worker/index.ts. */
const api = createApi({
  env: process.env,
  loadLinkways: async () => loadCoveredLinkways(),
  loadIndoor: async () => loadIndoorGraph(),
});

const app = express();

app.get("/api/*", async (req, res) => {
  const url = new URL(req.originalUrl, "http://localhost");
  const result = (await api.handle(url.pathname, url.searchParams)) ?? { status: 404, body: { error: "Not found" } };
  res.status(result.status).json(result.body);
});

// Production: serve the built web app from the same origin.
const dist = fileURLToPath(new URL("../dist", import.meta.url));
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(`${dist}/index.html`));
}

const port = Number(process.env.API_PORT ?? 8787);
app.listen(port, () => console.log(`[server] http://localhost:${port} (routing: ${api.mock ? "MOCK" : "OneMap"})`));
