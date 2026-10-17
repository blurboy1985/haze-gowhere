import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { collapseSteps, fmtMin, routeCalloutPoint, routeStopMarkers, stepBoundsPoints } from "../domain/directions";
import type { LatLng, RankedRoute, TaxiSuggestion, Tier } from "../domain/types";

export const TIER_COLOUR: Record<Tier, string> = {
  exposed: "#d64545",
  covered: "#e0a526",
  protected: "#2f9e6b",
};

const SINGAPORE: LatLng = [1.3521, 103.8198];
const BOUNDS = L.latLngBounds([1.144, 103.535], [1.494, 104.1]);

const pinIcon = (letter: string, cls: string) =>
  L.divIcon({ className: "", html: `<div class="pin ${cls}"><span>${letter}</span></div>`, iconSize: [30, 38], iconAnchor: [15, 36] });
const START_ICON = pinIcon("A", "pin-start");
const END_ICON = pinIcon("B", "pin-end");
const GPS_ICON = L.divIcon({
  className: "",
  html: `<div class="gps-dot" title="Your current location"><span class="gps-pulse"></span><span class="gps-core"></span></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const calloutIcon = (route: RankedRoute, isSelected: boolean) => {
  const exp = Math.round(route.exposedMinutes);
  const expText = exp > 0 ? `${exp}m exp` : "0m exp";
  return L.divIcon({
    className: "",
    html: `<div class="map-pill ${isSelected ? "selected" : ""}"><strong>${fmtMin(route.totalMinutes)}</strong><span>${expText}</span></div>`,
    iconSize: [96, 26],
    iconAnchor: [48, 13],
  });
};

interface Props {
  start: LatLng | null;
  end: LatLng | null;
  userLocation?: LatLng | null;
  routes: RankedRoute[];
  selectedId: string | null;
  activeStepIndex?: number | null;
  taxi: TaxiSuggestion | null;
  showTaxi: boolean;
  onMapTap: (p: LatLng) => void;
  onDragStart: (p: LatLng) => void;
  onDragEnd: (p: LatLng) => void;
  onSelectRoute: (id: string) => void;
  onSelectStep?: (index: number | null) => void;
  onLocateMe?: () => void;
}

function TapHandler({ onTap }: { onTap: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onTap([e.latlng.lat, e.latlng.lng]) });
  return null;
}

function FitTo({ points, fitTick }: { points: LatLng[]; fitTick: number }) {
  const map = useMap();
  const key = `${fitTick}:${points.map((p) => p.join()).join("|")}`;
  useEffect(() => {
    if (points.length === 1) map.setView(points[0]!, Math.max(map.getZoom(), 15));
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [44, 44], maxZoom: 17 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

function MapControls({
  hasRoute,
  activeStepIndex,
  userLocation,
  onResetRoute,
  onLocateMe,
}: {
  hasRoute: boolean;
  activeStepIndex: number | null;
  userLocation: LatLng | null;
  onResetRoute: () => void;
  onLocateMe?: () => void;
}) {
  const map = useMap();
  return (
    <div className="map-controls" role="group" aria-label="Map controls">
      {hasRoute && (
        <button
          type="button"
          className={`map-ctrl-btn ${activeStepIndex !== null ? "active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onResetRoute();
          }}
          title="Fit full route"
          aria-label="Fit full route"
        >
          ⊡
        </button>
      )}
      {onLocateMe && (
        <button
          type="button"
          className="map-ctrl-btn"
          onClick={(e) => {
            e.stopPropagation();
            if (userLocation) map.setView(userLocation, Math.max(map.getZoom(), 15));
            onLocateMe();
          }}
          title="Center on my location"
          aria-label="Center on my location"
        >
          ◎
        </button>
      )}
      <button
        type="button"
        className="map-ctrl-btn"
        onClick={(e) => {
          e.stopPropagation();
          map.zoomIn();
        }}
        title="Zoom in"
        aria-label="Zoom in"
      >
        +
      </button>
      <button
        type="button"
        className="map-ctrl-btn"
        onClick={(e) => {
          e.stopPropagation();
          map.zoomOut();
        }}
        title="Zoom out"
        aria-label="Zoom out"
      >
        −
      </button>
    </div>
  );
}

