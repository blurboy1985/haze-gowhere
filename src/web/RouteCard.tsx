import type { CSSProperties } from "react";
import {
  collapseSteps,
  describeRouteTradeoff,
  fmtDistance,
  fmtEtaRange,
  fmtMin,
  routeBadges,
  routeWalkMetres,
  worstStepTier,
  type TransitBadge,
} from "../domain/directions";
import type { Leg, RankedRoute, TaxiSuggestion, Tier } from "../domain/types";
import { TIER_COLOUR } from "./MapView";

export { fmtMin };

const TIER_LABEL: Record<Tier, string> = { exposed: "Exposed", covered: "Covered", protected: "Protected" };
const MODE_ICON: Record<Leg["mode"], string> = { walk: "🚶", wait: "⏱", bus: "🚌", train: "🚇" };

export function LinePill({ badge }: { badge: TransitBadge }) {
  return (
    <span className="line-pill" style={{ background: badge.colour, color: badge.textColour }}>
      {badge.mode === "bus" ? `🚌 ${badge.code}` : badge.code}
    </span>
  );
}

interface Props {
  route: RankedRoute;
  allRoutes?: RankedRoute[];
  selected: boolean;
  onSelect: () => void;
  activeStepIndex?: number | null;
  onSelectStep?: (index: number | null) => void;
  onStartNavigation?: () => void;
}

export function RouteCard({
  route,
  allRoutes = [],
  selected,
  onSelect,
  activeStepIndex = null,
  onSelectStep,
  onStartNavigation,
}: Props) {
  const total = route.totalMinutes || 1;
  const badges = routeBadges(route.legs);
  const eta = fmtEtaRange(route.departureTime, route.arrivalTime);
  const walkMetres = routeWalkMetres(route.legs);
  const tradeoff = describeRouteTradeoff(route, allRoutes);
  const segments: [Tier, number][] = [
    ["protected", route.protectedMinutes],
    ["covered", route.coveredMinutes],
    ["exposed", route.exposedMinutes],
  ];
  const indoorNames =
    route.indoorLinks && route.indoorLinks.length > 0
      ? route.indoorLinks.filter((n) => !n.endsWith("(connector)")).slice(0, 3).join(", ") || "enclosed walkway"
      : null;

  return (
    <div className={`route-card ${selected ? "selected" : ""} ${route.recommended ? "is-recommended" : ""}`}>
      <button type="button" className="route-card-trigger" onClick={onSelect} aria-pressed={selected}>
        <div className="route-head">
          <div className="route-head-main">
            {(route.recommended || tradeoff) && (
              <div className="route-chip-row">
                {route.recommended && <span className="badge badge-recommended">★ Recommended</span>}
                {tradeoff && (
                  <span className={`badge ${route.recommended ? "badge-tradeoff" : "badge-alt"}`}>
                    {route.recommended && tradeoff.startsWith("−") ? `🛡️ ${tradeoff}` : tradeoff}
                  </span>
                )}
              </div>
            )}
            <div className="route-summary">
              {badges.length > 0 && (
                <span className="route-badges" aria-hidden>
                  {badges.map((b, i) => (
                    <LinePill key={`${b.code}-${i}`} badge={b} />
                  ))}
                </span>
              )}
              <span className="route-summary-text">{route.summary}</span>
            </div>
            {(eta || walkMetres > 0) && (
              <div className="route-meta">
                {eta && <span className="num">{eta}</span>}
                {(route.departureWaitMinutes ?? 0) >= 1 && <span>Leaves {fmtMin(route.departureWaitMinutes!)} after requested time</span>}
                {eta && walkMetres > 0 && <span aria-hidden>·</span>}
                {walkMetres > 0 && <span>🚶 {fmtDistance(walkMetres)} walk</span>}
              </div>
            )}
            {indoorNames && (
              <div className="indoor-note">
                <span aria-hidden>🏢</span>
                <span>Indoor Link · {indoorNames}</span>
              </div>
            )}
          </div>
          <div className="route-time-box">
            <div className="route-time num">{fmtMin(route.totalMinutes)}</div>
            <div className="route-exp-sub num">
              {Math.round(route.exposedMinutes) === 0
                ? "0m Exposed"
                : `${Math.round(route.exposedMinutes)}m Exposed`}
            </div>
          </div>
        </div>

        <div
          className="exposure-bar"
          role="img"
          aria-label={segments.map(([t, m]) => `${TIER_LABEL[t]} ${fmtMin(m)}`).join(", ")}
        >
          {segments.map(
            ([t, m]) =>
              m > 0 && (
                <span
                  key={t}
                  className={`exp-seg tier-${t}`}
                  style={{ width: `${(m / total) * 100}%`, background: TIER_COLOUR[t] }}
                />
              ),
          )}
        </div>
        <div className="exposure-legend">
          {segments.map(([t, m]) => {
            const mins = Math.round(m);
            return (
              <span key={t} className={`legend-item ${mins === 0 ? "zero" : ""}`}>
                <i style={{ background: TIER_COLOUR[t] }} /> {TIER_LABEL[t]} <strong className="num">{mins}m</strong>
              </span>
            );
          })}
        </div>
      </button>

      {selected && (
        <>
          <ol className="steps" aria-label="Route steps">
            {collapseSteps(route.legs).map((s, i) => {
              const isStepActive = activeStepIndex === i;
              const dominantTier = worstStepTier(s.tiers);
              const tierColour = TIER_COLOUR[dominantTier];
              return (
                <li key={i}>
                  <button
                    type="button"
                    className={`step-btn ${isStepActive ? "active" : ""}`}
                    style={{ "--step-tier-colour": tierColour } as CSSProperties}
                    onClick={() => onSelectStep?.(isStepActive ? null : i)}
                    aria-pressed={isStepActive}
                    title={isStepActive ? "Show full route on map" : "Focus this leg on map"}
                  >
                    <span className="step-icon" aria-hidden>
                      {MODE_ICON[s.mode]}
                    </span>
                    <div className="step-body">
                      <div className="step-title">
                        {s.badge && <LinePill badge={s.badge} />}
                        <span className="step-label">{s.label}</span>
                      </div>
                      {s.detail && <div className="step-detail">{s.detail}</div>}
                    </div>
                    <span className="step-tiers">
                      {s.tiers.map((t) => (
                        <span key={t} className="step-tier-pill" style={{ background: TIER_COLOUR[t] }}>
                          {TIER_LABEL[t]}
                        </span>
                      ))}
                    </span>
                    <span className="step-min num">{fmtMin(s.minutes)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          {onStartNavigation && (
            <div className="route-actions">
              <span className="route-actions-hint">Tap any step to inspect its Leg on the map</span>
              <button type="button" className="start-nav-btn" onClick={onStartNavigation}>
                ▶ Start navigation
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function TaxiCard({ taxi, shown, onToggle }: { taxi: TaxiSuggestion; shown: boolean; onToggle: () => void }) {
  return (
    <div className="taxi-card">
      <div className="taxi-card-body">
        <div className="taxi-card-title">
          <span aria-hidden>🚕</span>
          <strong>Consider a taxi or private-hire car</strong>
          <span className="step-tier-pill" style={{ background: TIER_COLOUR.protected }}>
            Protected
          </span>
        </div>
        <p>
          Enclosed door to door, about <strong className="num">{fmtMin(taxi.minutes)}</strong> by road. Fares and booking aren't shown here.
        </p>
      </div>
      <button type="button" className="link-btn" onClick={onToggle}>
        {shown ? "Hide on map" : "Show on map"}
      </button>
    </div>
  );
}
