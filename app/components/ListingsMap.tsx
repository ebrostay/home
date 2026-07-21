"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  label: string; // e.g. "950 €"
};

// Leaflet + OSM tiles (carried from v1, docs/spec/07 §7.5). Pins are styled
// divIcons (no image-asset plumbing) speaking the system language: green =
// listing. Client-only; Leaflet touches window at import-use time, so we
// import the library inside useEffect.
export function ListingsMap({
  pins,
  activeId,
  onPinClick,
  className = "",
}: {
  pins: MapPin[];
  activeId?: string | null;
  onPinClick?: (id: string) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, {
          scrollWheelZoom: false,
        }).setView([41.6488, -0.8891], 12); // Zaragoza
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(mapRef.current);
        layerRef.current = L.layerGroup().addTo(mapRef.current);
      }

      layerRef.current.clearLayers();
      const bounds: [number, number][] = [];
      for (const pin of pins) {
        const active = pin.id === activeId;
        const marker = L.marker([pin.lat, pin.lng], {
          icon: L.divIcon({
            className: "",
            html: `<div class="data" style="transform:translate(-50%,-100%);white-space:nowrap;background:${active ? "var(--ink)" : "var(--brand)"};color:#fff;padding:3px 8px;border-radius:999px;font-size:11px;box-shadow:var(--shadow-card)">${pin.label}</div>`,
            iconSize: [0, 0],
          }),
        });
        if (onPinClick) marker.on("click", () => onPinClick(pin.id));
        marker.addTo(layerRef.current);
        bounds.push([pin.lat, pin.lng]);
      }
      if (bounds.length > 0) {
        mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pins, activeId, onPinClick]);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    [],
  );

  return (
    <div
      ref={containerRef}
      className={`z-0 rounded-(--radius-card) border border-line ${className}`}
    />
  );
}
