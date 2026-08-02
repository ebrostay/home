"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import "leaflet/dist/leaflet.css";
import { decodePolyline } from "@/lib/nearby";
import { LEAFLET_PREFIX, OSM_ATTRIBUTION } from "@/lib/mapAttribution";

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
  /** Changes exactly when the pins on screen represent a different QUESTION —
   *  a new search, another group, another type filter — and the view should
   *  therefore be re-framed around them. It deliberately does NOT change when
   *  the same question merely redraws (a row hovered, a place added, a route
   *  fetched), because re-fitting then would yank the map out from under
   *  whatever the owner is doing. The caller owns the definition; the map only
   *  notices that it differs from the last one it fitted. */
  fitKey: string;
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
  fitKey,
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
  const homeRef = useRef<any>(null);
  const pinsRef = useRef<any>(null);
  const lineRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // The `fitKey` the view was last framed for. Anything else that redraws
  // pins leaves the view exactly where the owner put it.
  const fittedRef = useRef<string | null>(null);

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
      mapRef.current.attributionControl.setPrefix(LEAFLET_PREFIX);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: OSM_ATTRIBUTION,
      }).addTo(mapRef.current);

      // The home pin is added directly to the map, not into pinsRef, so it
      // survives pinsRef.clearLayers() on every candidate/chosen redraw. It
      // is kept in a ref because it DOES move: the pin can change under an
      // open finder — the owner accepts a geocoder suggestion, drags the pin
      // on the address map, or takes the Catastro's parcel centroid.
      homeRef.current = L.marker([home.lat, home.lng], {
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
    // Mount once, and mean it. `home` used to be listed here, which read as
    // "react to the pin moving" and did nothing of the kind: the effect's own
    // `mapRef.current` guard returns immediately on every re-run, so the pin
    // stayed where the map was built. Rebuilding the map is not the answer
    // either — it would tear the map out from under the owner. The pin moves
    // in its own effect below, the way LocationPicker has always done it.
    // `homeLabel` is omitted the same way `t` always has been: a translated
    // string does not change within one page life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The home pin follows the listing's pin. Both the marker and the view: a
  // marker that moves while the viewport stays put can leave the home off
  // screen entirely, and this map exists to show what is around the home.
  //
  // This is not the "re-fit on every prop change" trap the pins effect warns
  // about. That trap is about redraws — data arriving, a selection changing —
  // yanking the view while the owner works. A pin move is the owner's own
  // deliberate act on the address section, and the whole map is anchored to
  // it. Zoom is preserved, so it is a pan, not a reset.
  useEffect(() => {
    if (!homeRef.current || !mapRef.current) return;
    homeRef.current.setLatLng([home.lat, home.lng]);
    mapRef.current.setView([home.lat, home.lng], mapRef.current.getZoom());
  }, [home.lat, home.lng, mapReady]);

  // Redraw candidate and chosen pins whenever the lists or the active
  // selection change.
  //
  // Bounds are fit only when `fitKey` says the pins answer a different
  // question, never on every redraw. This is the trap LocationPicker's
  // comment warns about: a map that re-fits on every prop change yanks the
  // view out from under whatever the owner is doing right now — reading a
  // row, comparing a route. But NOT re-fitting when the question changes is
  // its own failure, and a worse one: the groups search different distances
  // (bus 800 m, tram 2.5 km, rail 3 km), so a view framed for bus stops has
  // the train stations off-screen entirely, and a view framed for stations
  // has every bus stop in one unreadable clump.
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

    // Candidates frame the view, falling back to what is already chosen when
    // a search has nothing left to offer (every result added already). Chosen
    // pins are deliberately NOT mixed into the candidate bounds: they are not
    // filtered by type, so one saved tram stop 2 km out would stretch the
    // frame of a bus-stop search back to uselessness — which is the very
    // thing this fit exists to fix.
    const frame = candidates.length > 0 ? candidates : chosen;

    if (fitKey !== "" && frame.length > 0 && fitKey !== fittedRef.current) {
      fittedRef.current = fitKey;
      const bounds: [number, number][] = [
        [home.lat, home.lng],
        ...frame.map((c): [number, number] => [c.lat, c.lng]),
      ];
      // maxZoom is what makes a tight cluster readable rather than absurd:
      // three bus stops on one street would otherwise fill the viewport at
      // building level.
      mapRef.current?.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
    // `home` intentionally absent: it anchors a fit, it is not a reason to
    // re-fit whenever the pin arrays are merely redrawn. Its own effect above
    // handles the pin moving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, chosen, activeId, mapReady, fitKey]);

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
      homeRef.current = null;
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
