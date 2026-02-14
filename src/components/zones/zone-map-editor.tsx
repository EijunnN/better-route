"use client";

import maplibregl, {
  type Map as MapLibreMap,
  type GeoJSONSource,
} from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { useTheme } from "@/components/layout/theme-context";
import {
  getMapStyle,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
} from "@/lib/map-styles";

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

  const lastIdx = path.length - 1;
  const newSegmentStart = path[lastIdx - 1];
  const newSegmentEnd = path[lastIdx];

  for (let i = 0; i < lastIdx - 2; i++) {
    const intersection = lineIntersection(
      path[i],
      path[i + 1],
      newSegmentStart,
      newSegmentEnd,
    );

    if (intersection) {
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

// Calculate midpoints between consecutive vertices (including last->first for closed polygons)
function calculateMidpoints(
  pts: [number, number][],
): { coord: [number, number]; insertIndex: number }[] {
  if (pts.length < 2) return [];
  const mids: { coord: [number, number]; insertIndex: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const next = (i + 1) % pts.length;
    mids.push({
      coord: [
        (pts[i][0] + pts[next][0]) / 2,
        (pts[i][1] + pts[next][1]) / 2,
      ],
      insertIndex: i + 1,
    });
  }
  return mids;
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
  const { isDark } = useTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [drawMode, setDrawMode] = useState<DrawMode>("draw");
  const [points, setPoints] = useState<[number, number][]>([]);
  const [isPolygonClosed, setIsPolygonClosed] = useState(false);
  const [mousePosition, setMousePosition] = useState<[number, number] | null>(
    null,
  );
  const [isDrawingFreehand, setIsDrawingFreehand] = useState(false);
  const [freehandPath, setFreehandPath] = useState<[number, number][]>([]);
  const [isMapReady, setIsMapReady] = useState(false);

  // Skip first run of theme effect (layers are already added in "load" callback)
  const themeInitRef = useRef(false);
  const addLayersRef = useRef((_m: MapLibreMap) => {});

  // Refs for vertex dragging (use refs for smooth performance during mousemove)
  const draggingVertexRef = useRef<number | null>(null);
  const draggingMidpointRef = useRef<number | null>(null);
  const pointsRef = useRef(points);
  if (draggingVertexRef.current === null) {
    pointsRef.current = points;
  }

  // Stable function to add all custom layers to the map
  const addLayers = useCallback(
    (mapInstance: MapLibreMap) => {
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

      // Midpoints
      mapInstance.addSource("midpoints", {
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
          "line-color": "#f59e0b",
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

      // Midpoints layer (smaller circles, more muted)
      mapInstance.addLayer({
        id: "midpoints",
        type: "circle",
        source: "midpoints",
        paint: {
          "circle-radius": 5,
          "circle-color": zoneColor,
          "circle-opacity": 0.5,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-opacity": 0.7,
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
    },
    [zoneColor],
  );
  addLayersRef.current = addLayers;

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

    try {
      let center: [number, number] = DEFAULT_MAP_CENTER;
      let zoom = DEFAULT_MAP_ZOOM;

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
        style: getMapStyle(isDark),
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
        setIsMapReady(true);

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
        setIsMapReady(false);
      };
    } catch (error) {
      console.error("Failed to initialize map:", error);
      setIsLoading(false);
    }
  }, []);

  // React to theme changes at runtime (skip first run - layers added in "load")
  // In MapLibre v5 diff mode, style.load fires synchronously during setStyle(),
  // so the listener MUST be registered BEFORE calling setStyle().
  useEffect(() => {
    if (!map.current) return;

    if (!themeInitRef.current) {
      themeInitRef.current = true;
      return;
    }

    const mapInstance = map.current;
    setIsMapReady(false);

    // Register BEFORE setStyle — style.load may fire synchronously in diff mode
    mapInstance.once("style.load", () => {
      addLayersRef.current(mapInstance);
      setIsMapReady(true);
    });
    mapInstance.setStyle(getMapStyle(isDark));
  }, [isDark]);

  // Update polygon layers when points change
  useEffect(() => {
    if (!map.current || !isMapReady) return;

    const mapInstance = map.current;
    const polygonSource = mapInstance.getSource("polygon") as GeoJSONSource;
    const outlineSource = mapInstance.getSource(
      "polygon-outline",
    ) as GeoJSONSource;
    const verticesSource = mapInstance.getSource("vertices") as GeoJSONSource;
    const midpointsSource = mapInstance.getSource("midpoints") as GeoJSONSource;

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

    // Update midpoints (only when polygon is closed)
    if (midpointsSource) {
      if (isPolygonClosed && points.length >= 3) {
        const mids = calculateMidpoints(points);
        midpointsSource.setData({
          type: "FeatureCollection",
          features: mids.map((m) => ({
            type: "Feature" as const,
            properties: { insertIndex: m.insertIndex },
            geometry: { type: "Point" as const, coordinates: m.coord },
          })),
        });
      } else {
        midpointsSource.setData({ type: "FeatureCollection", features: [] });
      }
    }

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
  }, [points, isPolygonClosed, isMapReady]);

  // Update freehand path visualization while drawing
  useEffect(() => {
    if (!map.current) return;

    const freehandSource = map.current.getSource(
      "freehand-path",
    ) as GeoJSONSource;
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
    ) as GeoJSONSource;
    if (!previewSource) return;

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

  // Handle mouse move - freehand drawing + vertex dragging
  useEffect(() => {
    if (!map.current) return;
    const mapInstance = map.current;

    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      setMousePosition(lngLat);

      // Vertex or midpoint dragging (select mode)
      if (draggingVertexRef.current !== null) {
        const idx = draggingVertexRef.current;
        const newPoints = [...pointsRef.current];
        newPoints[idx] = lngLat;
        pointsRef.current = newPoints;

        // Update the map sources directly for smooth visuals (no setState per frame)
        const verticesSource = mapInstance.getSource("vertices") as GeoJSONSource;
        const outlineSource = mapInstance.getSource("polygon-outline") as GeoJSONSource;
        const polygonSource = mapInstance.getSource("polygon") as GeoJSONSource;
        const midpointsSource = mapInstance.getSource("midpoints") as GeoJSONSource;

        if (verticesSource) {
          verticesSource.setData({
            type: "FeatureCollection",
            features: newPoints.map((pt, i) => ({
              type: "Feature" as const,
              properties: { index: i },
              geometry: { type: "Point" as const, coordinates: pt },
            })),
          });
        }
        if (outlineSource && newPoints.length >= 2) {
          const coords = [...newPoints];
          if (newPoints.length >= 3) coords.push(newPoints[0]);
          outlineSource.setData({
            type: "FeatureCollection",
            features: [{
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: coords },
            }],
          });
        }
        if (polygonSource && newPoints.length >= 3) {
          polygonSource.setData({
            type: "FeatureCollection",
            features: [{
              type: "Feature",
              properties: {},
              geometry: { type: "Polygon", coordinates: [[...newPoints, newPoints[0]]] },
            }],
          });
        }
        if (midpointsSource && newPoints.length >= 3) {
          const mids = calculateMidpoints(newPoints);
          midpointsSource.setData({
            type: "FeatureCollection",
            features: mids.map((m) => ({
              type: "Feature" as const,
              properties: { insertIndex: m.insertIndex },
              geometry: { type: "Point" as const, coordinates: m.coord },
            })),
          });
        }
        return;
      }

      // Hover cursor for vertices/midpoints in select mode
      if (drawMode === "select" && draggingVertexRef.current === null) {
        if (!mapInstance.getLayer("vertices")) return;
        const vertexFeatures = mapInstance.queryRenderedFeatures(e.point, {
          layers: ["vertices", "first-vertex"],
        });
        const midpointFeatures = mapInstance.getLayer("midpoints")
          ? mapInstance.queryRenderedFeatures(e.point, { layers: ["midpoints"] })
          : [];
        if (vertexFeatures.length > 0 || midpointFeatures.length > 0) {
          mapInstance.getCanvas().style.cursor = "grab";
        } else {
          mapInstance.getCanvas().style.cursor = "";
        }
      }

      // If freehand drawing is active, add points and check for self-intersection
      if (isDrawingFreehand && drawMode === "freehand") {
        const newPoint: [number, number] = lngLat;

        setFreehandPath((prev) => {
          const newPath = [...prev, newPoint];

          const closedPolygon = findClosedPolygon(newPath);
          if (closedPolygon && closedPolygon.length >= 3) {
            const zoom = mapInstance.getZoom();
            const tolerance = 0.00005 * Math.pow(2, 15 - zoom);
            const simplified = simplifyPath(closedPolygon, tolerance);

            if (simplified.length >= 3) {
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

  // Handle vertex/midpoint dragging (mousedown/mouseup) in select mode
  useEffect(() => {
    if (!map.current || drawMode !== "select") return;
    const mapInstance = map.current;

    const handleMouseDown = (e: maplibregl.MapMouseEvent) => {
      // Guard: layers may not exist during theme transition
      if (!mapInstance.getLayer("vertices")) return;

      // Check if clicking on a vertex
      const vertexFeatures = mapInstance.queryRenderedFeatures(e.point, {
        layers: ["vertices", "first-vertex"],
      });
      if (vertexFeatures.length > 0) {
        const idx = vertexFeatures[0].properties?.index;
        if (typeof idx === "number") {
          e.preventDefault();
          draggingVertexRef.current = idx;
          draggingMidpointRef.current = null;
          mapInstance.dragPan.disable();
          mapInstance.getCanvas().style.cursor = "grabbing";
          return;
        }
      }

      // Check if clicking on a midpoint
      if (!mapInstance.getLayer("midpoints")) return;
      const midpointFeatures = mapInstance.queryRenderedFeatures(e.point, {
        layers: ["midpoints"],
      });
      if (midpointFeatures.length > 0) {
        const insertIndex = midpointFeatures[0].properties?.insertIndex;
        if (typeof insertIndex === "number") {
          e.preventDefault();
          // Insert a new vertex at this position (ref only - no setState to avoid
          // the render effect overwriting drag visuals)
          const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
          const newPoints = [...pointsRef.current];
          newPoints.splice(insertIndex, 0, lngLat);
          pointsRef.current = newPoints;

          // Update sources directly so the new vertex appears immediately
          const verticesSource = mapInstance.getSource("vertices") as GeoJSONSource;
          const outlineSource = mapInstance.getSource("polygon-outline") as GeoJSONSource;
          const polygonSource = mapInstance.getSource("polygon") as GeoJSONSource;
          const midpointsSource = mapInstance.getSource("midpoints") as GeoJSONSource;
          if (verticesSource) {
            verticesSource.setData({
              type: "FeatureCollection",
              features: newPoints.map((pt, i) => ({
                type: "Feature" as const,
                properties: { index: i },
                geometry: { type: "Point" as const, coordinates: pt },
              })),
            });
          }
          if (outlineSource) {
            const coords = [...newPoints];
            if (newPoints.length >= 3) coords.push(newPoints[0]);
            outlineSource.setData({
              type: "FeatureCollection",
              features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } }],
            });
          }
          if (polygonSource && newPoints.length >= 3) {
            polygonSource.setData({
              type: "FeatureCollection",
              features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...newPoints, newPoints[0]]] } }],
            });
          }
          if (midpointsSource) {
            const mids = calculateMidpoints(newPoints);
            midpointsSource.setData({
              type: "FeatureCollection",
              features: mids.map((m) => ({
                type: "Feature" as const,
                properties: { insertIndex: m.insertIndex },
                geometry: { type: "Point" as const, coordinates: m.coord },
              })),
            });
          }

          // Start dragging the newly inserted vertex (commit on mouseup)
          draggingVertexRef.current = insertIndex;
          draggingMidpointRef.current = null;
          mapInstance.dragPan.disable();
          mapInstance.getCanvas().style.cursor = "grabbing";
          return;
        }
      }
    };

    const handleMouseUp = () => {
      if (draggingVertexRef.current !== null) {
        // Commit the final position
        setPoints([...pointsRef.current]);
        draggingVertexRef.current = null;
        draggingMidpointRef.current = null;
        mapInstance.dragPan.enable();
        mapInstance.getCanvas().style.cursor = "";
      }
    };

    mapInstance.on("mousedown", handleMouseDown);
    mapInstance.on("mouseup", handleMouseUp);
    // Also stop drag if mouse leaves the map
    mapInstance.on("mouseout", handleMouseUp);

    return () => {
      mapInstance.off("mousedown", handleMouseDown);
      mapInstance.off("mouseup", handleMouseUp);
      mapInstance.off("mouseout", handleMouseUp);
      // Ensure dragPan is re-enabled on cleanup
      if (draggingVertexRef.current !== null) {
        mapInstance.dragPan.enable();
        draggingVertexRef.current = null;
      }
    };
  }, [drawMode]);

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

      setPoints([]);
      setIsPolygonClosed(false);

      mapInstance.dragPan.disable();
      setIsDrawingFreehand(true);
      setFreehandPath([[e.lngLat.lng, e.lngLat.lat]]);
    };

    const handleMouseUp = () => {
      if (!isDrawingFreehand) return;

      mapInstance.dragPan.enable();
      setIsDrawingFreehand(false);
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
      canvas.style.cursor = "crosshair";
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
          title="Dibujo libre (lapiz)"
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
            <strong>Modo Lapiz:</strong> Manten presionado y dibuja. Cuando
            cruces tu trazo, se cerrara la zona automaticamente.
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
              ? "Arrastra los puntos para ajustar la forma. Los puntos pequenos agregan nuevos vertices."
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
