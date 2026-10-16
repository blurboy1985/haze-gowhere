/**
 * Weight-tuning harness for issue #5.
 *
 *   npx tsx scripts/tune-trips.ts            # rank cached candidates (offline, repeatable)
 *   npx tsx scripts/tune-trips.ts --refresh  # re-fetch candidates from OneMap first (needs .env credentials)
 *
 * Fetches each fixture Trip's candidate Routes once, then ranks them at every PM2.5 Band (and with
 * "always minimise") using the current weights, and prints a Markdown report with flags worth a look.
 */
import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { avoidanceStrength } from "../src/domain/haze";
import { rankRoutes, routeTotals } from "../src/domain/ranking";
import type { LatLng, Pm25Band, Route } from "../src/domain/types";
import { loadCoveredLinkways } from "../server/linkways";
import { OneMapClient } from "../server/onemap";
import { fetchCandidates } from "../server/planTrip";

interface Trip { name: string; kind: string; from: LatLng; to: LatLng }
interface CachedTrip extends Trip { fetchedAt: string; candidates: Route[] }

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const TRIPS = here("./fixtures/tuning-trips.json");
const CACHE = here("./fixtures/tuning-candidates.json");
const BANDS: Pm25Band[] = [1, 2, 3, 4];
const fmt = (n: number) => n.toFixed(0).padStart(2);

/** Ranking only needs tiers, minutes and Exposed leg endpoints; drop the rest of the geometry. */
const slim = (r: Route): Route => ({ ...r, legs: r.legs.map((l) => ({ ...l, path: l.path.length > 1 ? [l.path[0]!, l.path[l.path.length - 1]!] : l.path })) });

async function refresh(trips: Trip[]): Promise<CachedTrip[]> {
  const client = new OneMapClient(process.env.ONEMAP_EMAIL ?? "", process.env.ONEMAP_PASSWORD ?? "");
  if (!client.hasCredentials) throw new Error("--refresh needs ONEMAP_EMAIL and ONEMAP_PASSWORD in .env");
  const linkways = loadCoveredLinkways();
  const out: CachedTrip[] = [];
  for (const t of trips) {
    const candidates = await fetchCandidates({ start: t.from, end: t.to, when: new Date() }, client, linkways);
    console.error(`fetched ${t.name}: ${candidates.length} candidates`);
    out.push({ ...t, fetchedAt: new Date().toISOString(), candidates: candidates.map(slim) });
  }
  writeFileSync(CACHE, JSON.stringify(out, null, 1));
  return out;
}

function describe(r: Route): string {
  const t = routeTotals(r);
  return `${r.summary} (${fmt(t.totalMinutes)} min · E${fmt(t.exposedMinutes)} C${fmt(t.coveredMinutes)})`;
}

function report(cached: CachedTrip[]): string {
  const lines: string[] = [];
  const flags: string[] = [];
  lines.push(`Weights: K by band = ${BANDS.map((b) => `${b}→${avoidanceStrength(b, false)}`).join(", ")}; minimise = ${avoidanceStrength(1, true)}`);
  lines.push(`Candidates fetched: ${cached[0]?.fetchedAt ?? "n/a"}`, "");
  lines.push("| Trip | Kind | Cands | Band 1 | Band 2 | Band 3 | Band 4 / minimise |", "|---|---|---|---|---|---|---|");
  for (const t of cached) {
    const picks = BANDS.map((b) => rankRoutes(t.candidates, b, false)[0]);
    const cells = picks.map((p) => (p ? describe(p) : "none"));
    lines.push(`| ${t.name} | ${t.kind} | ${t.candidates.length} | ${cells.join(" | ")} |`);

    // Flag 1: a route the 2x slowdown cap removed has meaningfully less Exposed time than the Band 4 pick.
    const b4 = picks[3];
    if (b4) {
      const b4Exp = routeTotals(b4).exposedMinutes;
      const shown = new Set(rankRoutes(t.candidates, 4, false).map((r) => r.id));
      for (const c of t.candidates) {
        const ct = routeTotals(c);
        if (!shown.has(c.id) && ct.exposedMinutes + 2 <= b4Exp)
          flags.push(`**${t.name}**: cap removed ${describe(c)}, which has ${(b4Exp - ct.exposedMinutes).toFixed(0)} fewer Exposed min than the Band 4 pick ${describe(b4)}.`);
      }
    }
    // Flag 2: Band 4 pick still has a lot of Exposed walking.
    if (b4 && routeTotals(b4).exposedMinutes >= 10) flags.push(`**${t.name}**: Band 4 pick still has ${routeTotals(b4).exposedMinutes.toFixed(0)} Exposed min. Is a taxi the only real answer here?`);
    // Flag 3: recommendation flips between bands (expected; listed so the trade-off can be judged).
    const ids = new Set(picks.map((p) => p?.id));
    if (ids.size > 1) flags.push(`${t.name}: pick changes across bands: ${picks.map((p, i) => `B${i + 1} ${p?.summary}`).join(" → ")}.`);
  }
  lines.push("", "### Flags", "", ...(flags.length ? flags.map((f) => `- ${f}`) : ["- none"]));
  return lines.join("\n");
}

const trips: Trip[] = JSON.parse(readFileSync(TRIPS, "utf8"));
const cached: CachedTrip[] = process.argv.includes("--refresh") || !existsSync(CACHE) ? await refresh(trips) : JSON.parse(readFileSync(CACHE, "utf8"));
console.log(report(cached));
