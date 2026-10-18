import { useRef } from "react";

export type SheetSnap = "peek" | "half" | "full";
const SNAPS: SheetSnap[] = ["peek", "half", "full"];
const LABELS = { peek: "Map", half: "Split", full: "Full" };
const DESCRIPTIONS = { peek: "Show more map", half: "Show map and directions", full: "Expand directions" };

export function MobileSheetControls({ value, onChange }: { value: SheetSnap; onChange: (value: SheetSnap) => void }) {
  const pointerStart = useRef<number | null>(null);
  const dragged = useRef(false);
  const move = (direction: number) => {
    const index = Math.max(0, Math.min(SNAPS.length - 1, SNAPS.indexOf(value) + direction));
    onChange(SNAPS[index]!);
  };

  return (
    <div className="sheet-grab-bar">
      <button
        type="button"
        className="sheet-grab-handle"
        aria-label={`Resize directions panel: ${LABELS[value]}. Drag up or down, or tap to resize.`}
        title="Drag up or down, or tap to resize"
        onPointerDown={(event) => {
          pointerStart.current = event.clientY;
          dragged.current = false;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={(event) => {
          if (pointerStart.current === null) return;
          const delta = pointerStart.current - event.clientY;
          pointerStart.current = null;
          if (Math.abs(delta) >= 32) {
            dragged.current = true;
            move(delta > 0 ? 1 : -1);
          }
        }}
        onPointerCancel={() => { pointerStart.current = null; }}
        onClick={() => {
          if (dragged.current) {
            dragged.current = false;
            return;
          }
          onChange(SNAPS[(SNAPS.indexOf(value) + 1) % SNAPS.length]!);
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          move(event.key === "ArrowUp" ? 1 : -1);
        }}
      >
        <span className="sheet-pill" aria-hidden />
        <span className="sheet-resize-arrows" aria-hidden>↕</span>
      </button>
      <div className="sheet-snap-group" role="group" aria-label="Map and directions layout">
        {SNAPS.map((snap) => (
          <button
            key={snap}
            type="button"
            className={`sheet-snap-btn ${value === snap ? "active" : ""}`}
            aria-pressed={value === snap}
            title={DESCRIPTIONS[snap]}
            onClick={() => onChange(snap)}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <rect x="3" y="3" width="18" height="18" rx="3" />
              {snap === "peek" ? <path d="m7 15 4-7 2 4 4-3M3 18h18" /> : snap === "half" ? <path d="M3 12h18M8 16h8" /> : <path d="M3 7h18M8 12h8M8 16h6" />}
            </svg>
            <span>{LABELS[snap]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
