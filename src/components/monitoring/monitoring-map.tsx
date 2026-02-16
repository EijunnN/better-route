"use client";

import { Loader2 } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "@/components/layout/theme-context";
import { getMapStyle, DEFAULT_MAP_CENTER } from "@/lib/map-styles";

interface MonitoringMapProps {
  jobId: string | null;
  companyId: string;
  selectedDriverId: string | null;
  onDriverSelect?: (driverId: string) => void;
}

export interface MonitoringMapRef {
  flyTo: (lat: number, lng: number, zoom?: number) => void;
}

const REFRESH_INTERVAL = 15000; // 15 seconds

export const MonitoringMap = forwardRef<MonitoringMapRef, MonitoringMapProps>(function MonitoringMap({
  jobId: _jobId,
  companyId,
  selectedDriverId,
  onDriverSelect,
}, ref) {
  const { isDark } = useTheme();
  const isDarkRef = useRef(isDark);
  isDarkRef.current = isDark;
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshInterval = useRef<NodeJS.Timeout | null>(null);
  const mapThemeRef = useRef<boolean | null>(null);

  // Expose flyTo method to parent via ref
  useImperativeHandle(ref, () => ({
    flyTo: (lat: number, lng: number, zoom = 16) => {
      map.current?.flyTo({
        center: [lng, lat],
        zoom,
        duration: 1500,
      });
    },
  }), []);

  const loadMapData = useCallback(async (fitBounds = false) => {
    if (!map.current || !companyId || !map.current.isStyleLoaded()) return;

    try {
      const response = await fetch("/api/monitoring/geojson", {
        headers: { "x-company-id": companyId },
      });

      if (!response.ok) throw new Error("Failed to load map data");

      const geojson = await response.json();

      // Check again after async operation - map might have been unmounted
      if (!map.current) return;

      // Update existing source if it exists, otherwise create new
      const source = map.current.getSource("monitoring-data") as maplibregl.GeoJSONSource;

      if (source) {
        source.setData(geojson.data);
      } else {
        // First load - add source and layers
        if (geojson.data.features.length === 0) {
          return;
        }

        map.current.addSource("monitoring-data", {
          type: "geojson",
          data: geojson.data,
        });

        // Add route lines layer
        map.current.addLayer({
          id: "route-lines",
          type: "line",
          source: "monitoring-data",
          filter: ["==", ["get", "type"], "route"],
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": ["get", "color"],
            "line-width": 3,
            "line-opacity": 0.6,
          },
        });

        // Add stop points layer
        map.current.addLayer({
          id: "stop-points",
          type: "circle",
          source: "monitoring-data",
          filter: ["==", ["get", "type"], "stop"],
          paint: {
            "circle-radius": [
              "case",
              ["==", ["get", "status"], "COMPLETED"], 6,
              ["==", ["get", "status"], "FAILED"], 6,
              8
            ],
            "circle-color": [
              "case",
              ["==", ["get", "status"], "COMPLETED"], "#22c55e",
              ["==", ["get", "status"], "FAILED"], "#ef4444",
              ["get", "color"]
            ],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
            "circle-opacity": [
              "case",
              ["==", ["get", "status"], "COMPLETED"], 0.7,
              ["==", ["get", "status"], "FAILED"], 0.7,
              1
            ],
          },
        });

        // Add stop numbers layer
        map.current.addLayer({
          id: "stop-labels",
          type: "symbol",
          source: "monitoring-data",
          filter: ["==", ["get", "type"], "stop"],
          layout: {
            "text-field": ["get", "sequence"],
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            "text-size": 11,
            "text-anchor": "center",
          },
          paint: {
            "text-color": "#ffffff",
          },
        });

        // Add driver locations layer - larger and more visible
        map.current.addLayer({
          id: "driver-locations",
          type: "circle",
          source: "monitoring-data",
          filter: ["==", ["get", "type"], "driver_location"],
          paint: {
            "circle-radius": 12,
            "circle-color": [
              "case",
              ["==", ["get", "isRecent"], true], ["get", "color"],
              "#6b7280" // Gray for stale locations
            ],
            "circle-stroke-width": 3,
            "circle-stroke-color": "#ffffff",
          },
        });

        // Add driver location pulse animation (outer ring)
        map.current.addLayer({
          id: "driver-locations-pulse",
          type: "circle",
          source: "monitoring-data",
          filter: [
            "all",
            ["==", ["get", "type"], "driver_location"],
            ["==", ["get", "isRecent"], true],
          ],
          paint: {
            "circle-radius": 18,
            "circle-color": ["get", "color"],
            "circle-opacity": 0.3,
            "circle-stroke-width": 0,
          },
        });

        // Add driver icon/label
        map.current.addLayer({
          id: "driver-labels",
          type: "symbol",
          source: "monitoring-data",
          filter: ["==", ["get", "type"], "driver_location"],
          layout: {
            "text-field": "🚗",
            "text-size": 16,
            "text-anchor": "center",
          },
        });

        // Add click handlers
        map.current.on("click", "stop-points", (e) => {
          const features = map.current?.queryRenderedFeatures(e.point, {
            layers: ["stop-points"],
          });

          if (features && features.length > 0) {
            const props = features[0].properties as { driverId?: string } | null;
            if (props?.driverId) onDriverSelect?.(props.driverId);
          }
        });

        map.current.on("click", "driver-locations", (e) => {
          const features = map.current?.queryRenderedFeatures(e.point, {
            layers: ["driver-locations"],
          });

          if (features && features.length > 0) {
            const props = features[0].properties as { driverId?: string } | null;
            if (props?.driverId) onDriverSelect?.(props.driverId);
          }
        });

        // Change cursor on hover
        const setCursorPointer = () => {
          const canvas = map.current?.getCanvas();
          if (canvas) canvas.style.cursor = "pointer";
        };

        const setCursorDefault = () => {
          const canvas = map.current?.getCanvas();
          if (canvas) canvas.style.cursor = "";
        };

        map.current.on("mouseenter", "stop-points", setCursorPointer);
        map.current.on("mouseleave", "stop-points", setCursorDefault);
        map.current.on("mouseenter", "driver-locations", setCursorPointer);
        map.current.on("mouseleave", "driver-locations", setCursorDefault);
      }

      // Update selected driver highlight
      if (map.current.getLayer("route-lines-selected")) {
        map.current.removeLayer("route-lines-selected");
      }

      if (selectedDriverId) {
        map.current.addLayer({
          id: "route-lines-selected",
          type: "line",
          source: "monitoring-data",
          filter: [
            "all",
            ["==", ["get", "type"], "route"],
            ["==", ["get", "driverId"], selectedDriverId],
          ],
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": ["get", "color"],
            "line-width": 5,
            "line-opacity": 1,
          },
        });
      }

      // Fit bounds on first load
      if (fitBounds && geojson.data.features.length > 0) {
        const maplibreglModule = await import("maplibre-gl");
        const bounds = new maplibreglModule.LngLatBounds();

        geojson.data.features.forEach((feature: GeoJSON.Feature) => {
          if (feature.geometry.type === "Point") {
            bounds.extend(feature.geometry.coordinates as [number, number]);
          } else if (feature.geometry.type === "LineString") {
            (feature.geometry.coordinates as [number, number][]).forEach((coord) => {
              bounds.extend(coord);
            });
          }
        });

        // Check again after async import - map might have been unmounted
        if (!bounds.isEmpty() && map.current) {
          map.current.fitBounds(bounds, {
            padding: { top: 100, bottom: 50, left: 350, right: 50 },
            maxZoom: 15,
          });
        }
      }

      setError(null);
    } catch (err) {
      console.error("Failed to load map data:", err);
      setError("Error al cargar datos del mapa");
    }
  }, [companyId, selectedDriverId, onDriverSelect]);

  // Stable ref to always call latest loadMapData without triggering effect re-runs
  const loadMapDataRef = useRef(loadMapData);
  loadMapDataRef.current = loadMapData;

  // Initialize map - runs ONCE, not on every loadMapData change
  useEffect(() => {
    if (!mapContainer.current) return;

    const initMap = async () => {
      try {
        const maplibregl = await import("maplibre-gl");

        if (!mapContainer.current) return;

        mapThemeRef.current = isDarkRef.current;
        map.current = new maplibregl.Map({
          container: mapContainer.current,
          style: getMapStyle(isDarkRef.current),
          center: DEFAULT_MAP_CENTER,
          zoom: 12,
          attributionControl: false,
        });

        map.current.on("load", () => {
          setIsLoading(false);
          loadMapDataRef.current(true); // Fit bounds on first load
        });

        map.current.on("error", (e) => {
          console.error("Map error:", e);
          setError("Error al cargar el mapa");
          setIsLoading(false);
        });
      } catch (err) {
        console.error("Failed to initialize map:", err);
        setError("Error al inicializar el mapa");
        setIsLoading(false);
      }
    };

    initMap();

    return () => {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
      map.current?.remove();
      map.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh data
  useEffect(() => {
    if (!map.current || isLoading) return;

    refreshInterval.current = setInterval(() => {
      loadMapDataRef.current(false);
    }, REFRESH_INTERVAL);

    return () => {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
    };
  }, [isLoading]);

  // Update data when selectedDriverId changes
  useEffect(() => {
    if (map.current && !isLoading) {
      loadMapData(false);
    }
  }, [selectedDriverId, loadMapData, isLoading]);

  // React to theme changes
  useEffect(() => {
    if (!map.current || isLoading) return;
    if (mapThemeRef.current === isDark) return; // Already correct style
    mapThemeRef.current = isDark;
    map.current.once("style.load", () => {
      loadMapDataRef.current(false);
    });
    map.current.setStyle(getMapStyle(isDark));
  }, [isDark, isLoading]);

  return (
    <div className="h-full w-full relative">
      <div ref={mapContainer} className="w-full h-full" />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/90 z-10">
          <div className="text-center text-muted-foreground">
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Refresh indicator */}
      {!isLoading && !error && (
        <div className="absolute bottom-4 right-4 z-10">
          <div className="bg-background/80 backdrop-blur-sm rounded-full px-3 py-1 text-xs text-muted-foreground flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Auto-refresh: 15s
          </div>
        </div>
      )}
    </div>
  );
});
