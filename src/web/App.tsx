import { useCallback, useEffect, useState } from "react";
import { nearestStepIndex } from "../domain/navigation";
import { defaultSgtDateTimeLocal, formatTripUrl, parseTripUrl } from "../domain/tripUrl";
import type { HazeReading, LatLng, Pm25Band, RoutesResponse } from "../domain/types";
import { fetchHaze, fetchRoutes, reverseGeocode, type ChosenPoint } from "./api";
import { HazeBanner } from "./HazeBanner";
import { LogoMark } from "./Logo";
import { MapView } from "./MapView";
import { MobileSheetControls, type SheetSnap } from "./MobileSheetControls";
import { NavigationBanner } from "./NavigationBanner";
import { PointPicker } from "./PointPicker";
import { PlannerNavigation, type PlannerPanel } from "./PlannerNavigation";
import { RouteCard, TaxiCard } from "./RouteCard";

type Which = "start" | "destination";

interface SampleTrip {
  label: string;
  tag: string;
  start: ChosenPoint;
  end: ChosenPoint;
}

const SAMPLE_TRIPS: SampleTrip[] = [
  {
    label: "Raffles Place → Marina Bay Sands",
    tag: "CBD Indoor Links",
    start: { name: "Raffles Place MRT", location: [1.2839, 103.8515] },
    end: { name: "Marina Bay Sands", location: [1.2834, 103.8607] },
  },
  {
    label: "Bishan MRT → ION Orchard",
    tag: "North–South corridor",
    start: { name: "Bishan MRT", location: [1.35092, 103.84825] },
    end: { name: "ION Orchard", location: [1.30398, 103.83191] },
  },
  {
    label: "Tampines MRT → Bedok Mall",
    tag: "East Heartlands",
    start: { name: "Tampines MRT", location: [1.3533, 103.9452] },
    end: { name: "Bedok Mall", location: [1.3248, 103.9293] },
  },
];

const MINIMISE_KEY = "haze-gowhere:always-minimise";
const readMinimise = () => {
  try {
    return localStorage.getItem(MINIMISE_KEY) === "1";
  } catch {
    return false;
  }
};

async function namePoint(p: LatLng, fallback: string): Promise<ChosenPoint> {
  const name = await reverseGeocode(p).catch(() => null);
  return { name: name ? name.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()) : fallback, location: p };
}

