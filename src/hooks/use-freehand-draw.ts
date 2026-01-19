import type maplibregl from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";

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

export interface UseFreehandDrawOptions {
  map: maplibregl.Map | null;
  enabled: boolean;
  onPolygonComplete: (polygon: [number, number][]) => void;
  strokeColor?: string;
}

export interface UseFreehandDrawReturn {
  isDrawing: boolean;
  freehandPath: [number, number][];
  startDrawing: () => void;
  stopDrawing: () => void;
}

const FREEHAND_SOURCE_ID = "pencil-select-freehand-path";
const FREEHAND_LAYER_ID = "pencil-select-freehand-layer";

export function useFreehandDraw({
  map,
  enabled,
  onPolygonComplete,
  strokeColor = "#f59e0b",
}: UseFreehandDrawOptions): UseFreehandDrawReturn {
  const [isDrawing, setIsDrawing] = useState(false);
  const [freehandPath, setFreehandPath] = useState<[number, number][]>([]);
  const isDrawingRef = useRef(false);
  const freehandPathRef = useRef<[number, number][]>([]);

  // Keep refs in sync with state
  useEffect(() => {
    isDrawingRef.current = isDrawing;
  }, [isDrawing]);

  useEffect(() => {
    freehandPathRef.current = freehandPath;
  }, [freehandPath]);

  // Add/remove map source and layer for the freehand path visualization
  useEffect(() => {
    if (!map) return;

    const addSourceAndLayer = () => {
      if (!map.getSource(FREEHAND_SOURCE_ID)) {
        map.addSource(FREEHAND_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }

      if (!map.getLayer(FREEHAND_LAYER_ID)) {
        map.addLayer({
          id: FREEHAND_LAYER_ID,
          type: "line",
          source: FREEHAND_SOURCE_ID,
          paint: {
            "line-color": strokeColor,
            "line-width": 3,
            "line-opacity": 0.9,
          },
        });
      }
    };

    // Add immediately if map is loaded, otherwise wait
    if (map.isStyleLoaded()) {
      addSourceAndLayer();
    } else {
      map.on("load", addSourceAndLayer);
    }

    return () => {
      try {
        if (map.getLayer(FREEHAND_LAYER_ID)) {
          map.removeLayer(FREEHAND_LAYER_ID);
        }
        if (map.getSource(FREEHAND_SOURCE_ID)) {
          map.removeSource(FREEHAND_SOURCE_ID);
        }
      } catch {
        // Map might be already destroyed
      }
    };
  }, [map, strokeColor]);

  // Update the freehand path visualization
  useEffect(() => {
    if (!map) return;

    const source = map.getSource(FREEHAND_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!source) return;

    if (freehandPath.length >= 2) {
      source.setData({
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
      source.setData({ type: "FeatureCollection", features: [] });
    }
  }, [map, freehandPath]);

  // Handle mouse events for freehand drawing
  useEffect(() => {
    if (!map || !enabled) return;

    const handleMouseDown = (e: maplibregl.MapMouseEvent) => {
      // Start drawing
      map.dragPan.disable();
      setIsDrawing(true);
      setFreehandPath([[e.lngLat.lng, e.lngLat.lat]]);
    };

    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (!isDrawingRef.current) return;

      const newPoint: [number, number] = [e.lngLat.lng, e.lngLat.lat];

      setFreehandPath((prev) => {
        const newPath = [...prev, newPoint];

        // Check if the path crossed itself
        const closedPolygon = findClosedPolygon(newPath);
        if (closedPolygon && closedPolygon.length >= 3) {
          // Calculate tolerance based on zoom level
          const zoom = map.getZoom();
          const tolerance = 0.00005 * 2 ** (15 - zoom);
          const simplified = simplifyPath(closedPolygon, tolerance);

          if (simplified.length >= 3) {
            // Stop drawing and notify parent
            setTimeout(() => {
              setIsDrawing(false);
              setFreehandPath([]);
              map.dragPan.enable();
              onPolygonComplete(simplified);
            }, 0);
          }
        }

        return newPath;
      });
    };

    const handleMouseUp = () => {
      if (!isDrawingRef.current) return;

      // Stop drawing without completing (user released before crossing)
      map.dragPan.enable();
      setIsDrawing(false);
      setFreehandPath([]);
    };

    map.on("mousedown", handleMouseDown);
    map.on("mousemove", handleMouseMove);
    map.on("mouseup", handleMouseUp);
    map.on("mouseout", handleMouseUp);

    // Set cursor
    map.getCanvas().style.cursor = "crosshair";

    return () => {
      map.off("mousedown", handleMouseDown);
      map.off("mousemove", handleMouseMove);
      map.off("mouseup", handleMouseUp);
      map.off("mouseout", handleMouseUp);
      map.dragPan.enable();
      map.getCanvas().style.cursor = "";
    };
  }, [map, enabled, onPolygonComplete]);

  const startDrawing = useCallback(() => {
    setIsDrawing(true);
  }, []);

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
    setFreehandPath([]);
    if (map) {
      map.dragPan.enable();
    }
  }, [map]);

  return {
    isDrawing,
    freehandPath,
    startDrawing,
    stopDrawing,
  };
}
