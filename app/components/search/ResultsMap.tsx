"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { clusterPins, type Cluster } from "@/lib/mapCluster";
import "leaflet/dist/leaflet.css";

// Leaflet + OSM tiles (carried from v1, docs/spec/07 §7.5). The design's
// hatch-and-river diagram was an explicit prototype stand-in; what carries
// over is the BEHAVIOUR — a card and its pin are the same object seen twice.
// Hovering either lights both; selecting either pans the map to that pin and
// grows it (no preview card — the pin itself is the confirmation).
//
// A pin is a GROUP of homes, not always one. Two homes 34m apart were one pin
// at every usable zoom, and the cheaper one was invisible under the dearer;
// see lib/mapCluster.ts for why that is this business's normal case rather
// than an edge case. A group draws as its cheapest price with a count, and
// clicking it does whatever will actually help:
//
//   · zooming would pull them apart  →  zoom to fit the group
//   · it would not (the same building) →  select every home in it, and let
//     the list beside the map be where they are compared
//
// The second is the important half. A map can point at a place; it cannot
// show you six flats stacked on one doorway, and pretending otherwise with a
// fan of offset pins would put pins where the homes are not.
export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  label: string; // e.g. "950 €"
  price: number; // orders a group so its anchor is the cheapest
};

const MAX_ZOOM = 19;

export function ResultsMap({
  pins,
  hoveredIds,
  selectedIds,
  onHover,
  onSelect,
  className = "",
}: {
  pins: MapPin[];
  hoveredIds: string[];
  selectedIds: string[];
  onHover: (ids: string[]) => void;
  onSelect: (ids: string[]) => void;
  className?: string;
}) {
  const t = useTranslations("listing");
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Map<string, any>>(new Map());
  const clustersRef = useRef<Cluster[]>([]);
  // Callbacks change identity every render; keep the marker handlers stable by
  // reading the latest through a ref instead of rebuilding every marker.
  const handlers = useRef({ onHover, onSelect });
  useEffect(() => {
    handlers.current = { onHover, onSelect };
  }, [onHover, onSelect]);
  // The map-build effect resolves async (dynamic import of Leaflet); if the
  // user has already picked a home by the time it lands, its fit-all view must
  // not clobber the selection's zoom. Read the live selection through a ref.
  const selectedRef = useRef(selectedIds);
  useEffect(() => {
    selectedRef.current = selectedIds;
  }, [selectedIds]);

  // Bumped on every zoom, because the projected distance between two pins —
  // and so which of them collide — is a function of zoom and nothing else.
  // Panning is translation and cannot change the answer, which is why this
  // does not listen for moveend.
  const [zoomTick, setZoomTick] = useState(0);

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
          maxZoom: MAX_ZOOM,
        }).setView([41.6488, -0.8891], 13); // Zaragoza
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: MAX_ZOOM,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(mapRef.current);
        // Clicking bare map dismisses the current selection.
        mapRef.current.on("click", () => handlers.current.onSelect([]));
        mapRef.current.on("zoomend", () => setZoomTick((n) => n + 1));
      }

      const map = mapRef.current;
      const zoom = map.getZoom();
      const clusters = clusterPins(
        pins,
        (lat, lng) => map.project([lat, lng], zoom),
        MAX_ZOOM - zoom,
      );
      clustersRef.current = clusters;

      for (const marker of markersRef.current.values()) marker.remove();
      markersRef.current.clear();

      for (const c of clusters) {
        const count = c.ids.length;
        const marker = L.marker([c.lat, c.lng], {
          icon: L.divIcon({
            className: "",
            html: `<span class="map-pin" data-pin="${c.key}"${
              count > 1
                ? ` aria-label="${escapeAttr(t("pinGroup", { count, price: c.label }))}"`
                : ""
            }>${escapeHtml(c.label)}${
              count > 1 ? `<i class="map-pin-count" aria-hidden="true">${count}</i>` : ""
            }</span>`,
            iconSize: [0, 0],
          }),
        });
        marker.on("click", (e: { originalEvent?: Event }) => {
          e.originalEvent?.stopPropagation();
          // A zoom that separates them is the better answer than a selection:
          // it puts every price back on the map instead of into the list.
          if (count > 1 && c.separable) {
            map.fitBounds(c.bounds, { padding: [64, 64], maxZoom: MAX_ZOOM });
            return;
          }
          handlers.current.onSelect(c.ids);
        });
        marker.on("mouseover", () => handlers.current.onHover(c.ids));
        marker.on("mouseout", () => handlers.current.onHover([]));
        marker.addTo(map);
        markersRef.current.set(c.key, marker);
      }

      // Fit to all pins only when nothing is picked — otherwise the selection
      // effect owns the view. Guarded on zoomTick too: a re-cluster after the
      // visitor's own zoom must not yank the view back to fit-all.
      if (pins.length > 0 && selectedRef.current.length === 0 && zoomTick === 0) {
        map.fitBounds(
          pins.map((p) => [p.lat, p.lng] as [number, number]),
          { padding: [48, 48], maxZoom: 15 },
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // zoomTick is a dependency on purpose: the clusters are only correct for
    // the zoom they were computed at.
  }, [pins, zoomTick, t]);

  // --- focus state: a selected pin grows most (is-selected), a hovered one
  //     less (is-active), and everything else dims. A group lights when ANY
  //     of its homes is the one being pointed at, from either side. ---------
  useEffect(() => {
    const focused = selectedIds.length > 0 ? selectedIds : hoveredIds;
    for (const [key, marker] of markersRef.current) {
      const el = marker.getElement()?.querySelector(".map-pin");
      if (!el) continue;
      const ids = clustersRef.current.find((c) => c.key === key)?.ids ?? [];
      const isSelected = ids.some((id) => selectedIds.includes(id));
      const isHovered = ids.some((id) => hoveredIds.includes(id));
      el.classList.toggle("is-selected", isSelected);
      el.classList.toggle("is-active", isHovered && !isSelected);
      el.classList.toggle(
        "is-dim",
        focused.length > 0 && !ids.some((id) => focused.includes(id)),
      );
    }
  }, [hoveredIds, selectedIds, zoomTick, pins]);

  // --- selecting recentres the map on the chosen pin (zoom is left as-is) ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || selectedIds.length === 0) return;
    const cluster = clustersRef.current.find((c) =>
      c.ids.some((id) => selectedIds.includes(id)),
    );
    const marker = cluster && markersRef.current.get(cluster.key);
    if (!marker) return;
    // The sticky column can change size after the map inits; re-measure so the
    // pin lands dead-centre rather than off to one side.
    map.invalidateSize({ animate: false });
    // panTo, not setView: recentre on the pin while keeping the user's current
    // zoom. animate:false because animated pans stall wherever rAF is throttled
    // (headless/backgrounded tabs) — the final position always applies.
    map.panTo(marker.getLatLng(), { animate: false });
  }, [selectedIds]);

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

// The label is interpolated into a divIcon's raw HTML string, so it has to be
// escaped: a home's price is ours, but the same path renders whatever the
// formatter produced and an unescaped `&` alone would break the markup.
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s: string) => escapeHtml(s).replace(/"/g, "&quot;");
