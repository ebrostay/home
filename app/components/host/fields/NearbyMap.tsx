"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import "leaflet/dist/leaflet.css";
import { decodePolyline } from "@/lib/nearby";

// The nearby editor's map: the home pin (map-marker — the same divIcon class
// ListingsMap uses for "the one listing"), candidate pins from search
// (map-marker-suggested, reused as-is: a search result not yet added IS a
// proposal, the same meaning that class already carries for the geocoder's
// guess in LocationPicker), and entries already added to the listing
// (map-marker-chosen — brand green like the home pin since both are
// "committed", but a plain dot with no halo so the one true home pin never
// gets lost among the entries added to its own listing).
//
// `homeLabel` names the home pin itself (title/alt). It is a caller-supplied
// prop rather than another `useTranslations` call in here, because this map
// now carries many pins with their own `label`s — reusing the ADDRESS
// section's `mapLabel` for the home pin too (as this component briefly did)
// made the map region and the home pin announce the identical sentence.
// `mapLabel` stays exactly what it was: the container's own `aria-label`,
// describing what the whole map shows.
//
// Follows LocationPicker's lifecycle exactly: Leaflet is loaded inside an
// effect, never as a module import, because it touches `window` while
// loading and this page is prerendered in Node (output: "export") where
// `window` does not exist. Handler props are written into refs in an effect
// rather than read from render, for the same reason LocationPicker does it:
// a ref is not render output, so assigning one on the way past a render
// would make its value depend on how many times React chose to render.
//
// Unlike LocationPicker, this map does NOT fit bounds on every prop change
// — see the comment on the pins effect below.

export type NearbyMapPin = { id: string; lat: number; lng: number; label: string };

type NearbyMapProps = {
  home: { lat: number; lng: number };
  /** The home pin's own accessible name (title/alt) — short, e.g. "Home". Not
   *  the map region's aria-label, which stays `mapLabel` below. */
  homeLabel: string;
  candidates: NearbyMapPin[];
  chosen: NearbyMapPin[];
  activeId: string | null;
  routePolyline: string | null;
  dropMode: boolean;
  onPick: (id: string) => void;
  onDrop: (lat: number, lng: number) => void;
  className?: string;
};

