import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import {
  activeStepEndpoints,
  collapseSteps,
  fmtMin,
  routeCalloutPoint,
  routeStopMarkers,
  stepBoundsPoints,
} from "../domain/directions";
import { distanceMetres } from "../domain/geo";
import type { LatLng, RankedRoute, TaxiSuggestion, Tier } from "../domain/types";
import { MapDataCredits } from "./MapDataCredits";

export const TIER_COLOUR: Record<Tier, string> = {
  exposed: "#dc2626",
  covered: "#d97706",
  protected: "#059669",
};

const TIER_LABEL: Record<Tier, string> = {
  exposed: "Exposed",
  covered: "Covered",
  protected: "Protected",
};

const SINGAPORE: LatLng = [1.3521, 103.8198];
const BOUNDS = L.latLngBounds([1.144, 103.535], [1.494, 104.1]);

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

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

const stepEndpointIcon = (kind: "start" | "end" | "point", tier: Tier, label: string) => {
  const colour = TIER_COLOUR[tier];
  const tierName = TIER_LABEL[tier];
  const badgeText = kind === "start" ? "START" : kind === "end" ? "END" : tierName.toUpperCase();
  const glyph = kind === "start" ? "▶" : kind === "end" ? "◉" : "⏱";
  const posClass = kind === "end" ? "step-endpoint-below" : "step-endpoint-above";
  return L.divIcon({
    className: "",
    html: `
      <div class="step-endpoint ${posClass}">
        <div class="step-endpoint-node" style="--step-colour:${colour}">
          <span class="step-endpoint-halo"></span>
          <span class="step-endpoint-core">${glyph}</span>
        </div>
        <div class="step-endpoint-card">
          <span class="step-endpoint-tag" style="background:${colour}">${badgeText}</span>
          <span class="step-endpoint-label">${escapeHtml(label)}</span>
          <span class="step-endpoint-tier" style="color:${colour}">${tierName}</span>
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
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

function FitTo({ points, fitTick, hasActiveStep }: { points: LatLng[]; fitTick: number; hasActiveStep: boolean }) {
  const map = useMap();
  const key = `${fitTick}:${hasActiveStep ? "step" : "all"}:${points.map((p) => p.join()).join("|")}`;
  useEffect(() => {
    if (points.length === 0) return;
    const first = points[0]!;
    const isSinglePoint = points.every((p) => distanceMetres(first, p) < 15);
    if (isSinglePoint) {
      map.setView(first, Math.max(map.getZoom(), 16));
    } else if (hasActiveStep) {
      map.fitBounds(L.latLngBounds(points), {
        paddingTopLeft: [64, 148],
        paddingBottomRight: [64, 118],
        maxZoom: 17,
      });
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 17 });
    }
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
  const hasActiveStep = activeStepIndex !== null;

  const activeLegSet = useMemo(() => {
    if (!selected || activeStepIndex === null) return null;
    const step = collapseSteps(selected.legs)[activeStepIndex];
    return step ? new Set(step.legIndices) : null;
  }, [selected, activeStepIndex]);

  const stepEndpoints = useMemo(
    () => (selected ? activeStepEndpoints(selected.legs, activeStepIndex) : null),
    [selected, activeStepIndex],
  );

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
        attribution='<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:20px;width:20px;vertical-align:middle"/>&nbsp;<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener">Singapore Land Authority</a>'
      />
      <MapDataCredits />
      <TapHandler onTap={props.onMapTap} />
      <FitTo points={fitPoints} fitTick={fitTick} hasActiveStep={hasActiveStep} />
      <MapControls
        hasRoute={Boolean(selected)}
        activeStepIndex={activeStepIndex}
        userLocation={userLocation}
        onResetRoute={resetRouteView}
        onLocateMe={onLocateMe}
      />

      {others.map((r) => {
        const callout = !hasActiveStep ? routeCalloutPoint(r.legs) : null;
        return (
          <div key={r.id}>
            <Polyline
              positions={r.legs.flatMap((l) => l.path)}
              pathOptions={{ color: "#64748b", weight: 5, opacity: hasActiveStep ? 0.14 : 0.45, dashArray: "2 8" }}
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

      {/* Pass 1: Non-highlighted legs (either full route when no step is active, or dimmed context legs when a step is active) */}
      {selected?.legs.map((leg, i) => {
        if (activeLegSet?.has(i)) return null;
        const isDimmed = Boolean(activeLegSet);
        if (isDimmed) {
          return (
            <div key={`${selected.id}-bg-${i}`}>
              <Polyline
                positions={leg.path}
                pathOptions={{
                  color: "#0f172a",
                  weight: 7,
                  opacity: 0.16,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
              <Polyline
                positions={leg.path}
                pathOptions={{
                  color: TIER_COLOUR[leg.tier],
                  weight: 4.5,
                  opacity: 0.32,
                  dashArray: leg.mode === "walk" ? "2 7" : undefined,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            </div>
          );
        }
        return (
          <div key={`${selected.id}-full-${i}`}>
            <Polyline
              positions={leg.path}
              pathOptions={{ color: "#0f172a", weight: 11, opacity: 0.55, lineCap: "round", lineJoin: "round" }}
            />
            <Polyline
              positions={leg.path}
              pathOptions={{ color: "#ffffff", weight: 8.5, opacity: 0.96, lineCap: "round", lineJoin: "round" }}
            />
            <Polyline
              positions={leg.path}
              pathOptions={{
                color: TIER_COLOUR[leg.tier],
                weight: 6,
                opacity: 0.98,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
            {leg.mode === "walk" && (
              <Polyline
                positions={leg.path}
                pathOptions={{
                  color: "#ffffff",
                  weight: 2.8,
                  opacity: 0.95,
                  dashArray: "1 8",
                  lineCap: "round",
                }}
              />
            )}
          </div>
        );
      })}

      {/* Pass 2: Active/highlighted step legs rendered on top with high-contrast dark + white casing and vivid tier core */}
      {selected?.legs.map((leg, i) => {
        if (!activeLegSet?.has(i)) return null;
        return (
          <div key={`${selected.id}-active-${i}`}>
            <Polyline
              positions={leg.path}
              pathOptions={{ color: "#0f172a", weight: 16, opacity: 0.92, lineCap: "round", lineJoin: "round" }}
            />
            <Polyline
              positions={leg.path}
              pathOptions={{ color: "#ffffff", weight: 12, opacity: 1, lineCap: "round", lineJoin: "round" }}
            />
            <Polyline
              positions={leg.path}
              pathOptions={{
                color: TIER_COLOUR[leg.tier],
                weight: 8.5,
                opacity: 1,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
            {leg.mode === "walk" ? (
              <Polyline
                positions={leg.path}
                pathOptions={{
                  color: "#ffffff",
                  weight: 4,
                  opacity: 0.98,
                  dashArray: "1 10",
                  lineCap: "round",
                }}
              />
            ) : (
              <Polyline
                positions={leg.path}
                pathOptions={{
                  color: "#ffffff",
                  weight: 2.2,
                  opacity: 0.65,
                  dashArray: "6 12",
                  lineCap: "round",
                }}
              />
            )}
          </div>
        );
      })}

      {selected && !hasActiveStep && (() => {
        const callout = routeCalloutPoint(selected.legs);
        return callout ? <Marker position={callout} icon={calloutIcon(selected, true)} interactive={false} /> : null;
      })()}

      {stopMarkers.map((m, i) => {
        const isNearActiveStep =
          stepEndpoints &&
          (distanceMetres(m.position, stepEndpoints.start) < 80 || distanceMetres(m.position, stepEndpoints.end) < 80);
        const dimStop = hasActiveStep && !isNearActiveStep;
        return (
          <CircleMarker
            key={`stop-${i}`}
            center={m.position}
            radius={m.kind === "transfer" ? 7.5 : 6.5}
            pathOptions={{
              color: m.badge?.colour ?? "#0f172a",
              weight: 3,
              opacity: dimStop ? 0.28 : 1,
              fillColor: "#ffffff",
              fillOpacity: dimStop ? 0.28 : 1,
            }}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              {m.label}
            </Tooltip>
          </CircleMarker>
        );
      })}

      {/* High-visibility START / END markers with permanent callout labels for the selected step */}
      {stepEndpoints &&
        (stepEndpoints.isPointStep ? (
          <Marker
            position={stepEndpoints.start}
            icon={stepEndpointIcon("point", stepEndpoints.tier, stepEndpoints.startLabel)}
            zIndexOffset={1200}
            interactive={false}
          />
        ) : (
          <>
            <Marker
              position={stepEndpoints.start}
              icon={stepEndpointIcon("start", stepEndpoints.startTier, stepEndpoints.startLabel)}
              zIndexOffset={1200}
              interactive={false}
            />
            <Marker
              position={stepEndpoints.end}
              icon={stepEndpointIcon("end", stepEndpoints.endTier, stepEndpoints.endLabel)}
              zIndexOffset={1210}
              interactive={false}
            />
          </>
        ))}

      {userLocation && <Marker position={userLocation} icon={GPS_ICON} zIndexOffset={1300} interactive={false} />}

      {start && (
        <Marker
          position={start}
          icon={START_ICON}
          opacity={hasActiveStep ? 0.55 : 1}
          draggable
          eventHandlers={{ dragend: (e) => { const ll = (e.target as L.Marker).getLatLng(); props.onDragStart([ll.lat, ll.lng]); } }}
        />
      )}
      {end && (
        <Marker
          position={end}
          icon={END_ICON}
          opacity={hasActiveStep ? 0.55 : 1}
          draggable
          eventHandlers={{ dragend: (e) => { const ll = (e.target as L.Marker).getLatLng(); props.onDragEnd([ll.lat, ll.lng]); } }}
        />
      )}
    </MapContainer>
  );
}

