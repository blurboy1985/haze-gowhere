import { fmtMin } from "../domain/directions";
import { describeNavState } from "../domain/navigation";
import type { LegMode, RankedRoute, Tier } from "../domain/types";
import { TIER_COLOUR } from "./MapView";
import { LinePill } from "./RouteCard";

const TIER_LABEL: Record<Tier, string> = { exposed: "Exposed", covered: "Covered", protected: "Protected" };
const MODE_ICON: Record<LegMode, string> = { walk: "🚶", wait: "⏱", bus: "🚌", train: "🚇" };

interface Props {
  route: RankedRoute;
  stepIndex: number;
  followGps: boolean;
  onChangeStep: (index: number) => void;
  onToggleFollowGps: () => void;
  onExit: () => void;
}

export function NavigationBanner({ route, stepIndex, followGps, onChangeStep, onToggleFollowGps, onExit }: Props) {
  const nav = describeNavState(route, stepIndex);
  if (!nav) return null;

  const { current, next, dominantTier, remainingMinutes, remainingExposedMinutes, progressPercent, totalSteps } = nav;
  const isFirst = nav.stepIndex <= 0;
  const isLast = nav.stepIndex >= totalSteps - 1;

  return (
    <section className="nav-hud" aria-label="Step-by-step navigation">
      <div className={`nav-top-card tier-${dominantTier}`}>
        <div className="nav-top-strip" style={{ background: TIER_COLOUR[dominantTier] }}>
          <span>
            Step {nav.stepIndex + 1} of {totalSteps} · {TIER_LABEL[dominantTier]}
          </span>
          <button type="button" className="nav-exit-btn" onClick={onExit} aria-label="Exit navigation">
            ✕ Exit
          </button>
        </div>
        <div className="nav-main-step">
          <span className="nav-step-icon" aria-hidden>
            {MODE_ICON[current.mode]}
          </span>
          <div className="nav-step-body">
            <div className="nav-step-title">
              {current.badge && <LinePill badge={current.badge} />}
              <strong>{current.label}</strong>
            </div>
            {current.detail && <div className="nav-step-detail">{current.detail}</div>}
          </div>
          <div className="nav-step-duration">{fmtMin(current.minutes)}</div>
        </div>
        <div className="nav-next-bar">
          {next ? (
            <>
              <span className="nav-next-prefix">Then:</span>
              <span aria-hidden>{MODE_ICON[next.mode]}</span>
              {next.badge && <LinePill badge={next.badge} />}
              <span className="nav-next-label">
                {next.label}
                {next.detail ? ` (${next.detail})` : ""}
              </span>
            </>
          ) : (
            <span>🏁 Arrive at Destination</span>
          )}
        </div>
      </div>

      <div className="nav-bottom-bar">
        <div className="nav-progress-track" aria-hidden>
          <span style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="nav-bottom-row">
          <div className="nav-remaining">
            <strong>{fmtMin(remainingMinutes)} left</strong>
            <span>
              {Math.round(remainingExposedMinutes)} min Exposed remaining
            </span>
          </div>
          <div className="nav-controls">
            <button
              type="button"
              className={`nav-gps-btn ${followGps ? "active" : ""}`}
              onClick={onToggleFollowGps}
              title="Auto-advance step from live GPS"
              aria-pressed={followGps}
            >
              ◎ GPS
            </button>
            <button
              type="button"
              className="nav-step-btn"
              disabled={isFirst}
              onClick={() => onChangeStep(nav.stepIndex - 1)}
              aria-label="Previous step"
            >
              ← Prev
            </button>
            {isLast ? (
              <button type="button" className="nav-step-btn primary" onClick={onExit}>
                Finish
              </button>
            ) : (
              <button
                type="button"
                className="nav-step-btn primary"
                onClick={() => onChangeStep(nav.stepIndex + 1)}
                aria-label="Next step"
              >
                Next →
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
