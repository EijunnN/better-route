"use client";

import maplibregl, {
  type Map as MapLibreMap,
  type StyleSpecification,
} from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Eraser,
  MousePointer2,
  Pencil,
  PenTool,
  Trash2,
  Undo,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// CartoDB Dark Matter style for consistency
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

type DrawMode = "select" | "draw" | "freehand" | "delete";

// Check if two line segments intersect and return intersection point
function lineIntersection(
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  p4: [number, number],
): [number, number] | null {
  const d =
    (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-10) return null;

  const t =
    ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u =
    -((p2[0] - p1[0]) * (p3[1] - p1[1]) - (p2[1] - p1[1]) * (p3[0] - p1[0])) /
    d;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
  }
  return null;
}

// Find if the path crosses itself and return the closed polygon (Snake.io style)
function findClosedPolygon(
  path: [number, number][],
): [number, number][] | null {
  if (path.length < 4) return null;

  // Check if the newest segment crosses any previous segment (except adjacent ones)
  const lastIdx = path.length - 1;
  const newSegmentStart = path[lastIdx - 1];
  const newSegmentEnd = path[lastIdx];

  // Check against all segments except the last two (to avoid false positives with adjacent segments)
  for (let i = 0; i < lastIdx - 2; i++) {
    const intersection = lineIntersection(
      path[i],
      path[i + 1],
      newSegmentStart,
      newSegmentEnd,
    );

    if (intersection) {
      // Found intersection! Extract the closed polygon
      // The polygon is from index i+1 to lastIdx-1, plus the intersection point
      const polygon: [number, number][] = [intersection];
      for (let j = i + 1; j < lastIdx; j++) {
        polygon.push(path[j]);
      }
      return polygon;
    }
  }

  return null;
}

