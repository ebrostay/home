"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { decodePolyline } from "@/lib/nearby";
import { LEAFLET_PREFIX, ORS_ATTRIBUTION, OSM_ATTRIBUTION } from "@/lib/mapAttribution";

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
  routePending = false,
  recentre = 0,
  className = "",
}: {
  home: { lat: number; lng: number };
  homeLabel: string;
  mapLabel: string;
  destination: NeighbourhoodMapDestination | null;
  routePolyline: string | null;
  /** The destination is drawn already and its line is still coming, so the pin
   *  says so on the map — where the line is about to appear — rather than in
   *  the list, which would have to grow a row to do it. */
  routePending?: boolean;
  /** Bumped by the caller to put the home back in the middle — the address
   *  plate above the map asking "where is this, exactly". A counter, not a
   *  flag: two clicks in a row are two requests, and a `true` that is already
   *  `true` would answer only the first. */
  recentre?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  /* eslint-disable @typescript-eslint/no-explicit-any -- Leaflet is loaded at
     runtime and has no types available at this import site. */
  const mapRef = useRef<any>(null);
  const destinationRef = useRef<any>(null);
  /** The destination marker itself, so the pulse below can go on the element
   *  already on the map. */
  const destinationMarkerRef = useRef<any>(null);
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
      mapRef.current.attributionControl.setPrefix(LEAFLET_PREFIX);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: OSM_ATTRIBUTION,
      }).addTo(mapRef.current);
      // The routing credit rides in the banner, not on the tile layer: it is
      // owed for the lines and the figures beside them, not for the tiles.
      // Added unconditionally rather than with the first route — the two
      // lists below this map are ABOUT openrouteservice answers, so the
      // credit is due from the moment the map is on screen, and a credit
      // that blinks into existence on the first click is one nobody reads.
      mapRef.current.attributionControl.addAttribution(ORS_ATTRIBUTION);

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

    destinationMarkerRef.current = L.marker([destination.lat, destination.lng], {
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

  // A CLASS on the marker that is already drawn, never a redraw: rebuilding it
  // would restart the pulse AND re-run the fitBounds above, twice per
  // selection, for a pin that has not moved.
  useEffect(() => {
    const el = destinationMarkerRef.current?.getElement()?.querySelector(".map-marker");
    if (!el) return;
    el.classList.toggle("map-marker-measuring", routePending);
  }, [routePending, destination, mapReady]);

  // Centre on the home, keeping whatever zoom the reader is on — unless they
  // have zoomed out past the point where a centred pin says anything, hence
  // the floor. `0` is "never asked", so this does not fight the initial view.
  useEffect(() => {
    if (!recentre) return;
    const map = mapRef.current;
    if (!map) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.setView([home.lat, home.lng], Math.max(map.getZoom(), 15), { animate: !reduced });
    // `home` is read, never watched: the home moving is not a reason to
    // recentre — the reader asking is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentre, mapReady]);

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
      // `stroke` comes from CSS (globals.css `.nearby-route-line`), not a
      // `color` option: Leaflet writes `color` straight into the SVG path's
      // `stroke` presentation attribute, and var() substitution there is not
      // reliable across engines or on a `data-theme` flip — see the CSS
      // comment.
      className: "nearby-route-line",
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
