"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Loader2 } from "lucide-react";
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
  estimatedArrival?: string | null;
  status: string;
}

export function TrackingMap({
  deliveryLat,
  deliveryLng,
  driverLocation,
  showDriverLocation,
  brandColor,
  estimatedArrival,
  status,
}: TrackingMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const deliveryMarker = useRef<maplibregl.Marker | null>(null);
  const driverMarker = useRef<maplibregl.Marker | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const accent = brandColor || "#4AB855";

  const isDark =
    typeof document !== "undefined"
      ? document.documentElement.classList.contains("dark")
      : false;

  // Initialize map ONCE per (lat,lng,theme,accent). Putting the
  // initializer in deps caused a remount loop because the function
  // identity changed every render.
  useEffect(() => {
    if (!mapContainer.current) return;
    let cancelled = false;

    (async () => {
      try {
        const maplibregl = await import("maplibre-gl");
        if (cancelled || !mapContainer.current) return;

        const instance = new maplibregl.Map({
          container: mapContainer.current,
          style: getMapStyle(isDark),
          center: [deliveryLng, deliveryLat],
          zoom: 14,
          attributionControl: false,
        });
        map.current = instance;

        instance.on("load", () => {
          if (cancelled) return;
          setIsLoading(false);

          const deliveryEl = document.createElement("div");
          deliveryEl.innerHTML = `
            <div style="position: relative;">
              <div style="
                position: absolute; inset: -10px;
                border-radius: 50%;
                background: ${accent};
                opacity: 0.25;
                filter: blur(8px);
              "></div>
              <div style="
                position: relative;
                width: 36px; height: 36px;
                background: ${accent};
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                box-shadow: 0 4px 12px ${accent}66;
              ">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m7.5 4.27 9 5.15"/>
                  <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
                  <path d="m3.3 7 8.7 5 8.7-5"/>
                  <path d="M12 22V12"/>
                </svg>
              </div>
            </div>`;

          deliveryMarker.current = new maplibregl.Marker({
            element: deliveryEl,
          })
            .setLngLat([deliveryLng, deliveryLat])
            .addTo(instance);
        });
      } catch (err) {
        console.error("Failed to initialize tracking map:", err);
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      deliveryMarker.current?.remove();
      driverMarker.current?.remove();
      map.current?.remove();
      map.current = null;
      deliveryMarker.current = null;
      driverMarker.current = null;
    };
  }, [deliveryLat, deliveryLng, isDark, accent]);

  // Driver marker — created/updated separately so brand-color or
  // theme changes don't tear down the live position.
  useEffect(() => {
    if (!map.current || !showDriverLocation || !driverLocation) {
      driverMarker.current?.remove();
      driverMarker.current = null;
      return;
    }

    let cancelled = false;
    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !map.current) return;

      if (!driverMarker.current) {
        const driverEl = document.createElement("div");
        driverEl.innerHTML = `
          <div style="position: relative;">
            <div style="
              position: absolute; inset: -8px;
              border-radius: 50%;
              background: #3B82F6;
              opacity: 0.4;
              animation: pulse-driver 2s infinite;
            "></div>
            <div style="
              position: relative;
              width: 28px; height: 28px;
              background: #3B82F6;
              border: 3px solid white;
              border-radius: 50%;
              box-shadow: 0 4px 12px rgba(59,130,246,0.55);
            "></div>
          </div>`;
        driverMarker.current = new maplibregl.Marker({ element: driverEl })
          .setLngLat([driverLocation.longitude, driverLocation.latitude])
          .addTo(map.current);

        // First time we see the driver, fit both points in view so
        // the customer doesn't have to pan to find them.
        const bounds = new maplibregl.LngLatBounds();
        bounds.extend([deliveryLng, deliveryLat]);
        bounds.extend([driverLocation.longitude, driverLocation.latitude]);
        map.current.fitBounds(bounds, { padding: 80, maxZoom: 15 });
      } else {
        driverMarker.current.setLngLat([
          driverLocation.longitude,
          driverLocation.latitude,
        ]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [driverLocation, showDriverLocation, deliveryLat, deliveryLng]);

  return (
    <div className="relative h-72 w-full overflow-hidden rounded-2xl border border-border/60 sm:h-96">
      <div ref={mapContainer} className="h-full w-full" />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Floating ETA card — only relevant while the order is moving. */}
      {!isLoading &&
        estimatedArrival &&
        (status === "IN_PROGRESS" || status === "ASSIGNED") && (
          <div className="absolute left-4 top-4 max-w-[60%] rounded-xl border border-border/60 bg-card/95 px-4 py-3 shadow-lg backdrop-blur-md">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Entrega estimada
            </p>
            <div className="mt-1 flex items-center gap-2">
              <Clock className="h-4 w-4" style={{ color: accent }} />
              <span className="text-lg font-semibold tabular-nums">
                {formatEta(estimatedArrival)}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {formatEtaDay(estimatedArrival)}
            </p>
          </div>
        )}

      <style>{`
        @keyframes pulse-driver {
          0% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(2); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function formatEta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("es-PE", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatEtaDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `Hoy, ${d.toLocaleDateString("es-PE", {
      day: "numeric",
      month: "long",
    })}`;
  }
  return d.toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
