// Records the real Haze GoWhere UI (running at APP_URL, live NEA + OneMap data) as a phone "screen recording":
// a list of screenshots plus how long each one is held, written to out/app/manifest.json.
// The user story: GPS puts A at home in Bishan -> haze banner -> search "Gardens by the Bay" -> routes -> recommended -> navigation.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const APP_URL = process.env.APP_URL ?? "http://localhost:5173/";
const HOME = { latitude: 1.3521, longitude: 103.8497 }; // Bishan St 22, near Bishan MRT
const OUT = "out/app";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  geolocation: HOME,
  permissions: ["geolocation"],
  timezoneId: "Asia/Singapore",
  locale: "en-SG",
});
const page = await context.newPage();
page.on("pageerror", (e) => console.error("pageerror:", e.message));

let routes = null, haze = null;
page.on("response", async (res) => {
  if (res.url().includes("/api/routes")) routes = await res.json().catch(() => null);
  if (res.url().includes("/api/haze")) haze = await res.json().catch(() => null);
});

const frames = [];
let n = 0;
async function shot(name, hold) {
  const file = `${String(n++).padStart(3, "0")}-${name}.png`;
  await page.screenshot({ path: `${OUT}/${file}` });
  frames.push({ file, hold, name });
}
const panelScroll = (y) => page.evaluate((y) => { document.querySelector(".panel").scrollTop = y; }, y);
const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
async function smoothScroll(from, to, steps, name) {
  for (let i = 1; i <= steps; i++) { await panelScroll(from + (to - from) * ease(i / steps)); await sleep(60); await shot(`${name}${i}`, 1 / 15); }
}
const offsetOf = (sel) => page.evaluate((sel) => {
  const p = document.querySelector(".panel"), el = document.querySelector(sel);
  return Math.round(el.getBoundingClientRect().top - p.getBoundingClientRect().top + p.scrollTop);
}, sel);

// 1. Open the app: GPS fills A, live haze banner loads.
await page.goto(APP_URL);
await page.waitForFunction(() => document.querySelector("#pick-start")?.value && document.querySelector("section.haze"), null, { timeout: 30000 });
await page.waitForLoadState("networkidle");
await sleep(1500);
await shot("open", 1.0);
const hazeTop = await offsetOf("section.haze");
await smoothScroll(0, hazeTop - 10, 12, "to-haze");
await shot("haze", 3.2);
await smoothScroll(hazeTop - 10, 0, 10, "back-up");

// 2. Search for the destination like a user would.
await page.tap("#pick-destination");
await sleep(300);
await shot("dest-focus", 0.4);
for (const ch of "Gardens by the Bay") { await page.keyboard.type(ch); await sleep(40); await shot("type", 0.07); }
await page.waitForSelector(".suggestions li button", { timeout: 20000 });
await sleep(600);
await shot("suggestions", 1.0);

// 3. Pick it; hold the routes response briefly so the real loading state is visible.
await page.route("**/api/routes**", async (route) => { await sleep(1200); await route.continue(); });
const pick = page.locator(".suggestions li button", { hasText: /supertree grove/i }).first();
await pick.tap();
await sleep(800); // let the map tiles for the new view load
await shot("loading", 0.9);
await page.waitForSelector(".route-card, [class*=route-card]", { timeout: 60000 });
await sleep(2500); // map fits the route lines
await panelScroll(0);
await sleep(300);
await shot("results", 1.6);

// 4. Scroll to the recommended route and its legs.
const recTop = await offsetOf("[class*=route-card]");
await smoothScroll(0, recTop - 10, 16, "to-rec");
await shot("recommended", 2.4);
const navBtnTop = await offsetOf(".start-nav-btn");
const legsY = Math.max(recTop - 10, navBtnTop - 380);
await smoothScroll(recTop - 10, legsY, 14, "to-legs");
await shot("legs", 2.0);

// 5. Start navigation.
await page.tap(".start-nav-btn");
await sleep(2500);
await shot("navigation", 3.0);

const rec = routes?.routes?.find((r) => r.recommended);
const data = {
  capturedAt: new Date().toISOString(),
  start: await page.evaluate(() => document.querySelector("#pick-start")?.value ?? null).catch(() => null),
  destination: await page.evaluate(() => document.querySelector("#pick-destination")?.value ?? null).catch(() => null),
  hazeTimestamp: haze?.timestamp ?? routes?.haze?.timestamp,
  psi24: Object.fromEntries((routes?.haze ?? haze)?.regions.map((r) => [r.region, r.psi24]) ?? []),
  pm25: Object.fromEntries((routes?.haze ?? haze)?.regions.map((r) => [r.region, r.pm25]) ?? []),
  tripBand: routes?.tripBand,
  routes: routes?.routes.map((r) => ({ summary: r.summary, recommended: r.recommended, totalMinutes: +r.totalMinutes.toFixed(1), exposedMinutes: +r.exposedMinutes.toFixed(1), coveredMinutes: +r.coveredMinutes.toFixed(1) })),
  recommended: rec?.summary,
};
await writeFile(`${OUT}/manifest.json`, JSON.stringify({ size: [780, 1688], frames, data }, null, 2));
console.log(JSON.stringify(data, null, 2));
console.log(`${frames.length} frames, ${frames.reduce((s, f) => s + f.hold, 0).toFixed(1)}s of phone time`);
await browser.close();
