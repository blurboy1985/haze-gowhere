import { pm25Band } from "../src/domain/haze";
import type { HazeReading, LatLng, RegionName, RegionReading } from "../src/domain/types";

/** NEA readings via data.gov.sg: the same figures haze.gov.sg shows, through a documented API. */
const PSI_URL = "https://api-open.data.gov.sg/v2/real-time/api/psi";
const PM25_URL = "https://api-open.data.gov.sg/v2/real-time/api/pm25";
/** NEA updates hourly; refetch at most every 5 minutes. */
const CACHE_MS = 5 * 60 * 1000;

const REGIONS: RegionName[] = ["north", "south", "east", "west", "central"];

interface DataGovResponse {
  data: {
    regionMetadata: { name: string; labelLocation: { latitude: number; longitude: number } }[];
    items: { timestamp: string; readings: Record<string, Record<string, number>> }[];
  };
}

let cache: { at: number; reading: HazeReading } | null = null;

async function fetchJson(url: string): Promise<DataGovResponse> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`data.gov.sg ${url} failed: HTTP ${res.status}`);
  return (await res.json()) as DataGovResponse;
}

/**
 * Dev/test only: HAZE_OVERRIDE_PM25=<µg/m³> replaces every region's 1-hr PM2.5 so any band can be exercised.
 * The reading is flagged `simulated` and the UI says so.
 */
function applyOverride(reading: HazeReading): HazeReading {
  const raw = process.env.HAZE_OVERRIDE_PM25;
  if (!raw) return reading;
  const pm = Number(raw);
  if (!Number.isFinite(pm) || pm < 0) return reading;
  return { ...reading, simulated: true, regions: reading.regions.map((r) => ({ ...r, pm25: pm, band: pm25Band(pm) })) };
}

export async function latestHazeReading(): Promise<HazeReading> {
  return applyOverride(await liveHazeReading());
}

async function liveHazeReading(): Promise<HazeReading> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.reading;
  const [psi, pm25] = await Promise.all([fetchJson(PSI_URL), fetchJson(PM25_URL)]);
  const psiItem = psi.data.items[0];
  const pmItem = pm25.data.items[0];
  if (!psiItem || !pmItem) throw new Error("data.gov.sg returned no readings");
  const labels = new Map<string, LatLng>(
    psi.data.regionMetadata.map((m) => [m.name, [m.labelLocation.latitude, m.labelLocation.longitude]]),
  );
  const regions: RegionReading[] = REGIONS.map((region) => {
    const pm = pmItem.readings.pm25_one_hourly?.[region] ?? 0;
    return {
      region,
      label: labels.get(region) ?? [1.35735, 103.82],
      psi24: psiItem.readings.psi_twenty_four_hourly?.[region] ?? 0,
      pm25: pm,
      band: pm25Band(pm),
    };
  });
  const reading: HazeReading = { timestamp: pmItem.timestamp, regions };
  cache = { at: Date.now(), reading };
  return reading;
}
