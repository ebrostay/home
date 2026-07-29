"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { decodePolyline } from "@/lib/nearby";

// The public "what's nearby" map (merges what used to be sections 7 and 9):
// the home pin (map-marker — the same class ListingsMap uses for "the one
// listing"), the destination for whichever entry Nearby.tsx has active
// (map-marker-chosen — a plain committed dot, the same meaning NearbyMap
// gives an already-saved entry), and the walking/driving route line ORS
// returns once the guest clicks one.
//
// Unlike NearbyMap, this map takes no clicks of its own — selection happens
// in the list beside it, never on a pin — so there is no onPick/onDrop and
// no ref section for a handler read mid-effect. What IS shared with NearbyMap
// is everything else: Leaflet is loaded with a dynamic `import("leaflet")`
// inside an effect, never as a module import, because it touches `window`
// while loading and this page is prerendered in Node (`output: "export"`),
// where `window` does not exist. The map/layer instances live in refs, not
// state, for the same reason.
//
// `homeLabel` names the home pin (title/alt); `mapLabel` is the region's own
// `aria-label`, passed in rather than pulled from a `useTranslations` call
// here — this is a guest-facing detail component, and the string belongs to
// `detail.location` in the caller, not to any i18n namespace of this map's
// own.

export type NeighbourhoodMapDestination = { lat: number; lng: number; label: string };

export function NeighbourhoodMap({
  home,
  homeLabel,
  mapLabel,
  destination,
  routePolyline,
  className = "",
}: {
  home: { lat: number; lng: number };
  homeLabel: string;
  mapLabel: string;
  destination: NeighbourhoodMapDestination | null;
  routePolyline: string | null;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  /* eslint-disable @typescript-eslint/no-explicit-any -- Leaflet is loaded at
     runtime and has no types available at this import site. */
  const mapRef = useRef<any>(null);
  const destinationRef = useRef<any>(null);
  const lineRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Leaflet loads asynchronously, so on the very first render(s) mapRef and
  // the layer refs are still null even though `destination`/`routePolyline`
  // may already be non-null (a fast click right after mount). The two redraw
  // effects below depend on this to run once the map actually exists.
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;

      mapRef.current = L.map(containerRef.current, { scrollWheelZoom: false }).setView(
        [home.lat, home.lng],
        15,
      );
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapRef.current);

      // The home pin is added directly to the map, not into a layer group:
      // it never moves and must survive layer.clearLayers() on every
      // destination/route redraw below.
      L.marker([home.lat, home.lng], {
        title: homeLabel,
        alt: homeLabel,
        icon: L.divIcon({
          className: "",
          html: `<div class="map-marker"></div>`,
          iconSize: [0, 0],
        }),
      }).addTo(mapRef.current);

      destinationRef.current = L.layerGroup().addTo(mapRef.current);
      lineRef.current = L.layerGroup().addTo(mapRef.current);

      setMapReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // Mount once, on the STARTING position — re-running on every change would
    // rebuild the map out from under whatever the guest is doing. `homeLabel`
    // and `mapLabel` are omitted the same way: translated strings do not
    // change within one page life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home.lat, home.lng]);

  // Redraw the destination pin whenever the active entry changes, and fit the
  // view to home+destination so a newly clicked entry is never off-screen —
  // the whole reason "Where you'll be" and "What's nearby" were merged into
  // one viewport in the first place.
  useEffect(() => {
    const L = leafletRef.current;
    const layer = destinationRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    if (!destination) return;

    L.marker([destination.lat, destination.lng], {
      title: destination.label,
      alt: destination.label,
      icon: L.divIcon({
        className: "",
        html: `<div class="map-marker map-marker-chosen"></div>`,
        iconSize: [0, 0],
      }),
    }).addTo(layer);

    mapRef.current?.fitBounds(
      [
        [home.lat, home.lng],
        [destination.lat, destination.lng],
      ],
      { padding: [40, 40], maxZoom: 16 },
    );
    // `home` intentionally absent beyond the initial read above: it anchors
    // every fit, not a reason to re-fit on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, mapReady]);

  // Redraw the route line whenever it changes, into a layer cleared on each
  // change — same as NearbyMap — so a stale line from a previously active
  // entry never lingers once another is picked, and so a failed lookup
  // (routePolyline back to null) clears whatever was there without waiting
  // for a new destination.
  useEffect(() => {
    const L = leafletRef.current;
    const layer = lineRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    if (!routePolyline) return;
    L.polyline(decodePolyline(routePolyline), {
      color: "var(--brand-strong)",
      weight: 4,
      opacity: 0.85,
    }).addTo(layer);
  }, [routePolyline, mapReady]);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    [],
  );

  // The size/border classes live on a WRAPPER, never on the div Leaflet
  // itself owns — see NearbyMap's identical note. React rewriting className
  // on the node Leaflet has already stamped `leaflet-container` etc. onto
  // would wipe those classes off and silently break interaction; splitting
  // the two elements means the inner div's className is the one static
  // string it started with and React never touches it again after the first
  // paint.
  return (
    <div className={`z-0 overflow-hidden rounded-(--radius-card) border border-line ${className}`}>
      <div ref={containerRef} role="application" aria-label={mapLabel} className="h-full w-full" />
    </div>
  );
}
