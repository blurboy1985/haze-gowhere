import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
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

interface Props {
  start: LatLng | null;
  end: LatLng | null;
  routes: RankedRoute[];
  selectedId: string | null;
  taxi: TaxiSuggestion | null;
  showTaxi: boolean;
  onMapTap: (p: LatLng) => void;
  onDragStart: (p: LatLng) => void;
  onDragEnd: (p: LatLng) => void;
  onSelectRoute: (id: string) => void;
}

function TapHandler({ onTap }: { onTap: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onTap([e.latlng.lat, e.latlng.lng]) });
  return null;
}

function FitTo({ points }: { points: LatLng[] }) {
  const map = useMap();
  const key = points.map((p) => p.join()).join("|");
  useEffect(() => {
    if (points.length === 1) map.setView(points[0]!, Math.max(map.getZoom(), 15));
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 17 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

export function MapView(props: Props) {
  const { start, end, routes, selectedId, taxi, showTaxi } = props;
  const selected = routes.find((r) => r.id === selectedId);
  const others = routes.filter((r) => r.id !== selectedId);

  const fitPoints = useMemo(() => {
    if (selected) return selected.legs.flatMap((l) => l.path);
    return [start, end].filter((p): p is LatLng => p !== null);
  }, [selected, start, end]);

  return (
    <MapContainer center={SINGAPORE} zoom={12} minZoom={11} maxZoom={19} maxBounds={BOUNDS} className="map" zoomControl={false}>
      <TileLayer
        url="https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png"
        detectRetina
        attribution='<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:20px;width:20px;vertical-align:middle"/>&nbsp;<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener">Singapore Land Authority</a>'
      />
      <TapHandler onTap={props.onMapTap} />
      <FitTo points={fitPoints} />

      {others.map((r) => (
        <Polyline
          key={r.id}
          positions={r.legs.flatMap((l) => l.path)}
          pathOptions={{ color: "#6b7280", weight: 5, opacity: 0.45, dashArray: "2 8" }}
          eventHandlers={{ click: () => props.onSelectRoute(r.id) }}
        />
      ))}
      {showTaxi && taxi && <Polyline positions={taxi.path} pathOptions={{ color: "#1f2a37", weight: 4, opacity: 0.6, dashArray: "8 6" }} />}
      {selected?.legs.map((leg, i) => (
        <Polyline
          key={`${selected.id}-${i}`}
          positions={leg.path}
          pathOptions={{
            color: TIER_COLOUR[leg.tier],
            weight: leg.mode === "walk" ? 6 : 7,
            opacity: 0.95,
            dashArray: leg.mode === "walk" ? "1 9" : undefined,
            lineCap: "round",
          }}
        />
      ))}

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
