import {
  collapseSteps,
  fmtDistance,
  fmtEtaRange,
  fmtMin,
  routeBadges,
  routeWalkMetres,
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
  selected: boolean;
  onSelect: () => void;
}

export function RouteCard({ route, selected, onSelect }: Props) {
  const total = route.totalMinutes || 1;
  const badges = routeBadges(route.legs);
  const eta = fmtEtaRange(route.departureTime, route.arrivalTime);
  const walkMetres = routeWalkMetres(route.legs);
  const segments: [Tier, number][] = [
    ["exposed", route.exposedMinutes],
    ["covered", route.coveredMinutes],
    ["protected", route.protectedMinutes],
  ];
  return (
    <button type="button" className={`route-card ${selected ? "selected" : ""}`} onClick={onSelect} aria-pressed={selected}>
      <div className="route-head">
        <div>
          {route.recommended && <span className="badge">Recommended</span>}
          <div className="route-summary">
            {badges.length > 0 && (
              <span className="route-badges" aria-hidden>
                {badges.map((b, i) => (
                  <LinePill key={`${b.code}-${i}`} badge={b} />
                ))}
              </span>
            )}
            <span>{route.summary}</span>
          </div>
          {(eta || walkMetres > 0) && (
            <div className="route-meta">
              {eta && <span>{eta}</span>}
              {eta && walkMetres > 0 && <span aria-hidden>·</span>}
              {walkMetres > 0 && <span>🚶 {fmtDistance(walkMetres)} walk</span>}
            </div>
          )}
          {route.indoorLinks && route.indoorLinks.length > 0 && (
            <div className="indoor-note">Indoor link: {route.indoorLinks.filter((n) => !n.endsWith("(connector)")).slice(0, 3).join(", ") || "enclosed walkway"}</div>
          )}
        </div>
        <div className="route-time">{fmtMin(route.totalMinutes)}</div>
      </div>
      <div className="exposure-bar" role="img" aria-label={segments.map(([t, m]) => `${TIER_LABEL[t]} ${fmtMin(m)}`).join(", ")}>
        {segments.map(([t, m]) => m > 0 && <span key={t} style={{ width: `${(m / total) * 100}%`, background: TIER_COLOUR[t] }} />)}
      </div>
      <div className="exposure-legend">
        {segments.map(([t, m]) => (
          <span key={t}>
            <i style={{ background: TIER_COLOUR[t] }} /> {TIER_LABEL[t]} {Math.round(m)} min
          </span>
        ))}
      </div>
      {selected && (
        <ol className="steps">
          {collapseSteps(route.legs).map((s, i) => (
            <li key={i}>
              <span className="step-icon" aria-hidden>{MODE_ICON[s.mode]}</span>
              <div className="step-body">
                <div className="step-title">
                  {s.badge && <LinePill badge={s.badge} />}
                  <span className="step-label">{s.label}</span>
                </div>
                {s.detail && <div className="step-detail">{s.detail}</div>}
              </div>
              <span className="step-tiers">
                {s.tiers.map((t) => <i key={t} title={TIER_LABEL[t]} style={{ background: TIER_COLOUR[t] }} />)}
              </span>
              <span className="step-min">{fmtMin(s.minutes)}</span>
            </li>
          ))}
        </ol>
      )}
    </button>
  );
}

export function TaxiCard({ taxi, shown, onToggle }: { taxi: TaxiSuggestion; shown: boolean; onToggle: () => void }) {
  return (
    <div className="taxi-card">
      <div>
        <strong>🚕 Consider a taxi or private-hire car</strong>
        <p>Enclosed door to door, about {fmtMin(taxi.minutes)} by road. Fares and booking aren't shown here.</p>
      </div>
      <button type="button" className="link-btn" onClick={onToggle}>{shown ? "Hide" : "Show"} on map</button>
    </div>
  );
}
