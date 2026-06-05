"use client";

import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "@/components/layout/theme-context";
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  getMapStyle,
} from "@/lib/map-styles";
import type { GeoPoint } from "@/lib/playground/fake-data";

const MARKERS_SOURCE = "playground-origins";
const MARKERS_LAYER = "playground-origins-layer";
const MARKER_COLOR = "#2563eb"; // blue-600 — opaque, sits above the tinted raster

export interface PlaygroundMapProps {
  /** Vehicle origins to render as markers. */
  origins: GeoPoint[];
  /** Whether clicking the map should append an origin (manual mode). */
  clickToPlace: boolean;
  /** Called with the clicked coordinate when `clickToPlace` is on. */
  onPlace: (point: GeoPoint) => void;
  /** Reports the live map center so the parent can scatter around it. */
  onCenterChange?: (center: GeoPoint) => void;
  className?: string;
  height?: string;
}

function originsToGeoJSON(
  origins: GeoPoint[],
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: origins.map((o, index) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [o.lng, o.lat] },
      properties: { index },
    })),
  };
}

export function PlaygroundMap({
  origins,
  clickToPlace,
  onPlace,
  onCenterChange,
  className = "",
  height = "480px",
}: PlaygroundMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const { isDark } = useTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [isMapReady, setIsMapReady] = useState(false);

  const themeInitRef = useRef(false);

  // Latest handler/flag values read inside long-lived map listeners, kept in
  // refs so the listeners stay registered once (no re-subscribe per render).
  const clickToPlaceRef = useRef(clickToPlace);
  clickToPlaceRef.current = clickToPlace;
  const onPlaceRef = useRef(onPlace);
  onPlaceRef.current = onPlace;
  const onCenterChangeRef = useRef(onCenterChange);
  onCenterChangeRef.current = onCenterChange;

  // Adds the origin source + circle layer. Re-run after every style load
  // (initial + theme switch) because setStyle wipes custom layers.
  const addMarkerLayer = useCallback((mapInstance: MapLibreMap) => {
    if (!mapInstance.getSource(MARKERS_SOURCE)) {
      mapInstance.addSource(MARKERS_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }
    if (!mapInstance.getLayer(MARKERS_LAYER)) {
      mapInstance.addLayer({
        id: MARKERS_LAYER,
        type: "circle",
        source: MARKERS_SOURCE,
        paint: {
          "circle-radius": 6,
          "circle-color": MARKER_COLOR,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
    }
  }, []);

  // Init-once MapLibre setup. Re-running on prop changes would tear down the
  // canvas; theme + data changes are handled by the effects below.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only init effect; listed deps would recreate the map and tear down the canvas
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    try {
      const mapInstance = new maplibregl.Map({
        container: mapContainer.current,
        style: getMapStyle(isDark),
        center: DEFAULT_MAP_CENTER,
        zoom: DEFAULT_MAP_ZOOM,
        attributionControl: false,
      });

      mapInstance.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        "bottom-right",
      );
      mapInstance.addControl(new maplibregl.NavigationControl(), "top-right");

      map.current = mapInstance;

      const reportCenter = () => {
        const c = mapInstance.getCenter();
        onCenterChangeRef.current?.({ lat: c.lat, lng: c.lng });
      };

      mapInstance.on("load", () => {
        setIsLoading(false);
        addMarkerLayer(mapInstance);
        setIsMapReady(true);
        reportCenter();
      });

      mapInstance.on("moveend", reportCenter);

      mapInstance.on("click", (e) => {
        if (!clickToPlaceRef.current) return;
        onPlaceRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      });

      return () => {
        mapInstance.remove();
        map.current = null;
        setIsMapReady(false);
      };
    } catch (error) {
      console.error("Failed to initialize playground map:", error);
      setIsLoading(false);
    }
  }, []);

  // React to theme changes at runtime (skip first run — layer added on load).
  // In MapLibre v5 diff mode style.load fires synchronously during setStyle(),
  // so the listener must be registered before calling setStyle().
  useEffect(() => {
    if (!map.current) return;

    if (!themeInitRef.current) {
      themeInitRef.current = true;
      return;
    }

    const mapInstance = map.current;
    setIsMapReady(false);

    mapInstance.once("style.load", () => {
      addMarkerLayer(mapInstance);
      setIsMapReady(true);
    });
    mapInstance.setStyle(getMapStyle(isDark), { diff: false });
  }, [isDark, addMarkerLayer]);

  // Push origin data into the source whenever it changes.
  useEffect(() => {
    if (!map.current || !isMapReady) return;
    const source = map.current.getSource(MARKERS_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    source?.setData(originsToGeoJSON(origins));
  }, [origins, isMapReady]);

  // Cursor hint for manual placement mode.
  useEffect(() => {
    if (!map.current) return;
    map.current.getCanvas().style.cursor = clickToPlace ? "crosshair" : "";
  }, [clickToPlace]);

  return (
    <div className={`relative ${className}`} style={{ height }}>
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-card/60">
          <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        </div>
      )}
      <div
        ref={mapContainer}
        className="size-full overflow-hidden rounded-lg border border-border"
      />
    </div>
  );
}
