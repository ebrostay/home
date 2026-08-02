"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { LEAFLET_PREFIX, OSM_ATTRIBUTION } from "@/lib/mapAttribution";

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  label: string; // accessible name for the marker, e.g. the home's name
};

// Leaflet + OSM tiles (carried from v1, docs/spec/08-carried-v1-rules.md §8.4.2). Pins are styled
// divIcons (no image-asset plumbing) speaking the system language: green =
// listing. Client-only; Leaflet touches window at import-use time, so we
// import the library inside useEffect.
//
// This is the single-listing map (the detail page). The results map, where
// pins must be told apart and carry their price, is components/search/ResultsMap.
export function ListingsMap({
  pins,
  onPinClick,
  className = "",
}: {
  pins: MapPin[];
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
        mapRef.current.attributionControl.setPrefix(LEAFLET_PREFIX);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: OSM_ATTRIBUTION,
        }).addTo(mapRef.current);
        layerRef.current = L.layerGroup().addTo(mapRef.current);
      }

      layerRef.current.clearLayers();
      const bounds: [number, number][] = [];
      for (const pin of pins) {
        const marker = L.marker([pin.lat, pin.lng], {
          title: pin.label,
          alt: pin.label,
          icon: L.divIcon({
            className: "",
            html: `<div class="map-marker"></div>`,
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
  }, [pins, onPinClick]);

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
