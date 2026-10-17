import { useEffect, useRef, useState } from "react";
import { searchPlaces, type ChosenPoint, type Place } from "./api";

interface Props {
  kind: "start" | "destination";
  value: ChosenPoint | null;
  onChange: (p: ChosenPoint | null) => void;
  /** True while the map is waiting for a tap to place this pin. */
  picking: boolean;
  onPickOnMap: () => void;
  onUseMyLocation?: () => void;
  locating?: boolean;
}

export function PointPicker({ kind, value, onChange, picking, onPickOnMap, onUseMyLocation, locating }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = kind === "start" ? "Starting point" : "Destination";
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery(value?.name ?? "");
  }, [value]);

  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2 || q === value?.name) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchPlaces(q, ctrl.signal)
        .then((r) => {
          setResults(r);
          setError(null);
        })
        .catch((e: Error) => e.name !== "AbortError" && setError(e.message));
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, open, value?.name]);

  const choose = (p: Place) => {
    onChange({ name: titleCase(p.name), location: p.location });
    setOpen(false);
    inputRef.current?.blur();
  };

  const clearInput = () => {
    setQuery("");
    setResults([]);
    onChange(null);
    inputRef.current?.focus();
  };

  return (
    <div className={`picker picker-${kind} ${picking ? "is-picking-row" : ""}`}>
      <span className="picker-dot" aria-hidden>
        {kind === "start" ? "A" : "B"}
      </span>
      <div className="picker-field">
        <label htmlFor={`pick-${kind}`} className="sr-only">
          {label}
        </label>
        <input
          id={`pick-${kind}`}
          ref={inputRef}
          type="search"
          autoComplete="off"
          placeholder={kind === "start" ? "Starting point: address, postal code, MRT" : "Destination: address, postal code, building"}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (!e.target.value) onChange(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => e.key === "Enter" && results[0] && choose(results[0])}
        />
        {query && (
          <button
            type="button"
            className="picker-clear-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clearInput}
            title={`Clear ${label.toLowerCase()}`}
            aria-label={`Clear ${label.toLowerCase()}`}
          >
            ✕
          </button>
        )}
        {open && (results.length > 0 || error) && (
          <ul className="suggestions" role="listbox">
            {error && <li className="suggestion-error">{error}</li>}
            {results.map((r) => (
              <li key={`${r.address}-${r.location.join()}`} role="option" aria-selected={false}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(r)}>
                  <strong>{titleCase(r.name)}</strong>
                  <span>{titleCase(r.address)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="picker-actions">
        {onUseMyLocation && (
          <button
            type="button"
            className="icon-btn"
            onClick={onUseMyLocation}
            disabled={locating}
            title="Use my current location"
            aria-label="Use my current location"
          >
            {locating ? "…" : "◎"}
          </button>
        )}
        <button
          type="button"
          className={`icon-btn ${picking ? "active" : ""}`}
          onClick={onPickOnMap}
          title={`Tap the map to set ${label.toLowerCase()}`}
          aria-label={`Pick ${label.toLowerCase()} on map`}
          aria-pressed={picking}
        >
          ⌖
        </button>
      </div>
    </div>
  );
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(Mrt|Lrt|Cc|Ns|Ew|Ne|Dt|Te)\b/g, (m) => m.toUpperCase());
}
