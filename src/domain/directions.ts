import type { Leg, LegMode, Tier } from "./types";

export interface TransitBadge {
  code: string;
  colour: string;
  textColour: string;
  mode: "bus" | "train";
}

export interface RouteStep {
  mode: LegMode;
  label: string;
  detail?: string;
  minutes: number;
  distanceMetres?: number;
  tiers: Tier[];
  badge: TransitBadge | null;
  fromStop?: string;
  toStop?: string;
  stopCount?: number;
  legIndices: number[];
}

const MRT_LINE_COLOURS: Record<string, { colour: string; textColour: string }> = {
  NS: { colour: "#d42e12", textColour: "#ffffff" },
  EW: { colour: "#009645", textColour: "#ffffff" },
  CG: { colour: "#009645", textColour: "#ffffff" },
  NE: { colour: "#9900aa", textColour: "#ffffff" },
  CC: { colour: "#fa9e0d", textColour: "#1f2a37" },
  CE: { colour: "#fa9e0d", textColour: "#1f2a37" },
  DT: { colour: "#005ec4", textColour: "#ffffff" },
  TE: { colour: "#9d5b25", textColour: "#ffffff" },
  JR: { colour: "#0099aa", textColour: "#ffffff" },
  CR: { colour: "#97c616", textColour: "#1f2a37" },
  BP: { colour: "#708573", textColour: "#ffffff" },
  SE: { colour: "#708573", textColour: "#ffffff" },
  SW: { colour: "#708573", textColour: "#ffffff" },
  PE: { colour: "#708573", textColour: "#ffffff" },
  PW: { colour: "#708573", textColour: "#ffffff" },
  STC: { colour: "#708573", textColour: "#ffffff" },
  PTC: { colour: "#708573", textColour: "#ffffff" },
  LRT: { colour: "#708573", textColour: "#ffffff" },
};

const LINE_NAME_TO_CODE: [RegExp, string][] = [
  [/\bnorth[\s-]*south\b/i, "NS"],
  [/\beast[\s-]*west\b/i, "EW"],
  [/\bnorth[\s-]*east\b/i, "NE"],
  [/\bcircle\b/i, "CC"],
  [/\bdowntown\b/i, "DT"],
  [/\bthomson[\s-]*east[\s-]*coast\b/i, "TE"],
  [/\blrt\b/i, "LRT"],
];

/** Infer a short transit line or service code from a Leg's metadata or label. */
export function inferLineCode(leg: Pick<Leg, "mode" | "label" | "lineCode" | "fromStop">): string | null {
  if (leg.lineCode) return leg.lineCode.toUpperCase();
  if (leg.mode === "bus") {
    const m = leg.label?.match(/\bBus\s+([A-Za-z0-9]+)/i);
    return m?.[1]?.toUpperCase() ?? "BUS";
  }
  if (leg.mode === "train") {
    const stopMatch = leg.fromStop?.match(/\(([A-Z]{2,3})\d+\)/);
    if (stopMatch?.[1] && MRT_LINE_COLOURS[stopMatch[1]]) return stopMatch[1];
    if (leg.label) {
      for (const [re, code] of LINE_NAME_TO_CODE) {
        if (re.test(leg.label)) return code;
      }
      const shortMatch = leg.label.match(/\b(NS|EW|CG|NE|CC|CE|DT|TE|BP|SE|SW|PE|PW)\b/);
      if (shortMatch?.[1]) return shortMatch[1];
    }
    return "MRT";
  }
  return null;
}

/** Resolve a colour-coded Singapore transit badge for a bus or train Leg. */
export function lineBadge(leg: Pick<Leg, "mode" | "label" | "lineCode" | "fromStop">): TransitBadge | null {
  if (leg.mode !== "bus" && leg.mode !== "train") return null;
  const code = inferLineCode(leg);
  if (!code) return null;
  if (leg.mode === "bus") {
    return { code, colour: "#538d22", textColour: "#ffffff", mode: "bus" };
  }
  const palette = MRT_LINE_COLOURS[code] ?? { colour: "#374151", textColour: "#ffffff" };
  return { code, colour: palette.colour, textColour: palette.textColour, mode: "train" };
}

/** Ordered transit badges ridden along a Route, for compact Route card headers. */
export function routeBadges(legs: Leg[]): TransitBadge[] {
  const out: TransitBadge[] = [];
  for (const l of legs) {
    const b = lineBadge(l);
    if (!b) continue;
    const prev = out[out.length - 1];
    if (prev && prev.code === b.code && prev.mode === b.mode) continue;
    out.push(b);
  }
  return out;
}

