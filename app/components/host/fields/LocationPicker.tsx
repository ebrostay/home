"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

// The map pin, draggable, with the geocoder's opinion shown beside it.
//
// Separate from ListingsMap rather than a flag on it: that component re-fits
// its bounds whenever its pins change, which is right for showing homes and
// exactly wrong here — every drag would yank the view back under the cursor.
// This one fits bounds in one situation only, described below.
//
// The two-pin comparison exists to protect a hand-placed pin. Geocoding gets
// you street level; dragging is how an owner puts the pin on the actual
// doorway. The common edit afterwards is fixing a door or floor — detail OSM
// has never heard of — so re-geocoding returns the same coarse street point
// and would throw away their precision for nothing. Showing both and asking
// costs one click and makes the trade visible.

export type Suggestion = { lat: number; lng: number } | null;

export function LocationPicker({
  lat,
  lng,
  onChange,
  onDragged,
  suggestion,
  label,
  caption,
  mark,
  suggestedLabel,
}: {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
  /** Fired when the owner moves the pin themselves, so the page knows this
   *  position is hand-placed and must not be overwritten silently. */
  onDragged: () => void;
  /** Where the geocoder says the address is. The caller decides whether to
   *  pass one — it suppresses the suggestion when it agrees with the pin. */
  suggestion: Suggestion;
  label: string;
  caption: string;
  /** A glyph annotating the pin — see `TextField`'s prop of the same name. The
   *  map has no label of its own on screen, so it rides in the caption pill,
   *  which is the only thing here that names what the map is showing. */
  mark?: React.ReactNode;
  /** Accessible name for the suggested pin, so the two are distinguishable
   *  to anything reading the map rather than looking at it. */
  suggestedLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  /* eslint-disable @typescript-eslint/no-explicit-any -- Leaflet is loaded at
     runtime and has no types available at this import site. */
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const ghostRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Read inside handlers that are registered once. Written in effects, not
  // during render: a ref is not render output, and assigning one on the way
  // past makes the value depend on how many times React chose to render.
  const onChangeRef = useRef(onChange);
  const onDraggedRef = useRef(onDragged);
  useEffect(() => {
    onChangeRef.current = onChange;
    onDraggedRef.current = onDragged;
  }, [onChange, onDragged]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Leaflet touches `window` as it loads, so it cannot be a module import
      // in a statically exported page.
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;

      // A listing with no pin yet opens over Zaragoza rather than at 0,0,
      // which is in the Gulf of Guinea.
      const start: [number, number] =
        lat === 0 && lng === 0 ? [41.6488, -0.8891] : [lat, lng];

      mapRef.current = L.map(containerRef.current, { scrollWheelZoom: false }).setView(
        start,
        16,
      );
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapRef.current);

      markerRef.current = L.marker(start, {
        draggable: true,
        keyboard: true,
        title: label,
        alt: label,
        icon: L.divIcon({
          className: "",
          html: `<div class="map-marker"></div>`,
          iconSize: [0, 0],
        }),
      }).addTo(mapRef.current);

      markerRef.current.on("dragend", () => {
        const p = markerRef.current.getLatLng();
        // Six decimals is ~0.1 m. Beyond that the digits are noise, and they
        // would make the dirty check fire on a pin nobody moved.
        onChangeRef.current(round(p.lat), round(p.lng));
        onDraggedRef.current();
      });

      // Clicking the map is the fast way to move the pin a long distance;
      // dragging is the slow way to move it a little. Both are worth having,
      // and both are the owner speaking rather than the geocoder.
      mapRef.current.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        markerRef.current.setLatLng(e.latlng);
        onChangeRef.current(round(e.latlng.lat), round(e.latlng.lng));
        onDraggedRef.current();
      });
    })();

    return () => {
      cancelled = true;
    };
    // Mount once. `lat`/`lng` are the STARTING position — re-running on every
    // change would rebuild the map mid-drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the value when it changes from outside — accepting a suggestion, or
  // discarding the whole form. Guarded, or the marker's own dragend would
  // bounce the pin back through this effect.
  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    const at = marker.getLatLng();
    if (round(at.lat) === lat && round(at.lng) === lng) return;
    marker.setLatLng([lat, lng]);
    mapRef.current?.panTo([lat, lng]);
  }, [lat, lng]);

  // The suggested pin. Added and removed as one, and the ONLY place this map
  // fits bounds: a suggestion 400 m away is off-screen otherwise, and the
  // button to accept it would look arbitrary.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    if (!suggestion) {
      if (ghostRef.current) {
        map.removeLayer(ghostRef.current);
        ghostRef.current = null;
      }
      return;
    }

    const at: [number, number] = [suggestion.lat, suggestion.lng];
    if (ghostRef.current) {
      ghostRef.current.setLatLng(at);
    } else {
      ghostRef.current = L.marker(at, {
        title: suggestedLabel,
        alt: suggestedLabel,
        // Not draggable: it is a proposal, and something you can move is
        // something you own. Refining it is what the real pin is for.
        icon: L.divIcon({
          className: "",
          html: `<div class="map-marker map-marker-suggested"></div>`,
          iconSize: [0, 0],
        }),
      }).addTo(map);
    }

    map.fitBounds([[lat, lng], at], { padding: [48, 48], maxZoom: 17 });
    // `lat`/`lng` intentionally absent: this fits when a suggestion ARRIVES,
    // not every time the owner nudges the pin while one is on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion, suggestedLabel]);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    [],
  );

  return (
    // `isolate` is load-bearing. The caption has to outrank Leaflet's own
    // panes, which climb to z-700, and without a stacking context of its own
    // that z-index competes with the whole page — the caption floats over the
    // sticky context bar the moment you scroll past it.
    <div className="relative isolate">
      <div
        ref={containerRef}
        role="application"
        aria-label={label}
        className="z-0 h-[13rem] rounded-(--radius-card) border border-line"
      />
      <p className="pointer-events-none absolute bottom-3 left-3 z-[400] flex items-center gap-1.5 rounded-(--radius-control) bg-surface/95 px-3 py-1.5 text-xs font-semibold text-ink shadow-(--shadow-card)">
        {caption}
        {mark}
      </p>
    </div>
  );
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;
