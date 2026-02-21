"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";
import { getMapStyle } from "@/lib/map-styles";

interface TrackingMapProps {
  deliveryLat: number;
  deliveryLng: number;
  driverLocation?: {
    latitude: number;
    longitude: number;
    heading?: number;
  } | null;
  showDriverLocation: boolean;
  brandColor?: string | null;
}

export function TrackingMap({
  deliveryLat,
  deliveryLng,
  driverLocation,
  showDriverLocation,
  brandColor,
}: TrackingMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const deliveryMarker = useRef<maplibregl.Marker | null>(null);
  const driverMarker = useRef<maplibregl.Marker | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const accentColor = brandColor || "#3b82f6";

  // Detect dark mode from document class
  const isDark = typeof document !== "undefined"
    ? document.documentElement.classList.contains("dark")
    : false;

  const initMap = useCallback(async () => {
    if (!mapContainer.current) return;

    try {
      const maplibregl = await import("maplibre-gl");

      if (!mapContainer.current) return;

      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: getMapStyle(isDark),
        center: [deliveryLng, deliveryLat],
        zoom: 14,
        attributionControl: false,
      });

      map.current.on("load", () => {
        if (!map.current) return;
        setIsLoading(false);

        // Delivery destination marker
        const deliveryEl = document.createElement("div");
        deliveryEl.innerHTML = `<svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0C7.163 0 0 7.163 0 16c0 12 16 24 16 24s16-12 16-24C32 7.163 24.837 0 16 0z" fill="${accentColor}"/>
          <circle cx="16" cy="16" r="6" fill="white"/>
        </svg>`;
        deliveryEl.style.cursor = "pointer";

        deliveryMarker.current = new maplibregl.Marker({ element: deliveryEl })
          .setLngLat([deliveryLng, deliveryLat])
          .addTo(map.current);

        // Fit bounds if driver is visible
        if (showDriverLocation && driverLocation) {
          const bounds = new maplibregl.LngLatBounds();
          bounds.extend([deliveryLng, deliveryLat]);
          bounds.extend([driverLocation.longitude, driverLocation.latitude]);
          map.current.fitBounds(bounds, { padding: 60, maxZoom: 15 });
        }
      });
    } catch (err) {
      console.error("Failed to initialize tracking map:", err);
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize map once
  useEffect(() => {
    initMap();

    return () => {
      deliveryMarker.current?.remove();
      driverMarker.current?.remove();
      map.current?.remove();
      map.current = null;
    };
  }, [initMap]);

  // Update driver marker position
  useEffect(() => {
    if (!map.current || !showDriverLocation || !driverLocation) {
      driverMarker.current?.remove();
      driverMarker.current = null;
      return;
    }

    const updateDriverMarker = async () => {
      const maplibregl = await import("maplibre-gl");

      if (!map.current) return;

      if (!driverMarker.current) {
        const driverEl = document.createElement("div");
        driverEl.innerHTML = `<div style="
          width: 24px; height: 24px;
          background: ${accentColor};
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          position: relative;
        "><div style="
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: ${accentColor};
          opacity: 0.3;
          animation: pulse 2s infinite;
        "></div></div>`;

        driverMarker.current = new maplibregl.Marker({ element: driverEl })
          .setLngLat([driverLocation.longitude, driverLocation.latitude])
          .addTo(map.current);
      } else {
        driverMarker.current.setLngLat([driverLocation.longitude, driverLocation.latitude]);
      }
    };

    updateDriverMarker();
  }, [driverLocation, showDriverLocation, accentColor]);

  return (
    <div className="relative w-full h-48 sm:h-64 rounded-lg overflow-hidden border">
      <div ref={mapContainer} className="w-full h-full" />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(2); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
