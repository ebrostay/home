"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { decodePolyline } from "@/lib/nearby";
import type { RouteBand } from "@/lib/api";
import { LEAFLET_PREFIX, ORS_ATTRIBUTION, OSM_ATTRIBUTION } from "@/lib/mapAttribution";

// The public "what's nearby" map (merges what used to be sections 7 and 9):
// the street BAND this home sits on (ADR-041 — never the door), the
// destination for whichever entry Nearby.tsx has active (map-marker-chosen —
// a plain committed dot, the same meaning NearbyMap gives an already-saved
// entry), and the fan-and-trunk route ORS returns once the guest clicks one.
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
// `bandLabel` names the band pill; `mapLabel` is the region's own
// `aria-label`, passed in rather than pulled from a `useTranslations` call
// here — this is a guest-facing detail component, and the string belongs to
// `detail.streetBand`/`detail.location` in the caller, not to any i18n
// namespace of this map's own.

export type NeighbourhoodMapDestination = { lat: number; lng: number; label: string };

export type NeighbourhoodMapProps = {
  /** The public segment of the street this home sits on, [lat, lng] pairs —
   *  never the door (ADR-041). Always at least two points: the page gates the
   *  whole neighbourhood section on `p.band` being non-null before this
   *  component ever mounts. */
  band: [number, number][];
  /** Names the band — in the corner legend always, and in the tooltip that
   *  follows the pointer over the band itself. Not a permanent pill on the
   *  map anymore: the pill sat mid-band and covered exactly the streets a
   *  reader was trying to read (owner call, 2026-08-07). */
  bandLabel: string;
  /** The caller's reasons to light the band up — hovering or clicking the
   *  street plate. Hovering the band or the legend lights it too, handled
   *  internally; either source alone is enough. */
  bandHot?: boolean;
  mapLabel: string;
  destination: NeighbourhoodMapDestination | null;
  route: RouteBand | null;
  /** The destination is drawn already and its line is still coming, so the pin
   *  says so on the map — where the line is about to appear — rather than in
   *  the list, which would have to grow a row to do it. */
  routePending?: boolean;
  /** Bumped by the caller to bring the street back into view — the "show on
   *  map" control beside the section title. A counter, not a flag: two clicks
   *  in a row are two requests, and a `true` that is already `true` would
   *  answer only the first. */
  recentre?: number;
  className?: string;
};

