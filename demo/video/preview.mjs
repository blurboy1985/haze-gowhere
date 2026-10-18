import { chromium } from "playwright-core";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const root = path.resolve(process.argv[2]), page_ = process.argv[3], modes = process.argv[4].split(",");
const srv = http.createServer((q, s) => { try { const p = path.join(root, decodeURIComponent(new URL(q.url, "http://x").pathname)); const b = fs.readFileSync(p); s.writeHead(200, { "Content-Type": p.endsWith(".js") ? "text/javascript" : p.endsWith(".json") ? "application/json" : p.endsWith(".svg") ? "image/svg+xml" : p.endsWith(".png") ? "image/png" : "text/html" }); s.end(b); } catch { s.writeHead(404); s.end(); } }).listen(0);
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } }); pg.on("pageerror", (e) => console.log("ERR", e.stack));
await pg.goto(`http://localhost:${srv.address().port}/${page_}`); await pg.waitForFunction(() => window.ready, null, { timeout: 60000 });
for (const m of modes) { await pg.evaluate((m) => window.renderAt(isNaN(+m) ? m : +m), m); await pg.screenshot({ path: `out/prev-${m}.png` }); }
await b.close(); srv.close();
