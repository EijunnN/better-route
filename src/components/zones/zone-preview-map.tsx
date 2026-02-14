"use client";

import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState, useCallback } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { Crosshair, Layers, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/layout/theme-context";
import {
  getMapStyle,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
} from "@/lib/map-styles";

interface Zone {
  id: string;
  name: string;
  color: string;
  geometry: string;
  parsedGeometry?: {
    type: "Polygon";
    coordinates: number[][][];
  } | null;
  active: boolean;
}

interface ZonePreviewMapProps {
  zones: Zone[];
  selectedZoneId: string | null;
  onZoneSelect: (zoneId: string | null) => void;
}

export function ZonePreviewMap({
  zones,
  selectedZoneId,
  onZoneSelect,
}: ZonePreviewMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const { isDark } = useTheme();
  const themeInitRef = useRef(false);
  const addZoneLayersRef = useRef((_m: MapLibreMap) => {});

  // Helper to add all zone sources and layers to the map
  const addZoneLayers = useCallback(
    (mapInstance: MapLibreMap) => {
      const bounds = new maplibregl.LngLatBounds();
      let hasValidZone = false;

      zones.forEach((zone) => {
        let geometry = zone.parsedGeometry;
        if (!geometry && zone.geometry) {
          try {
            geometry = JSON.parse(zone.geometry);
          } catch {
            return;
          }
        }
        if (!geometry?.coordinates?.[0]) return;

        const isSelected = zone.id === selectedZoneId;
        hasValidZone = true;

        geometry.coordinates[0].forEach((coord: number[]) => {
          bounds.extend([coord[0], coord[1]]);
        });

        mapInstance.addSource(`zone-${zone.id}`, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: { id: zone.id, name: zone.name },
            geometry: geometry,
          },
        });

        mapInstance.addLayer({
          id: `zone-fill-${zone.id}`,
          type: "fill",
          source: `zone-${zone.id}`,
          paint: {
            "fill-color": zone.color,
            "fill-opacity": isSelected ? 0.4 : zone.active ? 0.2 : 0.1,
          },
        });

        mapInstance.addLayer({
          id: `zone-outline-${zone.id}`,
          type: "line",
          source: `zone-${zone.id}`,
          paint: {
            "line-color": zone.color,
            "line-width": isSelected ? 3 : 1.5,
            "line-opacity": isSelected ? 1 : zone.active ? 0.8 : 0.4,
          },
        });

        mapInstance.on("click", `zone-fill-${zone.id}`, () => {
          onZoneSelect(zone.id);
        });

        mapInstance.on("mouseenter", `zone-fill-${zone.id}`, () => {
          mapInstance.getCanvas().style.cursor = "pointer";
        });

        mapInstance.on("mouseleave", `zone-fill-${zone.id}`, () => {
          mapInstance.getCanvas().style.cursor = "";
        });
      });

      if (hasValidZone && !bounds.isEmpty()) {
        mapInstance.fitBounds(bounds, { padding: 50, maxZoom: 14 });
      }
    },
    [zones, selectedZoneId, onZoneSelect],
  );
  addZoneLayersRef.current = addZoneLayers;

  // Initialize map
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

      map.current = mapInstance;

      mapInstance.on("load", () => {
        setIsLoading(false);
        setMapReady(true);
      });

      return () => {
        mapInstance.remove();
        map.current = null;
      };
    } catch (error) {
      console.error("Failed to initialize map:", error);
      setIsLoading(false);
    }
  }, []);

  // Add/update zone layers when zones or selection changes
  useEffect(() => {
    if (!map.current || !mapReady) return;

    const mapInstance = map.current;

    // Remove existing zone layers
    zones.forEach((zone) => {
      if (mapInstance.getLayer(`zone-fill-${zone.id}`)) {
        mapInstance.removeLayer(`zone-fill-${zone.id}`);
      }
      if (mapInstance.getLayer(`zone-outline-${zone.id}`)) {
        mapInstance.removeLayer(`zone-outline-${zone.id}`);
      }
      if (mapInstance.getSource(`zone-${zone.id}`)) {
        mapInstance.removeSource(`zone-${zone.id}`);
      }
    });

    addZoneLayers(mapInstance);
  }, [zones, selectedZoneId, mapReady, addZoneLayers]);

  // Handle runtime theme changes (skip first run - layers added in "load")
  // In MapLibre v5 diff mode, style.load fires synchronously during setStyle(),
  // so the listener MUST be registered BEFORE calling setStyle().
  useEffect(() => {
    if (!map.current) return;

    if (!themeInitRef.current) {
      themeInitRef.current = true;
      return;
    }

    const mapInstance = map.current;

    // Register BEFORE setStyle — style.load may fire synchronously in diff mode
    mapInstance.once("style.load", () => {
      addZoneLayersRef.current(mapInstance);
    });
    mapInstance.setStyle(getMapStyle(isDark));
  }, [isDark]);

  // Fly to selected zone
  useEffect(() => {
    if (!map.current || !mapReady || !selectedZoneId) return;

    const selectedZone = zones.find((z) => z.id === selectedZoneId);
    if (!selectedZone) return;

    let geometry = selectedZone.parsedGeometry;
    if (!geometry && selectedZone.geometry) {
      try {
        geometry = JSON.parse(selectedZone.geometry);
      } catch {
        return;
      }
    }

    if (!geometry?.coordinates?.[0]) return;

    const bounds = new maplibregl.LngLatBounds();
    geometry.coordinates[0].forEach((coord) => {
      bounds.extend([coord[0], coord[1]]);
    });

    map.current.fitBounds(bounds, { padding: 80, maxZoom: 14 });
  }, [selectedZoneId, zones, mapReady]);

  const handleZoomIn = () => {
    map.current?.zoomIn();
  };

  const handleZoomOut = () => {
    map.current?.zoomOut();
  };

  const handleFitAll = () => {
    if (!map.current || zones.length === 0) return;

    const bounds = new maplibregl.LngLatBounds();
    let hasValidZone = false;

    zones.forEach((zone) => {
      let geometry = zone.parsedGeometry;
      if (!geometry && zone.geometry) {
        try {
          geometry = JSON.parse(zone.geometry);
        } catch {
          return;
        }
      }

      if (!geometry?.coordinates?.[0]) return;
      hasValidZone = true;
      geometry.coordinates[0].forEach((coord) => {
        bounds.extend([coord[0], coord[1]]);
      });
    });

    if (hasValidZone && !bounds.isEmpty()) {
      map.current.fitBounds(bounds, { padding: 50, maxZoom: 14 });
    }
  };

  return (
    <div className="relative h-full w-full">
      {/* Controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-1">
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8 bg-background/90 backdrop-blur-sm hover:bg-background"
          onClick={handleZoomIn}
          aria-label="Acercar"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8 bg-background/90 backdrop-blur-sm hover:bg-background"
          onClick={handleZoomOut}
          aria-label="Alejar"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8 bg-background/90 backdrop-blur-sm hover:bg-background"
          onClick={handleFitAll}
          aria-label="Ver todas las zonas"
        >
          <Layers className="h-4 w-4" />
        </Button>
      </div>

      {/* Zone count badge */}
      <div className="absolute bottom-4 left-4 z-10">
        <div className="bg-background/90 backdrop-blur-sm px-3 py-1.5 rounded-md text-xs font-medium">
          {zones.filter((z) => z.active).length} zonas activas
        </div>
      </div>

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/80 z-20 rounded-lg">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Cargando mapa...</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && zones.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center text-muted-foreground">
            <Crosshair className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No hay zonas para mostrar</p>
          </div>
        </div>
      )}

      <div ref={mapContainer} className="h-full w-full rounded-lg" />
    </div>
  );
}