// Simplify path by removing points that are too close together
function simplifyPath(
  points: [number, number][],
  tolerance: number,
): [number, number][] {
  if (points.length < 3) return points;

  const result: [number, number][] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const lastPoint = result[result.length - 1];
    const currentPoint = points[i];
    const distance = Math.sqrt(
      (currentPoint[0] - lastPoint[0]) ** 2 +
        (currentPoint[1] - lastPoint[1]) ** 2,
    );

    if (distance > tolerance) {
      result.push(currentPoint);
    }
  }

  return result;
}

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
  const [drawMode, setDrawMode] = useState<DrawMode>("draw");
  const [points, setPoints] = useState<[number, number][]>([]);
  const [isPolygonClosed, setIsPolygonClosed] = useState(false);
  const [mousePosition, setMousePosition] = useState<[number, number] | null>(
    null,
  );
  const [isDrawingFreehand, setIsDrawingFreehand] = useState(false);
  const [freehandPath, setFreehandPath] = useState<[number, number][]>([]);

  // Initialize points from initial geometry
  useEffect(() => {
    if (initialGeometry?.coordinates?.[0]) {
      const coords = initialGeometry.coordinates[0].slice(0, -1) as [
        number,
        number,
      ][];
      setPoints(coords);
      setIsPolygonClosed(coords.length >= 3);
      setDrawMode("select");
    }
  }, [initialGeometry]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const addLayers = (mapInstance: MapLibreMap) => {
      // Polygon fill
      mapInstance.addSource("polygon", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Polygon outline
      mapInstance.addSource("polygon-outline", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Vertices
      mapInstance.addSource("vertices", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Preview line (from last point to cursor) - for point mode
      mapInstance.addSource("preview-line", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Freehand drawing path (shown while drawing)
      mapInstance.addSource("freehand-path", {
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

      // Freehand path layer (shown while drawing)
      mapInstance.addLayer({
        id: "freehand-path",
        type: "line",
        source: "freehand-path",
        paint: {
          "line-color": "#f59e0b", // Orange while drawing
          "line-width": 3,
          "line-opacity": 0.9,
        },
      });

      // Preview line layer (dashed) - for point mode
      mapInstance.addLayer({
        id: "preview-line",
        type: "line",
        source: "preview-line",
        paint: {
          "line-color": zoneColor,
          "line-width": 2,
          "line-dasharray": [3, 3],
          "line-opacity": 0.7,
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

      // First vertex highlight (larger, different color to show where to close)
      mapInstance.addLayer({
        id: "first-vertex",
        type: "circle",
        source: "vertices",
        filter: ["==", ["get", "index"], 0],
        paint: {
          "circle-radius": 12,
          "circle-color": "#22c55e",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.8,
        },
      });
    };

    try {
      let center = DEFAULT_CENTER;
      let zoom = DEFAULT_ZOOM;

      if (initialGeometry?.coordinates?.[0]?.length) {
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
        style: DARK_STYLE,
        center,
        zoom,
        attributionControl: false,
      });

      mapInstance.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        "bottom-right",
      );
      mapInstance.addControl(new maplibregl.NavigationControl(), "top-right");

      map.current = mapInstance;

      mapInstance.on("load", () => {
        setIsLoading(false);
        addLayers(mapInstance);

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
  }, []);

  // Update polygon layers when points change
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
        geometry: { type: "Point" as const, coordinates: point },
      })),
    });

    // Update outline
    if (points.length >= 2) {
      const lineCoords = [...points];
      if (isPolygonClosed && points.length >= 3) {
        lineCoords.push(points[0]);
      }

      outlineSource.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: lineCoords },
          },
        ],
      });
    } else {
      outlineSource.setData({ type: "FeatureCollection", features: [] });
    }

    // Update polygon fill
    if (isPolygonClosed && points.length >= 3) {
      polygonSource.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [[...points, points[0]]],
            },
          },
        ],
      });
    } else {
      polygonSource.setData({ type: "FeatureCollection", features: [] });
    }
  }, [points, isPolygonClosed]);

  // Update freehand path visualization while drawing
  useEffect(() => {
    if (!map.current) return;

    const freehandSource = map.current.getSource(
      "freehand-path",
    ) as maplibregl.GeoJSONSource;
    if (!freehandSource) return;

    if (isDrawingFreehand && freehandPath.length >= 2) {
      freehandSource.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: freehandPath },
          },
        ],
      });
    } else {
      freehandSource.setData({ type: "FeatureCollection", features: [] });
    }
  }, [freehandPath, isDrawingFreehand]);

  // Update preview line (from last point to cursor) - only for point mode
  useEffect(() => {
    if (!map.current) return;

    const previewSource = map.current.getSource(
      "preview-line",
    ) as maplibregl.GeoJSONSource;
    if (!previewSource) return;

    // Show preview line only in draw mode (not freehand), with points, not closed
    if (
      drawMode === "draw" &&
      points.length > 0 &&
      !isPolygonClosed &&
      mousePosition
    ) {
      const lastPoint = points[points.length - 1];

      const features: GeoJSON.Feature[] = [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [lastPoint, mousePosition],
          },
        },
      ];

      // If we have 3+ points, also show line to first point (to visualize closing)
      if (points.length >= 3) {
        features.push({
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [mousePosition, points[0]],
          },
        });
      }

      previewSource.setData({
        type: "FeatureCollection",
        features,
      });
    } else {
      previewSource.setData({ type: "FeatureCollection", features: [] });
    }
  }, [mousePosition, points, drawMode, isPolygonClosed]);

  // Handle mouse move
  useEffect(() => {
    if (!map.current) return;
    const mapInstance = map.current;

    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      setMousePosition([e.lngLat.lng, e.lngLat.lat]);

      // If freehand drawing is active, add points and check for self-intersection
      if (isDrawingFreehand && drawMode === "freehand") {
        const newPoint: [number, number] = [e.lngLat.lng, e.lngLat.lat];

        setFreehandPath((prev) => {
          const newPath = [...prev, newPoint];

          // Check if the path crossed itself (Snake.io style!)
          const closedPolygon = findClosedPolygon(newPath);
          if (closedPolygon && closedPolygon.length >= 3) {
            // Found a closed area! Use it as the polygon
            // Calculate tolerance based on zoom level
            const zoom = mapInstance.getZoom();
            const tolerance = 0.00005 * Math.pow(2, 15 - zoom);
            const simplified = simplifyPath(closedPolygon, tolerance);

            if (simplified.length >= 3) {
              // Set the polygon and stop drawing
              setTimeout(() => {
                setPoints(simplified);
                setIsPolygonClosed(true);
                setIsDrawingFreehand(false);
                setFreehandPath([]);
                setDrawMode("select");
                mapInstance.dragPan.enable();
              }, 0);
            }
          }

          return newPath;
        });
      }
    };

    mapInstance.on("mousemove", handleMouseMove);
    return () => {
      mapInstance.off("mousemove", handleMouseMove);
    };
  }, [isDrawingFreehand, drawMode]);

  // Handle map clicks for point mode
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

          if (distance < 0.001) {
            setIsPolygonClosed(true);
            setDrawMode("select");
            return;
          }
        }

        setPoints((prev) => [...prev, newPoint]);
      } else if (drawMode === "delete") {
        const features = mapInstance.queryRenderedFeatures(e.point, {
          layers: ["vertices"],
        });

        if (features.length > 0) {
          const index = features[0].properties?.index;
          if (typeof index === "number") {
            setPoints((prev) => {
              const newPoints = [...prev];
              newPoints.splice(index, 1);
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
    return () => {
      mapInstance.off("click", handleClick);
    };
  }, [drawMode, points, isPolygonClosed]);

  // Handle freehand drawing (mousedown/mouseup)
  useEffect(() => {
    if (!map.current || drawMode !== "freehand") return;
    const mapInstance = map.current;

    const handleMouseDown = (e: maplibregl.MapMouseEvent) => {
      if (isPolygonClosed) return;

      // Clear any existing polygon when starting new freehand
      setPoints([]);
      setIsPolygonClosed(false);

      // Disable map dragging during freehand
      mapInstance.dragPan.disable();
      setIsDrawingFreehand(true);
      setFreehandPath([[e.lngLat.lng, e.lngLat.lat]]);
    };

    const handleMouseUp = () => {
      if (!isDrawingFreehand) return;

      mapInstance.dragPan.enable();
      setIsDrawingFreehand(false);

      // If we haven't closed a polygon yet, just clear the path
      // (the polygon would have been set in the mousemove handler if it closed)
      setFreehandPath([]);
    };

    mapInstance.on("mousedown", handleMouseDown);
    mapInstance.on("mouseup", handleMouseUp);
    mapInstance.on("mouseout", handleMouseUp);

    return () => {
      mapInstance.off("mousedown", handleMouseDown);
      mapInstance.off("mouseup", handleMouseUp);
      mapInstance.off("mouseout", handleMouseUp);
      mapInstance.dragPan.enable();
    };
  }, [drawMode, isPolygonClosed, isDrawingFreehand]);

  // Update cursor based on mode
  useEffect(() => {
    if (!map.current) return;
    const canvas = map.current.getCanvas();

    if (drawMode === "draw") {
      canvas.style.cursor = "crosshair";
    } else if (drawMode === "freehand") {
      canvas.style.cursor = isDrawingFreehand ? "crosshair" : "crosshair";
    } else if (drawMode === "delete") {
      canvas.style.cursor = "pointer";
    } else {
      canvas.style.cursor = "";
    }
  }, [drawMode, isDrawingFreehand]);

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
    setFreehandPath([]);
    setDrawMode("draw");
  };

  const handleSave = () => {
    if (points.length < 3) {
      alert("La zona debe tener al menos 3 puntos");
      return;
    }

    const geometry = {
      type: "Polygon" as const,
      coordinates: [[...points, points[0]]],
    };

    onSave(JSON.stringify(geometry));
  };

  const switchMode = (mode: DrawMode) => {
    setDrawMode(mode);
    setFreehandPath([]);
    setIsDrawingFreehand(false);
    if ((mode === "draw" || mode === "freehand") && isPolygonClosed) {
      setIsPolygonClosed(false);
    }
  };

  return (
    <div className={`relative h-full ${className}`}>
      {/* Toolbar */}
      <div className="absolute top-4 left-4 z-10 flex gap-1 bg-background/95 backdrop-blur-sm p-2 rounded-lg shadow-lg border">
        <Button
          variant={drawMode === "select" ? "default" : "ghost"}
          size="sm"
          onClick={() => switchMode("select")}
          title="Seleccionar"
          className="h-9 w-9 p-0"
        >
          <MousePointer2 className="h-4 w-4" />
        </Button>
        <Button
          variant={drawMode === "draw" ? "default" : "ghost"}
          size="sm"
          onClick={() => switchMode("draw")}
          title="Dibujar puntos"
          className="h-9 w-9 p-0"
        >
          <PenTool className="h-4 w-4" />
        </Button>
        <Button
          variant={drawMode === "freehand" ? "default" : "ghost"}
          size="sm"
          onClick={() => switchMode("freehand")}
          title="Dibujo libre (lápiz)"
          className="h-9 w-9 p-0"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant={drawMode === "delete" ? "default" : "ghost"}
          size="sm"
          onClick={() => switchMode("delete")}
          title="Eliminar punto"
          className="h-9 w-9 p-0"
        >
          <Eraser className="h-4 w-4" />
        </Button>
        <div className="w-px bg-border mx-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={handleUndo}
          disabled={points.length === 0}
          title="Deshacer"
          className="h-9 w-9 p-0"
        >
          <Undo className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          disabled={points.length === 0 && freehandPath.length === 0}
          title="Limpiar todo"
          className="h-9 w-9 p-0"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Instructions */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-background/95 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border text-sm max-w-md text-center">
        {drawMode === "draw" && !isPolygonClosed && (
          <span>
            <strong>Modo Puntos:</strong> Clic para agregar puntos.
            {points.length >= 3 && (
              <span className="text-green-500">
                {" "}
                Clic en el punto verde para cerrar.
              </span>
            )}
          </span>
        )}
        {drawMode === "freehand" && !isPolygonClosed && !isDrawingFreehand && (
          <span>
            <strong>Modo Lápiz:</strong> Mantén presionado y dibuja. Cuando
            cruces tu trazo, se cerrará la zona automáticamente.
          </span>
        )}
        {drawMode === "freehand" && isDrawingFreehand && (
          <span className="text-amber-500 font-medium">
            Dibujando... Cruza tu trazo para cerrar la zona
          </span>
        )}
        {drawMode === "delete" && (
          <span>
            <strong>Modo Borrar:</strong> Clic en un punto para eliminarlo.
          </span>
        )}
        {drawMode === "select" && (
          <span>
            {isPolygonClosed
              ? "✓ Polígono cerrado. Puedes guardar o seguir editando."
              : "Selecciona una herramienta para empezar a dibujar."}
          </span>
        )}
      </div>

      {/* Status */}
      <div className="absolute bottom-4 left-4 z-10 bg-background/95 backdrop-blur-sm px-3 py-2 rounded-lg shadow-lg border text-sm flex items-center gap-3">
        <span>
          <span className="font-semibold">{points.length}</span> puntos
        </span>
        {isPolygonClosed && (
          <span className="text-green-500 font-medium flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Cerrado
          </span>
        )}
      </div>

      {/* Action Buttons */}
      <div className="absolute bottom-4 right-4 z-10 flex gap-2">
        <Button variant="outline" onClick={onCancel} className="shadow-lg">
          Cancelar
        </Button>
        <Button
          onClick={handleSave}
          disabled={points.length < 3}
          className="shadow-lg"
        >
          Guardar Zona
        </Button>
      </div>

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-20 rounded-lg">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Cargando mapa...</p>
          </div>
        </div>
      )}

      <div
        ref={mapContainer}
        className="w-full h-full rounded-lg overflow-hidden"
      />
    </div>
  );
}
