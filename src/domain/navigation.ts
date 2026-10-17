import { collapseSteps, worstStepTier, type RouteStep } from "./directions";
import { distanceMetres } from "./geo";
import type { LatLng, Leg, Route, Tier } from "./types";

export interface NavSummary {
  stepIndex: number;
  totalSteps: number;
  current: RouteStep;
  next: RouteStep | null;
  dominantTier: Tier;
  remainingMinutes: number;
  remainingExposedMinutes: number;
  remainingCoveredMinutes: number;
  progressPercent: number;
}


/**
 * Compute the live navigation state for a Route at `stepIndex`: current & next step instructions,
 * worst Exposure Tier on the active step, and remaining total/Exposed/Covered minutes.
 */
export function describeNavState(route: Pick<Route, "legs">, stepIndex: number): NavSummary | null {
  const steps = collapseSteps(route.legs);
  if (steps.length === 0) return null;
  const idx = Math.max(0, Math.min(steps.length - 1, stepIndex));
  const current = steps[idx]!;
  const next = steps[idx + 1] ?? null;

  const remainingLegIndices = new Set(steps.slice(idx).flatMap((s) => s.legIndices));
  let totalMinutes = 0;
  let remainingMinutes = 0;
  let remainingExposedMinutes = 0;
  let remainingCoveredMinutes = 0;

  route.legs.forEach((leg, i) => {
    totalMinutes += leg.minutes;
    if (remainingLegIndices.has(i)) {
      remainingMinutes += leg.minutes;
      if (leg.tier === "exposed") remainingExposedMinutes += leg.minutes;
      else if (leg.tier === "covered") remainingCoveredMinutes += leg.minutes;
    }
  });

  const elapsed = Math.max(0, totalMinutes - remainingMinutes);
  const progressPercent = totalMinutes > 0 ? Math.round((elapsed / totalMinutes) * 100) : 0;

  return {
    stepIndex: idx,
    totalSteps: steps.length,
    current,
    next,
    dominantTier: worstStepTier(current.tiers),
    remainingMinutes,
    remainingExposedMinutes,
    remainingCoveredMinutes,
    progressPercent,
  };
}

/**
 * Find the collapsed step index closest to `position` (in metres), along with the distance.
 * Used during live GPS navigation to snap to the commuter's current step.
 */
export function nearestStepIndex(legs: Leg[], position: LatLng): { stepIndex: number; distanceMetres: number } | null {
  const steps = collapseSteps(legs);
  if (steps.length === 0) return null;
  let bestIdx = 0;
  let bestDist = Infinity;

  steps.forEach((step, sIdx) => {
    for (const lIdx of step.legIndices) {
      const leg = legs[lIdx];
      if (!leg) continue;
      for (const pt of leg.path) {
        const d = distanceMetres(position, pt);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = sIdx;
        }
      }
    }
  });

  return Number.isFinite(bestDist) ? { stepIndex: bestIdx, distanceMetres: Math.round(bestDist) } : null;
}