export const fmtMin = (m: number): string => {
  const r = Math.round(m);
  return r >= 60 ? `${Math.floor(r / 60)} h ${r % 60} min` : `${Math.max(r, 1)} min`;
};

export const fmtDistance = (metres: number): string => {
  const m = Math.round(metres);
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.max(10, Math.round(m / 10) * 10)} m`;
};

/** Format departure and arrival epoch ms as a Singapore time window, e.g. "10:15 – 10:40 am". */
export function fmtEtaRange(departureTime?: number, arrivalTime?: number): string | null {
  if (!departureTime || !arrivalTime || arrivalTime < departureTime) return null;
  const fmt = new Intl.DateTimeFormat("en-SG", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Singapore",
  });
  const start = fmt.format(new Date(departureTime)).toLowerCase();
  const end = fmt.format(new Date(arrivalTime)).toLowerCase();
  const startSuffix = start.match(/\s*(am|pm)$/)?.[1];
  const endSuffix = end.match(/\s*(am|pm)$/)?.[1];
  const startTrimmed = startSuffix && startSuffix === endSuffix ? start.replace(/\s*(am|pm)$/, "") : start;
  return `${startTrimmed} – ${end}`;
}

export function routeWalkMetres(legs: Leg[]): number {
  return Math.round(legs.reduce((sum, l) => sum + (l.mode === "walk" ? (l.distanceMetres ?? 0) : 0), 0));
}

function buildStepDetail(step: Omit<RouteStep, "detail">): string | undefined {
  if (step.mode === "bus" || step.mode === "train") {
    const parts: string[] = [];
    if (step.fromStop && step.toStop) parts.push(`${step.fromStop} → ${step.toStop}`);
    else if (step.fromStop) parts.push(`From ${step.fromStop}`);
    else if (step.toStop) parts.push(`To ${step.toStop}`);
    if (step.stopCount && step.stopCount > 0) {
      parts.push(`${step.stopCount} ${step.stopCount === 1 ? "stop" : "stops"}`);
    }
    return parts.length > 0 ? parts.join(" · ") : undefined;
  }
  if (step.mode === "walk") {
    const parts: string[] = [];
    if (step.distanceMetres && step.distanceMetres > 0) parts.push(fmtDistance(step.distanceMetres));
    if (step.toStop) parts.push(`to ${step.toStop}`);
    else if (step.fromStop) parts.push(`from ${step.fromStop}`);
    return parts.length > 0 ? parts.join(" · ") : undefined;
  }
  if (step.mode === "wait") {
    const parts: string[] = [];
    if (step.fromStop) parts.push(`At ${step.fromStop}`);
    parts.push(step.tiers.includes("protected") ? "enclosed station" : "open-air stop");
    return parts.join(" · ");
  }
  return undefined;
}

/**
 * Collapse consecutive walk sub-legs so the step list reads naturally while preserving
 * walking distances, Exposure Tiers, boarding/alighting stops, and transit badges.
 */
export function collapseSteps(legs: Leg[]): RouteStep[] {
  const out: RouteStep[] = [];
  legs.forEach((l, idx) => {
    const last = out[out.length - 1];
    const indoorLabel = l.mode === "walk" && l.label?.includes("(indoor)") ? l.label : null;
    if (last && last.mode === "walk" && l.mode === "walk") {
      last.minutes += l.minutes;
      if (l.distanceMetres) last.distanceMetres = (last.distanceMetres ?? 0) + l.distanceMetres;
      if (!last.tiers.includes(l.tier)) last.tiers.push(l.tier);
      if (indoorLabel && !last.label.includes("(indoor)")) last.label = indoorLabel;
      if (l.toStop) last.toStop = l.toStop;
      if (!last.fromStop && l.fromStop) last.fromStop = l.fromStop;
      last.legIndices.push(idx);
      last.detail = buildStepDetail(last);
    } else {
      const step: RouteStep = {
        mode: l.mode,
        label: l.mode === "walk" ? (indoorLabel ?? "Walk") : (l.label ?? l.mode),
        minutes: l.minutes,
        ...(l.distanceMetres ? { distanceMetres: l.distanceMetres } : {}),
        tiers: [l.tier],
        badge: lineBadge(l),
        ...(l.fromStop ? { fromStop: l.fromStop } : {}),
        ...(l.toStop ? { toStop: l.toStop } : {}),
        ...(l.stopCount ? { stopCount: l.stopCount } : {}),
        legIndices: [idx],
      };
      step.detail = buildStepDetail(step);
      out.push(step);
    }
  });
  return out;
}
