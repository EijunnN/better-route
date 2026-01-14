"use client";

import maplibregl, {
  type Map as MapLibreMap,
  type StyleSpecification,
} from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { Eraser, MousePointer2, PenTool, Trash2, Undo } from "lucide-react";
import { Button } from "@/components/ui/button";

// Using OpenStreetMap tiles (free, no API key required)
const DEFAULT_STYLE: StyleSpecification = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap Contributors",
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm",
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

// Default center (Lima, Peru)
const DEFAULT_CENTER: [number, number] = [-77.0428, -12.0464];
const DEFAULT_ZOOM = 11;

interface ZoneMapEditorProps {
  initialGeometry?: {
    type: "Polygon";
    coordinates: number[][][];
  } | null;
  zoneColor?: string;
  onSave: (geometry: string) => void;
  onCancel: () => void;
  height?: string;
  className?: string;
}

type DrawMode = "select" | "draw" | "delete";

export function ZoneMapEditor({
  initialGeometry,
  zoneColor = "#3B82F6",
  onSave,
  onCancel,
  height = "500px",
  className = "",
}: ZoneMapEditorProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [drawMode, setDrawMode] = useState<DrawMode>("select");
  const [points, setPoints] = useState<[number, number][]>([]);
  const [isPolygonClosed, setIsPolygonClosed] = useState(false);

  // Initialize points from initial geometry
  useEffect(() => {
    if (initialGeometry?.coordinates?.[0]) {
      // Remove the last point since it's the same as the first (closed polygon)
      const coords = initialGeometry.coordinates[0].slice(0, -1) as [
        number,
        number,
      ][];
      setPoints(coords);
      setIsPolygonClosed(coords.length >= 3);
    }
  }, [initialGeometry]);

  // Initialize map
  // biome-ignore lint/correctness/useExhaustiveDependencies: Map should only initialize once on mount
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Add polygon layers function
    const addPolygonLayers = (mapInstance: MapLibreMap) => {
      // Source for the polygon fill
      mapInstance.addSource("polygon", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Source for the polygon outline and vertices
      mapInstance.addSource("polygon-outline", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Source for vertices
      mapInstance.addSource("vertices", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Polygon fill layer
      mapInstance.addLayer({
        id: "polygon-fill",
        type: "fill",
        source: "polygon",
        paint: {
          "fill-color": zoneColor,
          "fill-opacity": 0.3,
        },
      });

      // Polygon outline layer
      mapInstance.addLayer({
        id: "polygon-outline",
        type: "line",
        source: "polygon-outline",
        paint: {
          "line-color": zoneColor,
          "line-width": 3,
        },
      });

      // Vertices layer
      mapInstance.addLayer({
        id: "vertices",
        type: "circle",
        source: "vertices",
        paint: {
          "circle-radius": 8,
          "circle-color": zoneColor,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
    };

    try {
      // Determine initial center
      let center = DEFAULT_CENTER;
      let zoom = DEFAULT_ZOOM;

      if (initialGeometry?.coordinates?.[0]?.length) {
        // Calculate center of existing polygon
        const coords = initialGeometry.coordinates[0];
        const lngs = coords.map((c) => c[0]);
        const lats = coords.map((c) => c[1]);
        center = [
          (Math.min(...lngs) + Math.max(...lngs)) / 2,
          (Math.min(...lats) + Math.max(...lats)) / 2,
        ];
        zoom = 13;
      }

      const mapInstance = new maplibregl.Map({
        container: mapContainer.current,
        style: DEFAULT_STYLE,
        center,
        zoom,
        attributionControl: false,
      });

      // Add attribution control manually
      mapInstance.addControl(
        new maplibregl.AttributionControl({
          compact: true,
        }),
        "bottom-right",
      );

      // Add navigation controls
      mapInstance.addControl(new maplibregl.NavigationControl(), "top-right");

      map.current = mapInstance;

      mapInstance.on("load", () => {
        setIsLoading(false);
        addPolygonLayers(mapInstance);

        // Fit to existing polygon if present
        if (initialGeometry?.coordinates?.[0]?.length) {
          const bounds = new maplibregl.LngLatBounds();
          initialGeometry.coordinates[0].forEach((coord) => {
            bounds.extend([coord[0], coord[1]]);
          });
          mapInstance.fitBounds(bounds, { padding: 50 });
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
    // Only run once on mount - initialGeometry and zoneColor are used for initial state only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update map layers when points change
  useEffect(() => {
    if (!map.current) return;

    const mapInstance = map.current;
    const polygonSource = mapInstance.getSource(
      "polygon",
    ) as maplibregl.GeoJSONSource;
    const outlineSource = mapInstance.getSource(
      "polygon-outline",
    ) as maplibregl.GeoJSONSource;
    const verticesSource = mapInstance.getSource(
      "vertices",
    ) as maplibregl.GeoJSONSource;

    if (!polygonSource || !outlineSource || !verticesSource) return;

    // Update vertices
    verticesSource.setData({
      type: "FeatureCollection",
      features: points.map((point, idx) => ({
        type: "Feature" as const,
        properties: { index: idx },
        geometry: {
          type: "Point" as const,
          coordinates: point,
        },
      })),
    });

    // Update outline (line connecting points)
    if (points.length >= 2) {
      const lineCoords = [...points];
      if (isPolygonClosed && points.length >= 3) {
        lineCoords.push(points[0]); // Close the loop
      }

      outlineSource.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: lineCoords,
            },
          },
        ],
      });
    } else {
      outlineSource.setData({
        type: "FeatureCollection",
        features: [],
      });
    }

    // Update polygon fill (only if closed and >= 3 points)
    if (isPolygonClosed && points.length >= 3) {
      const polygonCoords = [...points, points[0]]; // Close the polygon
      polygonSource.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [polygonCoords],
            },
          },
        ],
      });
    } else {
      polygonSource.setData({
        type: "FeatureCollection",
        features: [],
      });
    }
  }, [points, isPolygonClosed]);

  // Handle map clicks based on draw mode
  useEffect(() => {
    if (!map.current) return;

    const mapInstance = map.current;

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (drawMode === "draw" && !isPolygonClosed) {
        const newPoint: [number, number] = [e.lngLat.lng, e.lngLat.lat];

        // Check if clicking near the first point to close polygon
        if (points.length >= 3) {
          const firstPoint = points[0];
          const distance = Math.sqrt(
            (newPoint[0] - firstPoint[0]) ** 2 +
              (newPoint[1] - firstPoint[1]) ** 2,
          );

          // If close enough to first point, close the polygon
          if (distance < 0.001) {
            // Approximately 100m at equator
            setIsPolygonClosed(true);
            setDrawMode("select");
            return;
          }
        }

        setPoints((prev) => [...prev, newPoint]);
      } else if (drawMode === "delete") {
        // Check if clicking on a vertex
        const features = mapInstance.queryRenderedFeatures(e.point, {
          layers: ["vertices"],
        });

        if (features.length > 0) {
          const index = features[0].properties?.index;
          if (typeof index === "number") {
            setPoints((prev) => {
              const newPoints = [...prev];
              newPoints.splice(index, 1);
              // If we remove a point and have less than 3, unclose the polygon
              if (newPoints.length < 3) {
                setIsPolygonClosed(false);
              }
              return newPoints;
            });
          }
        }
      }
    };

    mapInstance.on("click", handleClick);

    // Update cursor based on mode
    if (drawMode === "draw") {
      mapInstance.getCanvas().style.cursor = "crosshair";
    } else if (drawMode === "delete") {
      mapInstance.getCanvas().style.cursor = "pointer";
    } else {
      mapInstance.getCanvas().style.cursor = "";
    }

    return () => {
      mapInstance.off("click", handleClick);
    };
  }, [drawMode, points, isPolygonClosed]);

  // Action handlers
  const handleUndo = () => {
    if (points.length > 0) {
      setPoints((prev) => prev.slice(0, -1));
      if (points.length <= 3) {
        setIsPolygonClosed(false);
      }
    }
  };

  const handleClear = () => {
    setPoints([]);
    setIsPolygonClosed(false);
    setDrawMode("draw");
  };

  const handleSave = () => {
    if (points.length < 3) {
      alert("La zona debe tener al menos 3 puntos");
      return;
    }

    // Create GeoJSON polygon (close the ring by adding first point at end)
    const geometry = {
      type: "Polygon" as const,
      coordinates: [[...points, points[0]]],
    };

    onSave(JSON.stringify(geometry));
  };

  return (
    <div className={`relative ${className}`}>
      {/* Toolbar */}
      <div className="absolute top-4 left-4 z-10 flex gap-2 bg-background/95 p-2 rounded-lg shadow-md">
        <Button
          variant={drawMode === "select" ? "default" : "outline"}
          size="sm"
          onClick={() => setDrawMode("select")}
          title="Seleccionar"
        >
          <MousePointer2 className="h-4 w-4" />
        </Button>
        <Button
          variant={drawMode === "draw" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setDrawMode("draw");
            if (isPolygonClosed) {
              setIsPolygonClosed(false);
            }
          }}
          title="Dibujar"
          disabled={isPolygonClosed}
        >
          <PenTool className="h-4 w-4" />
        </Button>
        <Button
          variant={drawMode === "delete" ? "default" : "outline"}
          size="sm"
          onClick={() => setDrawMode("delete")}
          title="Eliminar punto"
        >
          <Eraser className="h-4 w-4" />
        </Button>
        <div className="w-px bg-border" />
        <Button
          variant="outline"
          size="sm"
          onClick={handleUndo}
          disabled={points.length === 0}
          title="Deshacer"
        >
          <Undo className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleClear}
          disabled={points.length === 0}
          title="Limpiar todo"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Instructions */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-background/95 px-4 py-2 rounded-lg shadow-md text-sm">
        {drawMode === "draw" && !isPolygonClosed && (
          <span>
            Haz clic en el mapa para agregar puntos.
            {points.length >= 3 &&
              " Haz clic cerca del primer punto para cerrar."}
          </span>
        )}
        {drawMode === "delete" && (
          <span>Haz clic en un punto para eliminarlo.</span>
        )}
        {drawMode === "select" && (
          <span>
            {isPolygonClosed
              ? "Poligono cerrado. Usa las herramientas para editar."
              : "Selecciona una herramienta para empezar."}
          </span>
        )}
      </div>

      {/* Status */}
      <div className="absolute bottom-4 left-4 z-10 bg-background/95 px-3 py-2 rounded-lg shadow-md text-sm">
        <span className="font-medium">{points.length}</span> puntos
        {isPolygonClosed && (
          <span className="ml-2 text-green-600 font-medium">
            (Poligono cerrado)
          </span>
        )}
      </div>

      {/* Action Buttons */}
      <div className="absolute bottom-4 right-4 z-10 flex gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={points.length < 3}>
          Guardar Zona
        </Button>
      </div>

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
            <p className="text-sm text-muted-foreground">Cargando mapa...</p>
          </div>
        </div>
      )}

      <div
        ref={mapContainer}
        className="w-full rounded-lg overflow-hidden border"
        style={{ height }}
      />
    </div>
  );
}
