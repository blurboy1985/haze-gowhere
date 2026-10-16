import type { Leg, RankedRoute, TaxiSuggestion, Tier } from "../domain/types";
import { TIER_COLOUR } from "./MapView";

const TIER_LABEL: Record<Tier, string> = { exposed: "Exposed", covered: "Covered", protected: "Protected" };
const MODE_ICON: Record<Leg["mode"], string> = { walk: "🚶", wait: "⏱", bus: "🚌", train: "🚇" };

export const fmtMin = (m: number) => {
  const r = Math.round(m);
  return r >= 60 ? `${Math.floor(r / 60)} h ${r % 60} min` : `${Math.max(r, 1)} min`;
};

/** Collapse consecutive walk sub-legs so the step list reads naturally. */
function steps(legs: Leg[]): { mode: Leg["mode"]; label: string; minutes: number; tiers: Set<Tier> }[] {
  const out: { mode: Leg["mode"]; label: string; minutes: number; tiers: Set<Tier> }[] = [];
  for (const l of legs) {
    const last = out[out.length - 1];
    const indoorLabel = l.mode === "walk" && l.label?.includes("(indoor)") ? l.label : null;
    if (last && last.mode === "walk" && l.mode === "walk") {
      last.minutes += l.minutes;
      last.tiers.add(l.tier);
      if (indoorLabel && !last.label.includes("(indoor)")) last.label = indoorLabel;
    } else {
      out.push({ mode: l.mode, label: l.mode === "walk" ? indoorLabel ?? "Walk" : l.label ?? l.mode, minutes: l.minutes, tiers: new Set([l.tier]) });
    }
  }
  return out;
}

interface Props {
  route: RankedRoute;
  selected: boolean;
  onSelect: () => void;
}

export function RouteCard({ route, selected, onSelect }: Props) {
  const total = route.totalMinutes || 1;
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
          <div className="route-summary">{route.summary}</div>
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
          {steps(route.legs).map((s, i) => (
            <li key={i}>
              <span className="step-icon" aria-hidden>{MODE_ICON[s.mode]}</span>
              <span className="step-label">{s.label}</span>
              <span className="step-tiers">
                {[...s.tiers].map((t) => <i key={t} title={TIER_LABEL[t]} style={{ background: TIER_COLOUR[t] }} />)}
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
