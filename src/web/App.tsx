import { useCallback, useEffect, useState } from "react";
import { nearestStepIndex } from "../domain/navigation";
import type { HazeReading, LatLng, RoutesResponse } from "../domain/types";
import { fetchHaze, fetchRoutes, reverseGeocode, type ChosenPoint } from "./api";
import { HazeBanner } from "./HazeBanner";
import { MapView } from "./MapView";
import { NavigationBanner } from "./NavigationBanner";
import { PointPicker } from "./PointPicker";
import { RouteCard, TaxiCard } from "./RouteCard";

type Which = "start" | "destination";

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
  const [start, setStart] = useState<ChosenPoint | null>(null);
  const [end, setEnd] = useState<ChosenPoint | null>(null);
  const [picking, setPicking] = useState<Which | null>(null);
  const [minimise, setMinimise] = useState(readMinimise);
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
        setLocateError(err.code === err.PERMISSION_DENIED ? "Location permission was denied. Search or tap the map instead." : "Couldn't get your location. Search or tap the map instead.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, []);

  // GPS is the default way to set the Starting Point.
  useEffect(useMyLocation, [useMyLocation]);

  useEffect(() => {
    try {
      localStorage.setItem(MINIMISE_KEY, minimise ? "1" : "0");
    } catch {
      /* per-viewer convenience only */
    }
  }, [minimise]);

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
    fetchRoutes(start.location, end.location, minimise, ctrl.signal)
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
  }, [start, end, minimise]);

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

  const routes = result?.routes ?? [];
  const selectedRoute = routes.find((r) => r.id === selectedId) ?? null;

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
    <div className={`app ${picking ? "is-picking" : ""} ${navigating ? "is-navigating" : ""}`}>
      <aside className="panel">
        <header className="brand">
          <h1>Haze GoWhere</h1>
          <p>Routes that keep you out of the haze</p>
        </header>

        <div className="pickers">
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
          <button type="button" className="swap-btn" onClick={swap} aria-label="Swap starting point and destination" title="Swap">⇅</button>
        </div>
        {locateError && <p className="note">{locateError}</p>}
        {picking && <p className="note pick-note">Tap the map to set the {picking === "start" ? "starting point" : "destination"}.</p>}

        <label className="toggle">
          <input type="checkbox" checked={minimise} onChange={(e) => setMinimise(e.target.checked)} />
          <span>
            <strong>Always minimise exposure</strong>
            <small>For asthma, heart or lung conditions, the elderly, or young children</small>
          </span>
        </label>

        <HazeBanner haze={haze} tripBand={result?.tripBand ?? null} error={hazeError} />

        <section className="results" aria-live="polite">
          {!start || !end ? (
            <p className="empty">Set a starting point and destination to see routes.</p>
          ) : loading ? (
            <p className="empty">Finding routes…</p>
          ) : routeError ? (
            <p className="error">{routeError}</p>
          ) : routes.length === 0 ? (
            <p className="empty">No routes found between these points.</p>
          ) : (
            <>
              {result?.mock && <p className="mock-note">Demo routes: OneMap routing isn't configured, so these routes are simulated. Haze readings and search are live.</p>}
              {result?.taxi && <TaxiCard taxi={result.taxi} shown={showTaxi} onToggle={() => setShowTaxi((s) => !s)} />}
              {routes.map((r) => (
                <RouteCard
                  key={r.id}
                  route={r}
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
                    setNavigating(true);
                    setActiveStepIndex(activeStepIndex ?? 0);
                  }}
                />
              ))}
              <p className="fineprint">
                Protected: inside trains, buses and MRT stations. Covered: roofed but open-air (bus stops, covered linkways), so you still breathe the haze. Exposed: open-air walking.
              </p>
            </>
          )}
        </section>
      </aside>

      <main className="map-wrap">
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
