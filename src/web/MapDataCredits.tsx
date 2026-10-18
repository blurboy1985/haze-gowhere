import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import "./MapDataCredits.css";

/** Show the source on first view, then leave a small, accessible way to reopen it. */
export function MapDataCredits() {
  const [expanded, setExpanded] = useState(true);
  const [interacted, setInteracted] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (root.current) {
      L.DomEvent.disableClickPropagation(root.current);
      L.DomEvent.disableScrollPropagation(root.current);
    }
  }, []);

  useEffect(() => {
    if (interacted) return;
    const timer = window.setTimeout(() => setExpanded(false), 5_000);
    return () => window.clearTimeout(timer);
  }, [interacted]);

  return (
    <div className="map-data-credits" ref={root} onFocus={() => setInteracted(true)} onPointerEnter={() => setInteracted(true)}>
      <button
        type="button"
        className="map-data-toggle"
        aria-label="Map data credits"
        aria-expanded={expanded}
        aria-controls="map-data-sources"
        onClick={() => {
          setInteracted(true);
          setExpanded((value) => !value);
        }}
      >
        <span aria-hidden>{expanded ? "×" : "ⓘ"}</span>
        <span>Data</span>
      </button>
      {expanded && (
        <div id="map-data-sources" className="map-data-sources">
          Indoor links ©{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>
          {" · "}
          <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer">ODbL</a>
        </div>
      )}
    </div>
  );
}
