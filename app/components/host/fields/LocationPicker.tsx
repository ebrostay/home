"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

// The map pin, draggable. Separate from ListingsMap rather than a flag on it:
// that component re-fits its bounds whenever its pins change, which is right
// for showing homes and exactly wrong here — every drag would yank the view
// back under the cursor.
//
// The marker reuses the `.map-marker` styling so the pin an owner places is
// visibly the same pin a guest later sees.
//
// 🔜 No geocoding. Typing an address does not move the pin, and moving the pin
// does not rewrite the address — spec-v2 §4.4 plans Nominatim for this and it
// is not built. Until it is, the two are set independently and the caption
// says so.

export function LocationPicker({
  lat,
  lng,
  onChange,
  label,
  caption,
}: {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
  label: string;
  caption: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null);
  // Read inside the drag handler, which is registered once — a ref keeps the
  // handler pointed at the current callback without re-creating the map.
  // Written in an effect, not during render: a ref is not render output, and
  // assigning one on the way past makes the value depend on how many times
  // React chose to render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Leaflet touches `window` as it loads, so it cannot be a module import
      // in a statically exported page.
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      // A listing with no pin yet opens over Zaragoza rather than at 0,0,
      // which is in the Gulf of Guinea.
      const start: [number, number] = lat === 0 && lng === 0 ? [41.6488, -0.8891] : [lat, lng];

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
        icon: L.divIcon({ className: "", html: `<div class="map-marker"></div>`, iconSize: [0, 0] }),
      }).addTo(mapRef.current);

      markerRef.current.on("dragend", () => {
        const p = markerRef.current.getLatLng();
        // Six decimals is ~0.1 m. Beyond that the digits are noise, and they
        // would make the dirty check fire on a pin nobody moved.
        onChangeRef.current(round(p.lat), round(p.lng));
      });

      // Clicking the map is the fast way to move the pin a long distance;
      // dragging is the slow way to move it a little. Both are worth having.
      mapRef.current.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        markerRef.current.setLatLng(e.latlng);
        onChangeRef.current(round(e.latlng.lat), round(e.latlng.lng));
      });
    })();

    return () => {
      cancelled = true;
    };
    // Mount once. `lat`/`lng` are the STARTING position — re-running on every
    // change would rebuild the map mid-drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        className="z-0 h-[11rem] rounded-(--radius-card) border border-line"
      />
      <p className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-(--radius-control) bg-surface/95 px-3 py-1.5 text-xs font-semibold text-ink shadow-(--shadow-card)">
        {caption}
      </p>
    </div>
  );
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;