export function MapView(props: Props) {
  const { start, end, userLocation = null, routes, selectedId, activeStepIndex = null, taxi, showTaxi, onSelectStep, onLocateMe } = props;
  const [fitTick, setFitTick] = useState(0);
  const selected = routes.find((r) => r.id === selectedId);
  const others = routes.filter((r) => r.id !== selectedId);

  const activeLegSet = useMemo(() => {
    if (!selected || activeStepIndex === null) return null;
    const step = collapseSteps(selected.legs)[activeStepIndex];
    return step ? new Set(step.legIndices) : null;
  }, [selected, activeStepIndex]);

  const stopMarkers = useMemo(() => (selected ? routeStopMarkers(selected.legs) : []), [selected]);

  const fitPoints = useMemo(() => {
    if (selected) return stepBoundsPoints(selected.legs, activeStepIndex);
    return [start, end].filter((p): p is LatLng => p !== null);
  }, [selected, activeStepIndex, start, end]);

  const resetRouteView = () => {
    onSelectStep?.(null);
    setFitTick((t) => t + 1);
  };

  return (
    <MapContainer center={SINGAPORE} zoom={12} minZoom={11} maxZoom={19} maxBounds={BOUNDS} className="map" zoomControl={false}>
      <TileLayer
        url="https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png"
        detectRetina
        attribution='<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:20px;width:20px;vertical-align:middle"/>&nbsp;<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener">Singapore Land Authority</a>&nbsp;&#124;&nbsp;Indoor links &copy;&nbsp;<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'
      />
      <TapHandler onTap={props.onMapTap} />
      <FitTo points={fitPoints} fitTick={fitTick} />
      <MapControls
        hasRoute={Boolean(selected)}
        activeStepIndex={activeStepIndex}
        userLocation={userLocation}
        onResetRoute={resetRouteView}
        onLocateMe={onLocateMe}
      />

      {others.map((r) => {
        const callout = routeCalloutPoint(r.legs);
        return (
          <div key={r.id}>
            <Polyline
              positions={r.legs.flatMap((l) => l.path)}
              pathOptions={{ color: "#6b7280", weight: 5, opacity: 0.45, dashArray: "2 8" }}
              eventHandlers={{ click: () => props.onSelectRoute(r.id) }}
            />
            {callout && (
              <Marker
                position={callout}
                icon={calloutIcon(r, false)}
                eventHandlers={{ click: () => props.onSelectRoute(r.id) }}
              />
            )}
          </div>
        );
      })}
      {showTaxi && taxi && <Polyline positions={taxi.path} pathOptions={{ color: "#1f2a37", weight: 4, opacity: 0.6, dashArray: "8 6" }} />}
      {selected?.legs.map((leg, i) => {
        const isHighlighted = activeLegSet ? activeLegSet.has(i) : false;
        const isDimmed = activeLegSet ? !activeLegSet.has(i) : false;
        return (
          <div key={`${selected.id}-${i}`}>
            {isHighlighted && (
              <Polyline
                positions={leg.path}
                pathOptions={{ color: "#ffffff", weight: leg.mode === "walk" ? 11 : 12, opacity: 0.95, lineCap: "round" }}
              />
            )}
            <Polyline
              positions={leg.path}
              pathOptions={{
                color: TIER_COLOUR[leg.tier],
                weight: isHighlighted ? (leg.mode === "walk" ? 7 : 8) : leg.mode === "walk" ? 6 : 7,
                opacity: isDimmed ? 0.38 : 0.95,
                dashArray: leg.mode === "walk" ? "1 9" : undefined,
                lineCap: "round",
              }}
            />
          </div>
        );
      })}

      {selected && (() => {
        const callout = routeCalloutPoint(selected.legs);
        return callout ? <Marker position={callout} icon={calloutIcon(selected, true)} interactive={false} /> : null;
      })()}

      {stopMarkers.map((m, i) => (
        <CircleMarker
          key={`stop-${i}`}
          center={m.position}
          radius={m.kind === "transfer" ? 6 : 5}
          pathOptions={{
            color: m.badge?.colour ?? "#1f2a37",
            weight: 2.5,
            fillColor: "#ffffff",
            fillOpacity: 1,
          }}
        >
          <Tooltip direction="top" offset={[0, -6]}>
            {m.label}
          </Tooltip>
        </CircleMarker>
      ))}

      {userLocation && <Marker position={userLocation} icon={GPS_ICON} interactive={false} />}

      {start && (
        <Marker
          position={start}
          icon={START_ICON}
          draggable
          eventHandlers={{ dragend: (e) => { const ll = (e.target as L.Marker).getLatLng(); props.onDragStart([ll.lat, ll.lng]); } }}
        />
      )}
      {end && (
        <Marker
          position={end}
          icon={END_ICON}
          draggable
          eventHandlers={{ dragend: (e) => { const ll = (e.target as L.Marker).getLatLng(); props.onDragEnd([ll.lat, ll.lng]); } }}
        />
      )}
    </MapContainer>
  );
}
