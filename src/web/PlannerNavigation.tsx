import type { KeyboardEvent } from "react";
import type { HazeReading } from "../domain/types";
import "./PlannerNavigation.css";

export type PlannerPanel = "routes" | "air-quality";

interface Props {
  active: PlannerPanel;
  haze: HazeReading | null;
  error: string | null;
  onChange: (panel: PlannerPanel) => void;
}

export function PlannerNavigation({ active, haze, error, onChange }: Props) {
  const psi = haze ? Math.max(...haze.regions.map((region) => region.psi24)) : null;
  const band = haze ? Math.max(...haze.regions.map((region) => region.band)) : null;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const tabs = Array.from(event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const index = tabs.indexOf(event.currentTarget);
    let next: number;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") next = (index + 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    const tab = tabs[next]!;
    onChange(tab.dataset.panel as PlannerPanel);
    tab.focus();
  };

  return (
    <div className="planner-navigation" role="tablist" aria-label="Planner panels">
      {(["routes", "air-quality"] as PlannerPanel[]).map((panel) => (
        <button
          type="button"
          role="tab"
          key={panel}
          id={`${panel}-tab`}
          data-panel={panel}
          aria-selected={active === panel}
          aria-controls={`${panel}-panel`}
          tabIndex={active === panel ? 0 : -1}
          onClick={() => onChange(panel)}
          onKeyDown={onKeyDown}
        >
          <span>{panel === "routes" ? "Directions" : "Air quality"}</span>
          {panel === "air-quality" && (
            <span className={`planner-air-status ${band ? `air-band-${band}` : ""}`}>
              {psi !== null ? `PSI ${psi} · PM2.5 B${band}` : error ? "Unavailable" : "Loading…"}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