export function App() {
  const initialUrl = parseTripUrl(typeof window !== "undefined" ? window.location.search : "");
  const [start, setStart] = useState<ChosenPoint | null>(initialUrl.start);
  const [end, setEnd] = useState<ChosenPoint | null>(initialUrl.end);
  const [picking, setPicking] = useState<Which | null>(null);
  const [minimise, setMinimise] = useState<boolean>(initialUrl.minimise ?? readMinimise());
  const [departAt, setDepartAt] = useState<string | null>(initialUrl.departAt ?? null);
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>("half");
  const [activePanel, setActivePanel] = useState<PlannerPanel>("routes");
  const [copied, setCopied] = useState(false);
  const [haze, setHaze] = useState<HazeReading | null>(null);
  const [hazeError, setHazeError] = useState<string | null>(null);
  const [result, setResult] = useState<RoutesResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [followGps, setFollowGps] = useState(true);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [loading, setLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [showTaxi, setShowTaxi] = useState(false);

  useEffect(() => {
    fetchHaze().then(setHaze).catch((e: Error) => setHazeError(e.message));
  }, []);

  const useMyLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setLocateError("Location isn't available in this browser. Search or tap the map instead.");
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const p: LatLng = [pos.coords.latitude, pos.coords.longitude];
        setUserLocation(p);
        setStart(await namePoint(p, "My location"));
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setLocateError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied. Search, tap the map, or try a sample trip below."
            : "Couldn't get your location. Search, tap the map, or try a sample trip below.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, []);

  // GPS is the default way to set the Starting Point unless a shared URL already set one.
  useEffect(() => {
    if (!initialUrl.start) useMyLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useMyLocation]);

  useEffect(() => {
    try {
      localStorage.setItem(MINIMISE_KEY, minimise ? "1" : "0");
    } catch {
      /* per-viewer convenience only */
    }
  }, [minimise]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = formatTripUrl({ start, end, minimise, departAt });
    const nextUrl = `${window.location.pathname}${query}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [start, end, minimise, departAt]);

  useEffect(() => {
    if (!start || !end) {
      setResult(null);
      setActiveStepIndex(null);
      setNavigating(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setRouteError(null);
    fetchRoutes(start.location, end.location, minimise, departAt, ctrl.signal)
      .then((r) => {
        setResult(r);
        setHaze(r.haze);
        setSelectedId(r.routes.find((x) => x.recommended)?.id ?? null);
        setActiveStepIndex(null);
        setNavigating(false);
        setShowTaxi(false);
      })
      .catch((e: Error) => e.name !== "AbortError" && setRouteError(e.message))
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [start, end, minimise, departAt]);

  const placeAt = async (which: Which, p: LatLng) => {
    const point = await namePoint(p, "Dropped pin");
    (which === "start" ? setStart : setEnd)(point);
  };

  const onMapTap = (p: LatLng) => {
    const which: Which | null = picking ?? (!start ? "start" : !end ? "destination" : null);
    if (!which) return;
    setPicking(null);
    void placeAt(which, p);
  };

  const swap = () => {
    setStart(end);
    setEnd(start);
  };

  const shareTrip = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Haze GoWhere Trip", url });
        return;
      } catch {
        /* fall back to clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore clipboard error */
    }
  };

  const routes = result?.routes ?? [];
  const selectedRoute = routes.find((r) => r.id === selectedId) ?? null;
  const activeBand: Pm25Band =
    result?.tripBand ?? (haze ? (Math.max(...haze.regions.map((r) => r.band)) as Pm25Band) : 1);

  useEffect(() => {
    if (!navigating || !selectedRoute || !("geolocation" in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const p: LatLng = [pos.coords.latitude, pos.coords.longitude];
        setUserLocation(p);
        if (followGps) {
          const match = nearestStepIndex(selectedRoute.legs, p);
          if (match && match.distanceMetres <= 150) {
            setActiveStepIndex(match.stepIndex);
          }
        }
      },
      () => {
        /* keep manual navigation if live GPS fails */
      },
      { enableHighAccuracy: true, maximumAge: 5_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [navigating, selectedRoute, followGps]);

  return (
    <div
      className={`app ambient-band-${activeBand} sheet-${sheetSnap} ${picking ? "is-picking" : ""} ${navigating ? "is-navigating" : ""}`}
    >
      <aside className="panel">
        <MobileSheetControls value={sheetSnap} onChange={setSheetSnap} />

        <header className="brand">
          <div className="brand-identity">
            <LogoMark band={activeBand} size={40} />
            <div className="brand-text">
              <h1>Haze GoWhere</h1>
              <p>Routes that keep you out of the haze</p>
            </div>
          </div>
          {(start || end) && (
            <button
              type="button"
              className="share-btn"
              onClick={() => void shareTrip()}
              title="Copy shareable link to this trip"
            >
              {copied ? "✓ Link copied" : "🔗 Share"}
            </button>
          )}
        </header>

        <section className="planner-card" aria-label="Trip planner">
          <div className="pickers">
            <span className="picker-connector" aria-hidden />
            <PointPicker
              kind="start"
              value={start}
              onChange={setStart}
              picking={picking === "start"}
              onPickOnMap={() => setPicking(picking === "start" ? null : "start")}
              onUseMyLocation={useMyLocation}
              locating={locating}
            />
            <PointPicker
              kind="destination"
              value={end}
              onChange={setEnd}
              picking={picking === "destination"}
              onPickOnMap={() => setPicking(picking === "destination" ? null : "destination")}
            />
            <button
              type="button"
              className="swap-btn"
              onClick={swap}
              aria-label="Swap starting point and destination"
              title="Swap starting point and destination"
            >
              ⇅
            </button>
          </div>

          {locateError && <p className="note locate-note">{locateError}</p>}
          {picking && (
            <p className="note pick-note">
              ⌖ Tap anywhere on the map to set the {picking === "start" ? "Starting Point" : "Destination"}.
            </p>
          )}

          <div className="planner-divider" />

          <div className="trip-toolbar">
            <div className="depart-picker">
              <label htmlFor="depart-mode" className="sr-only">
                Departure time
              </label>
              <select
                id="depart-mode"
                value={departAt ? "scheduled" : "now"}
                onChange={(e) => setDepartAt(e.target.value === "scheduled" ? defaultSgtDateTimeLocal() : null)}
              >
                <option value="now">🕒 Leave now</option>
                <option value="scheduled">📅 Depart at…</option>
              </select>
              {departAt && (
                <input
                  type="datetime-local"
                  aria-label="Departure date and time (Singapore time)"
                  value={departAt}
                  onChange={(e) => setDepartAt(e.target.value || null)}
                />
              )}
            </div>
          </div>

          <label className={`toggle ${minimise ? "is-active" : ""}`}>
            <input type="checkbox" checked={minimise} onChange={(e) => setMinimise(e.target.checked)} />
            <span className="toggle-body">
              <span className="toggle-title-row">
                <strong>Always minimise exposure</strong>
                {minimise && <span className="toggle-badge">Max protection</span>}
              </span>
              <small>For asthma, heart or lung conditions, the elderly, or young children</small>
            </span>
          </label>
        </section>

        <PlannerNavigation active={activePanel} haze={haze} error={hazeError} onChange={setActivePanel} />

        <section id="air-quality-panel" role="tabpanel" aria-labelledby="air-quality-tab" hidden={activePanel !== "air-quality"}>
          <HazeBanner haze={haze} tripBand={result?.tripBand ?? null} minimise={minimise} error={hazeError} />
        </section>

        <section id="routes-panel" role="tabpanel" aria-labelledby="routes-tab" className="results" aria-live="polite" hidden={activePanel !== "routes"}>
          {!start || !end ? (
            <div className="empty-state">
              <div className="empty-state-head">
                <strong>Breathe less outdoor air on your commute</strong>
                <p className="empty">
                  Set a <strong>Starting Point</strong> and <strong>Destination</strong> above, or try a sample Singapore trip:
                </p>
              </div>
              <div className="sample-trips">
                {SAMPLE_TRIPS.map((sample) => (
                  <button
                    key={sample.label}
                    type="button"
                    className="sample-trip-btn"
                    onClick={() => {
                      setStart(sample.start);
                      setEnd(sample.end);
                    }}
                  >
                    <span className="sample-trip-main">{sample.label}</span>
                    <span className="sample-trip-tag">{sample.tag}</span>
                  </button>
                ))}
              </div>
              <div className="tier-explainer">
                <div className="tier-explainer-row">
                  <span className="tier-dot protected" />
                  <span>
                    <strong>Protected</strong> · Air-conditioned trains, buses &amp; enclosed underground/mall links
                  </span>
                </div>
                <div className="tier-explainer-row">
                  <span className="tier-dot covered" />
                  <span>
                    <strong>Covered</strong> · LTA linkways, bus stops &amp; elevated platforms (roofed, open-air)
                  </span>
                </div>
                <div className="tier-explainer-row">
                  <span className="tier-dot exposed" />
                  <span>
                    <strong>Exposed</strong> · Uncovered outdoor streets &amp; crossings
                  </span>
                </div>
              </div>
            </div>
          ) : loading ? (
            <div className="loading-state" role="status">
              <p className="loading-caption">Scoring routes against live PM2.5 &amp; sheltered walkways…</p>
              <div className="skeleton-card" />
              <div className="skeleton-card" />
            </div>
          ) : routeError ? (
            <p className="error">{routeError}</p>
          ) : routes.length === 0 ? (
            <p className="empty">No routes found between these points.</p>
          ) : (
            <>
              {result?.mock && (
                <p className="mock-note">
                  Demo routes: OneMap routing isn't configured, so these routes are simulated. Haze readings and search are live.
                </p>
              )}
              {result?.taxi && (
                <TaxiCard taxi={result.taxi} shown={showTaxi} onToggle={() => setShowTaxi((s) => !s)} />
              )}
              <p className="route-source-note">
                OneMap travel estimates. Recommendations balance arrival time and haze exposure.
                {" "}<a href={`https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", origin: start.location.join(","), destination: end.location.join(","), travelmode: "transit" })}`} target="_blank" rel="noopener noreferrer">Compare in Google Maps ↗</a>
                {departAt && " Set the same departure time there."}
              </p>
              {routes.map((r) => (
                <RouteCard
                  key={r.id}
                  route={r}
                  allRoutes={routes}
                  selected={r.id === selectedId}
                  onSelect={() => {
                    setSelectedId(r.id);
                    setActiveStepIndex(null);
                    setNavigating(false);
                  }}
                  activeStepIndex={r.id === selectedId ? activeStepIndex : null}
                  onSelectStep={(idx) => {
                    setActiveStepIndex(idx);
                    if (idx === null) setNavigating(false);
                  }}
                  onStartNavigation={() => {
                    setSheetSnap("peek");
                    document.querySelector(".panel")?.scrollTo({ top: 0 });
                    setNavigating(true);
                    setActiveStepIndex(activeStepIndex ?? 0);
                  }}
                />
              ))}
              <p className="fineprint">
                <strong>Protected:</strong> inside trains, buses, MRT stations &amp; CBD indoor links.{" "}
                <strong>Covered:</strong> roofed but open-air (bus stops, LTA linkways, elevated platforms).{" "}
                <strong>Exposed:</strong> open-air walking.
              </p>
            </>
          )}
        </section>
      </aside>

      <main className="map-wrap">
        <div className="map-atmosphere" aria-hidden />
        {navigating && selectedRoute && (
          <NavigationBanner
            route={selectedRoute}
            stepIndex={activeStepIndex ?? 0}
            followGps={followGps}
            onChangeStep={(idx) => {
              setFollowGps(false);
              setActiveStepIndex(idx);
            }}
            onToggleFollowGps={() => setFollowGps((f) => !f)}
            onExit={() => {
              setNavigating(false);
              setActiveStepIndex(null);
            }}
          />
        )}
        <MapView
          start={start?.location ?? null}
          end={end?.location ?? null}
          userLocation={userLocation}
          routes={routes}
          selectedId={selectedId}
          activeStepIndex={activeStepIndex}
          taxi={result?.taxi ?? null}
          showTaxi={showTaxi}
          onMapTap={onMapTap}
          onDragStart={(p) => void placeAt("start", p)}
          onDragEnd={(p) => void placeAt("destination", p)}
          onSelectRoute={(id) => {
            setSelectedId(id);
            setActiveStepIndex(null);
            setNavigating(false);
          }}
          onSelectStep={setActiveStepIndex}
          onLocateMe={useMyLocation}
        />
      </main>
    </div>
  );
}