export function NearbyMap({
  home,
  homeLabel,
  candidates,
  chosen,
  activeId,
  routePolyline,
  dropMode,
  onPick,
  onDrop,
  className = "",
}: NearbyMapProps) {
  // No prop on this component carries copy of its own (candidates/chosen
  // bring their own `label`), so the map's own accessible name reuses the
  // existing address-map string rather than inventing new catalogue copy —
  // it is an accurate description ("the home's location on the map") of
  // what this map fundamentally shows, home plus what surrounds it.
  const t = useTranslations("host.edit.address");
  const containerRef = useRef<HTMLDivElement>(null);
  /* eslint-disable @typescript-eslint/no-explicit-any -- Leaflet is loaded at
     runtime and has no types available at this import site. */
  const mapRef = useRef<any>(null);
  const pinsRef = useRef<any>(null);
  const lineRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Whether bounds have been fit to a batch of candidates already. Reset
  // when candidates goes back to empty, so the NEXT search fits again — a
  // fresh search replacing a previous one should still bring its results
  // into view.
  const firstFitRef = useRef(false);

  // Leaflet loads asynchronously (see the mount effect), so on the very
  // first render mapRef/pinsRef are still null even when `chosen` already
  // has entries (editing an existing listing). The pins/route effects below
  // depend on this to redraw once the map actually exists, rather than
  // relying on candidates/chosen/routePolyline happening to change again
  // later.
  const [mapReady, setMapReady] = useState(false);

  // Read inside handlers registered once. Written in effects, not during
  // render: a ref is not render output, and assigning one on the way past
  // makes the value depend on how many times React chose to render.
  const onPickRef = useRef(onPick);
  const onDropRef = useRef(onDrop);
  const dropModeRef = useRef(dropMode);
  useEffect(() => {
    onPickRef.current = onPick;
    onDropRef.current = onDrop;
    dropModeRef.current = dropMode;
  }, [onPick, onDrop, dropMode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Leaflet touches `window` as it loads, so it cannot be a module import
      // in a statically exported page.
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

      // The home pin is added directly to the map, not into pinsRef: it
      // never moves and must survive pinsRef.clearLayers() on every
      // candidate/chosen redraw.
      L.marker([home.lat, home.lng], {
        title: homeLabel,
        alt: homeLabel,
        icon: L.divIcon({
          className: "",
          html: `<div class="map-marker"></div>`,
          iconSize: [0, 0],
        }),
      }).addTo(mapRef.current);

      pinsRef.current = L.layerGroup().addTo(mapRef.current);
      lineRef.current = L.layerGroup().addTo(mapRef.current);

      mapRef.current.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        if (dropModeRef.current) onDropRef.current(e.latlng.lat, e.latlng.lng);
      });

      setMapReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // Mount once. `home` is the STARTING position — re-running on every
    // change would rebuild the map out from under the owner. `homeLabel` is
    // omitted the same way `t` always has been: a translated string does not
    // change within one page life, so there is nothing to react to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home.lat, home.lng]);

  // Redraw candidate and chosen pins whenever the lists or the active
  // selection change.
  //
  // Bounds are fit ONCE, the first time a non-empty batch of candidates
  // arrives, not on every redraw. This is the same trap LocationPicker's
  // comment warns about: an interactive map that re-fits on every prop
  // change yanks the view out from under whatever the owner is doing right
  // now — hovering a list row, dragging to compare a route. Only a genuinely
  // new search (candidates going empty, then non-empty again) earns another
  // fit.
  useEffect(() => {
    const L = leafletRef.current;
    const layer = pinsRef.current;
    if (!L || !layer) return;
    layer.clearLayers();

    const addPin = (pin: NearbyMapPin, className: string) => {
      const marker = L.marker([pin.lat, pin.lng], {
        title: pin.label,
        alt: pin.label,
        icon: L.divIcon({
          className: "",
          html: `<div class="${className}${pin.id === activeId ? " is-active" : ""}"></div>`,
          iconSize: [0, 0],
        }),
      });
      marker.on("click", () => onPickRef.current(pin.id));
      marker.addTo(layer);
    };

    for (const c of candidates) addPin(c, "map-marker map-marker-suggested");
    for (const c of chosen) addPin(c, "map-marker map-marker-chosen");

    if (candidates.length > 0) {
      if (!firstFitRef.current) {
        firstFitRef.current = true;
        const bounds: [number, number][] = [
          [home.lat, home.lng],
          ...candidates.map((c): [number, number] => [c.lat, c.lng]),
          ...chosen.map((c): [number, number] => [c.lat, c.lng]),
        ];
        mapRef.current?.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      }
    } else {
      firstFitRef.current = false;
    }
    // `home` intentionally absent: it anchors the initial fit, not a reason
    // to re-fit whenever the pin arrays themselves are merely redrawn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, chosen, activeId, mapReady]);

  // Redraw the route line whenever it changes, into a layer cleared on each
  // change so a stale route from a previously active candidate never
  // lingers once the owner picks another one.
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

  // In dropMode a map click calls onDrop; outside it, clicks do nothing —
  // enforced in the single click handler registered once above, via
  // dropModeRef.

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    [],
  );

  // The size/border/cursor classes live on a WRAPPER, never on the div
  // Leaflet itself owns. `dropMode` makes the cursor class change across
  // renders, and React writes a changed `className` straight onto the DOM
  // node it thinks it owns — which, on `containerRef`'s element, would wipe
  // out `leaflet-container` and friends the moment `L.map()` added them,
  // since React has no idea Leaflet also touched that attribute. Splitting
  // the two elements means React freely rewrites the wrapper every render
  // while the inner div's className stays the one static string it started
  // with, so React never touches it again after the first paint and
  // Leaflet's own classes survive every drop-mode toggle.
  return (
    <div
      className={`z-0 overflow-hidden rounded-(--radius-card) border border-line ${dropMode ? "cursor-crosshair" : ""} ${className}`}
    >
      <div ref={containerRef} role="application" aria-label={t("mapLabel")} className="h-full w-full" />
    </div>
  );
}
