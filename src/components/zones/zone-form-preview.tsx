"use client";

import maplibregl, {
  type Map as MapLibreMap,
  type StyleSpecification,
} from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { Map, PenTool } from "lucide-react";
import { Button } from "@/components/ui/button";

// CartoDB Dark Matter style
const DARK_STYLE: StyleSpecification = {
  version: 8 as const,
  sources: {
    carto: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "&copy; CartoDB &copy; OpenStreetMap",
    },
  },
  layers: [
    {
      id: "carto",
      type: "raster",
      source: "carto",
      minzoom: 0,
      maxzoom: 20,
    },
  ],
};

// Default center (Lima, Peru)
const DEFAULT_CENTER: [number, number] = [-77.0428, -12.0464];
const DEFAULT_ZOOM = 11;

interface ZoneFormPreviewProps {
  geometry?: string;
  color: string;
  onEdit: () => void;
}

export function ZoneFormPreview({
  geometry,
  color,
  onEdit,
}: ZoneFormPreviewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasGeometry, setHasGeometry] = useState(false);

  // Parse geometry
  const parsedGeometry = (() => {
    if (!geometry) return null;
    try {
      const parsed = JSON.parse(geometry);
      if (parsed.type === "Polygon" && Array.isArray(parsed.coordinates)) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  })();

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    try {
      let center = DEFAULT_CENTER;
      let zoom = DEFAULT_ZOOM;

      if (parsedGeometry?.coordinates?.[0]?.length) {
        const coords = parsedGeometry.coordinates[0];
        const lngs = coords.map((c: number[]) => c[0]);
        const lats = coords.map((c: number[]) => c[1]);
        center = [
          (Math.min(...lngs) + Math.max(...lngs)) / 2,
          (Math.min(...lats) + Math.max(...lats)) / 2,
        ];
        zoom = 12;
      }

      const mapInstance = new maplibregl.Map({
        container: mapContainer.current,
        style: DARK_STYLE,
        center,
        zoom,
        attributionControl: false,
        interactive: false, // Read-only preview
      });

      map.current = mapInstance;

      mapInstance.on("load", () => {
        setIsLoading(false);

        // Add zone layer if geometry exists
        if (parsedGeometry?.coordinates?.[0]) {
          setHasGeometry(true);

          mapInstance.addSource("zone", {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: parsedGeometry,
            },
          });

          mapInstance.addLayer({
            id: "zone-fill",
            type: "fill",
            source: "zone",
            paint: {
              "fill-color": color,
              "fill-opacity": 0.3,
            },
          });

          mapInstance.addLayer({
            id: "zone-outline",
            type: "line",
            source: "zone",
            paint: {
              "line-color": color,
              "line-width": 2,
            },
          });

          // Fit to bounds
          const bounds = new maplibregl.LngLatBounds();
          parsedGeometry.coordinates[0].forEach((coord: number[]) => {
            bounds.extend([coord[0], coord[1]]);
          });
          mapInstance.fitBounds(bounds, { padding: 40 });
        }
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

  // Update zone color
  useEffect(() => {
    if (!map.current || !hasGeometry) return;

    const mapInstance = map.current;
    if (mapInstance.getLayer("zone-fill")) {
      mapInstance.setPaintProperty("zone-fill", "fill-color", color);
    }
    if (mapInstance.getLayer("zone-outline")) {
      mapInstance.setPaintProperty("zone-outline", "line-color", color);
    }
  }, [color, hasGeometry]);

  return (
    <div className="relative h-full w-full rounded-lg overflow-hidden border bg-muted/30">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/80 z-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Cargando...</p>
          </div>
        </div>
      )}

      {!isLoading && !parsedGeometry && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-background/80 backdrop-blur-sm">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{ backgroundColor: `${color}20` }}
          >
            <Map className="w-8 h-8" style={{ color }} />
          </div>
          <p className="text-sm text-muted-foreground mb-4 text-center px-4">
            No hay área definida.
            <br />
            Dibuja el polígono en el mapa.
          </p>
          <Button onClick={onEdit} size="sm">
            <PenTool className="w-4 h-4 mr-2" />
            Dibujar Área
          </Button>
        </div>
      )}

      {!isLoading && parsedGeometry && (
        <div className="absolute bottom-3 left-3 right-3 z-10">
          <Button
            onClick={onEdit}
            variant="secondary"
            size="sm"
            className="w-full bg-background/90 backdrop-blur-sm hover:bg-background"
          >
            <PenTool className="w-4 h-4 mr-2" />
            Editar Área
          </Button>
        </div>
      )}

      <div ref={mapContainer} className="h-full w-full" />
    </div>
  );
}
