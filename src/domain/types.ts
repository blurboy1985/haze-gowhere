/** [lat, lng] in WGS84. */
export type LatLng = [number, number];

export type Tier = "protected" | "covered" | "exposed";

export type LegMode = "walk" | "wait" | "bus" | "train";

export interface Leg {
  mode: LegMode;
  tier: Tier;
  minutes: number;
  path: LatLng[];
  /** e.g. "Bus 7", "NS Line", "Wait for bus 7" */
  label?: string;
}

export interface Route {
  id: string;
  /** Short human description, e.g. "Walk" or "Bus 7 → NS Line" */
  summary: string;
  legs: Leg[];
  /** For an Indoor Variant: the named Indoor Links it uses, e.g. "CityLink Mall". */
  indoorLinks?: string[];
}

export interface RouteTotals {
  totalMinutes: number;
  exposedMinutes: number;
  coveredMinutes: number;
  protectedMinutes: number;
}

export interface RankedRoute extends Route, RouteTotals {
  exposureCost: number;
  recommended: boolean;
}

export type RegionName = "north" | "south" | "east" | "west" | "central";

/** NEA PM2.5 band: 1 Normal, 2 Elevated, 3 High, 4 Very High. */
export type Pm25Band = 1 | 2 | 3 | 4;

export interface RegionReading {
  region: RegionName;
  label: LatLng;
  psi24: number;
  pm25: number;
  band: Pm25Band;
}

export interface HazeReading {
  timestamp: string;
  regions: RegionReading[];
  /** True when PM2.5 was overridden for development; never set in production. */
  simulated?: boolean;
}

export interface TaxiSuggestion {
  minutes: number;
  path: LatLng[];
}

export interface RoutesResponse {
  tripBand: Pm25Band;
  avoidanceStrength: number;
  routes: RankedRoute[];
  /** How many candidate Routes were scored before the slowdown cap and top-N cut. */
  consideredCount: number;
  taxi: TaxiSuggestion | null;
  haze: HazeReading;
  mock: boolean;
}
