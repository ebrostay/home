"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

// Leaflet + OSM tiles (carried from v1, docs/spec/07 §7.5). The design's
// hatch-and-river diagram was an explicit prototype stand-in; what carries
// over is the BEHAVIOUR — a card and its pin are the same object seen twice.
// Hovering either lights both; selecting either pans and zooms the map to that
// pin and grows it (no preview card — the pin itself is the confirmation).
export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  label: string; // e.g. "950 €"
};

export function ResultsMap({
  pins,
  hoveredId,
  selectedId,
  onHover,
  onSelect,
  className = "",
}: {
  pins: MapPin[];
  hoveredId: string | null;
  selectedId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Map<string, any>>(new Map());
  // Callbacks change identity every render; keep the marker handlers stable by
  // reading the latest through a ref instead of rebuilding every marker.
  const handlers = useRef({ onHover, onSelect });
  useEffect(() => {
    handlers.current = { onHover, onSelect };
  }, [onHover, onSelect]);
  // The map-build effect resolves async (dynamic import of Leaflet); if the
  // user has already picked a home by the time it lands, its fit-all view must
  // not clobber the selection's zoom. Read the live selection through a ref.
  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // --- build the map once, then keep markers in sync with `pins` -----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, {
          scrollWheelZoom: false,
          zoomControl: true,
        }).setView([41.6488, -0.8891], 13); // Zaragoza
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(mapRef.current);
        // Clicking bare map dismisses the current selection.
        mapRef.current.on("click", () => handlers.current.onSelect(null));
      }

      const map = mapRef.current;
      for (const marker of markersRef.current.values()) marker.remove();
      markersRef.current.clear();

      const bounds: [number, number][] = [];
      for (const pin of pins) {
        const marker = L.marker([pin.lat, pin.lng], {
          icon: L.divIcon({
            className: "",
            html: `<span class="map-pin" data-pin="${pin.id}">${pin.label}</span>`,
            iconSize: [0, 0],
          }),
        });
        marker.on("click", (e: { originalEvent?: Event }) => {
          e.originalEvent?.stopPropagation();
          handlers.current.onSelect(pin.id);
        });
        marker.on("mouseover", () => handlers.current.onHover(pin.id));
        marker.on("mouseout", () => handlers.current.onHover(null));
        marker.addTo(map);
        markersRef.current.set(pin.id, marker);
        bounds.push([pin.lat, pin.lng]);
      }

      // Fit to all pins only when nothing is picked — otherwise the selection
      // effect owns the view.
      if (bounds.length > 0 && !selectedIdRef.current) {
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pins]);

  // --- focus state: the selected pin grows most (is-selected), a hovered one
  //     less (is-active), and everything else dims. -------------------------
  useEffect(() => {
    const focused = selectedId ?? hoveredId;
    for (const [id, marker] of markersRef.current) {
      const el = marker.getElement()?.querySelector(".map-pin");
      if (!el) continue;
      el.classList.toggle("is-selected", id === selectedId);
      el.classList.toggle("is-active", id === hoveredId && id !== selectedId);
      el.classList.toggle("is-dim", focused !== null && id !== focused);
    }
  }, [hoveredId, selectedId, pins]);

  // --- selecting centres the map on the chosen pin (zoom is left as-is) -----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const marker = markersRef.current.get(selectedId);
    if (!marker) return;
    // The sticky column can change size after the map inits; re-measure so the
    // pin lands dead-centre rather than off to one side.
    map.invalidateSize({ animate: false });
    // panTo, not setView: recentre on the pin while keeping the user's current
    // zoom. animate:false because animated pans stall wherever rAF is throttled
    // (headless/backgrounded tabs) — the final position always applies.
    map.panTo(marker.getLatLng(), { animate: false });
  }, [selectedId]);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    [],
  );

  return (
    <div
      className={`relative overflow-hidden rounded-(--radius-card) border border-line bg-surface-2 shadow-(--shadow-card) ${className}`}
    >
      <div ref={containerRef} className="z-0 h-full w-full" />
    </div>
  );
}
