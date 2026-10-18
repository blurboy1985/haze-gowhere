// Renders scene.html frame by frame with headless Chrome.
//   node render.mjs                -> out/frames/f0000.jpg … (30 fps, per timeline.json)
//   node render.mjs --stills 2,9.5 -> out/stills/t2.png …
import { createServer } from "node:http";
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = fileURLToPath(new URL("../../", import.meta.url));
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  try {
    const p = normalize(join(root, decodeURIComponent(new URL(req.url, "http://x").pathname)));
    if (!p.startsWith(normalize(root))) throw new Error("outside root");
    const body = await readFile(p);
    res.writeHead(200, { "Content-Type": types[extname(p)] ?? "application/octet-stream" }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--hide-scrollbars"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.error("pageerror:", e.stack));
page.on("console", (m) => m.type() === "error" && console.error("console:", m.text()));
await page.goto(`http://localhost:${port}/demo/video/scene.html?capture`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
await page.evaluate(() => document.fonts.ready);

const stillsArg = process.argv.indexOf("--stills");
if (stillsArg > 0) {
  await mkdir("out/stills", { recursive: true });
  for (const t of process.argv[stillsArg + 1].split(",").map(Number)) {
    await page.evaluate((t) => window.renderAt(t), t);
    await page.screenshot({ path: `out/stills/t${t}.png` });
    console.log("still", t);
  }
} else {
  const { duration, fps } = JSON.parse(await readFile("timeline.json", "utf8"));
  await rm("out/frames", { recursive: true, force: true });
  await mkdir("out/frames", { recursive: true });
  const n = Math.round(duration * fps), started = Date.now();
  for (let f = 0; f < n; f++) {
    await page.evaluate((t) => window.renderAt(t), f / fps);
    await writeFile(`out/frames/f${String(f).padStart(4, "0")}.jpg`, await page.screenshot({ type: "jpeg", quality: 92 }));
    if (f % 90 === 0) console.log(`frame ${f}/${n} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
  }
  console.log(`done: ${n} frames`);
}
await browser.close();
server.close();