export function NeighbourhoodMap({
  band,
  bandLabel,
  bandHot = false,
  mapLabel,
  destination,
  route,
  routePending = false,
  recentre = 0,
  className = "",
}: NeighbourhoodMapProps) {
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
  /** The band's two polylines (glow + line), for the highlight toggles. */
  const bandPathsRef = useRef<any[]>([]);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Two independent reasons to light the band — the caller's prop (plate
  // hover/click) and a pointer over the band or legend here. Refs, not state:
  // the highlight is a CSS class on SVG nodes Leaflet owns, and a re-render
  // has nothing to redraw for it.
  const hotRef = useRef({ prop: false, hover: false });
  const applyHot = () => {
    const hot = hotRef.current.prop || hotRef.current.hover;
    for (const p of bandPathsRef.current)
      p.getElement()?.classList.toggle("street-band-hot", hot);
  };
  const setHoverHot = (v: boolean) => {
    hotRef.current.hover = v;
    applyHot();
  };

  // Leaflet loads asynchronously, so on the very first render(s) mapRef and
  // the layer refs are still null even though `destination`/`route` may
  // already be non-null (a fast click right after mount). The two redraw
  // effects below depend on this to run once the map actually exists.
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;

      // No initial setView: the band has no single point to centre on, so the
      // view is established by fitBounds below, once the band itself is on
      // the map.
      mapRef.current = L.map(containerRef.current, { scrollWheelZoom: false });
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

      // The band, not a pin (ADR-041): glow under line, river blue via CSS
      // classes (globals.css, next to `.nearby-route-line` — same reasoning:
      // `stroke` goes through a real CSS rule rather than Leaflet's `color`
      // option, which writes straight into the SVG presentation attribute and
      // does not reliably resolve var() there or repaint on a `data-theme`
      // flip). Added directly to the map, not into a layer group: it never
      // moves and must survive layer.clearLayers() on every
      // destination/route redraw below.
      const bandLine: [number, number][] = band;
      const glow = L.polyline(bandLine, {
        className: "street-band-glow",
        weight: 22,
        opacity: 0.16,
      }).addTo(mapRef.current);
      const line = L.polyline(bandLine, {
        className: "street-band-line",
        weight: 5,
        opacity: 0.6,
      }).addTo(mapRef.current);
      bandPathsRef.current = [glow, line];

      // No permanent label: a pill riding mid-band covered exactly the
      // streets a reader zooms in to read. The name lives in the corner
      // legend (JSX below) and in this tooltip, which follows the pointer
      // over the band — the 22px glow doubles as the hover target. Hovering
      // also lights the band, the same effect the street plate drives
      // through `bandHot`.
      for (const path of bandPathsRef.current) {
        path.bindTooltip(escapeHtml(bandLabel), {
          sticky: true,
          direction: "top",
          offset: [0, -10],
          className: "street-band-tip",
        });
        path.on("mouseover", () => setHoverHot(true));
        path.on("mouseout", () => setHoverHot(false));
      }
      mapRef.current.fitBounds(L.latLngBounds(bandLine).pad(0.3));

      destinationRef.current = L.layerGroup().addTo(mapRef.current);
      lineRef.current = L.layerGroup().addTo(mapRef.current);

      setMapReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // Mount once, on the STARTING band — re-running on every change would
    // rebuild the map out from under whatever the guest is doing. `bandLabel`
    // and `mapLabel` are omitted the same way: translated strings do not
    // change within one page life. `band` itself is stable across this page's
    // life too — it comes straight off the fetched property and that state is
    // set once — so keying off its reference is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [band]);

  // Redraw the destination pin whenever the active entry changes, and fit the
  // view to band+destination so a newly clicked entry is never off-screen —
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

    mapRef.current?.fitBounds(L.latLngBounds([...band, [destination.lat, destination.lng]]), {
      padding: [40, 40],
      maxZoom: 16,
    });
    // `band` intentionally absent beyond the initial read above: it anchors
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

  // Bring the street back into view, keeping whatever zoom the reader is on —
  // the "show on map" control beside the section title. `0` is "never
  // asked", so this does not fight the initial view.
  useEffect(() => {
    if (!recentre) return;
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.fitBounds(L.latLngBounds(band).pad(0.3), { animate: !reduced });
    // `band` is read, never watched: the band moving is not a reason to
    // recentre — the reader asking is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentre, mapReady]);

  // Redraw the route whenever it changes, into a layer cleared on each
  // change — same as NearbyMap — so a stale line from a previously active
  // entry never lingers once another is picked, and so a failed lookup
  // (route back to null) clears whatever was there without waiting for a new
  // destination. Fan-and-trunk (ADR-041 point 5): the two boundary-sample
  // stubs draw a touch thinner, the shared trunk once they converge draws the
  // same as the classic single line. Both are fully opaque — a faded green
  // over map tiles had too little contrast to follow.
  useEffect(() => {
    const L = leafletRef.current;
    const layer = lineRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    if (!route) return;
    for (const stub of [route.stubA, route.stubB])
      if (stub)
        L.polyline(decodePolyline(stub), {
          className: "nearby-route-stub",
          weight: 3.5,
        }).addTo(layer);
    if (route.trunk)
      L.polyline(decodePolyline(route.trunk), {
        className: "nearby-route-line",
        weight: 4,
      }).addTo(layer);
  }, [route, mapReady]);

  // The plate's hover and its 5-second click-flash arrive as one boolean; the
  // band's own hover state is OR-ed in by `applyHot`. `mapReady` re-runs this
  // once the polylines actually exist, for a plate hovered mid-load.
  useEffect(() => {
    hotRef.current.prop = bandHot;
    applyHot();
    // `applyHot` is a stable module-pattern helper over refs, not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bandHot, mapReady]);

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
    <div
      className={`relative z-0 overflow-hidden rounded-(--radius-card) border border-line ${className}`}
    >
      <div ref={containerRef} role="application" aria-label={mapLabel} className="h-full w-full" />
      {/* The legend that replaced the mid-band pill: same words, out of the
          map's way. Top-right — Leaflet's zoom holds top-left, the travel
          toggle (page overlay) holds bottom-left, attribution bottom-right.
          Hovering it lights the band, the same as hovering the band itself:
          the legend explains the blue line, so pointing at either should
          point at both. z-[1000] matches Leaflet's own controls. */}
      <div
        className="street-band-legend absolute right-2 top-2 z-[1000]"
        onMouseEnter={() => setHoverHot(true)}
        onMouseLeave={() => setHoverHot(false)}
      >
        <span className="street-band-legend-swatch" aria-hidden />
        {bandLabel}
      </div>
    </div>
  );
}

// The label is interpolated into a Leaflet tooltip's raw HTML string, so it
// has to be escaped — same pattern ResultsMap.tsx uses for its price pins.
// `bandLabel` is our own message string, never guest input, but escaped
// regardless: an unescaped `&` alone would break the markup.
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
