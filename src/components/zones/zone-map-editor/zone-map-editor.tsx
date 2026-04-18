"use client";

import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "@/components/layout/theme-context";
import {
  getMapStyle,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
} from "@/lib/map-styles";
import {
  CLOSE_POLYGON_DISTANCE,
  DEFAULT_ZONE_COLOR,
  FREEHAND_TOLERANCE_BASE,
  FREEHAND_TOLERANCE_ZOOM_REF,
  INITIAL_ZOOM_WITH_GEOMETRY,
  LYR_FIRST_VERTEX,
  LYR_MIDPOINTS,
  LYR_VERTICES,
} from "./constants";
import {
  findClosedPolygon,
  pointDistance,
  polygonCenter,
  simplifyPath,
} from "./geometry";
import {
  addEditorLayers,
  fitBoundsToRing,
  setFreehandPath,
  setPreviewLine,
  updateAllSources,
  updateSourcesDuringDrag,
} from "./map-sources";
import {
  ActionButtons,
  Instructions,
  LoadingOverlay,
  StatusBar,
  Toolbar,
} from "./toolbar";
import type { DrawMode, LngLat, ZoneMapEditorProps } from "./types";

export function ZoneMapEditor({
  initialGeometry,
  zoneColor = DEFAULT_ZONE_COLOR,
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
  const [points, setPoints] = useState<LngLat[]>([]);
  const [isPolygonClosed, setIsPolygonClosed] = useState(false);
  const [mousePosition, setMousePosition] = useState<LngLat | null>(null);
  const [isDrawingFreehand, setIsDrawingFreehand] = useState(false);
  const [freehandPath, setFreehandPathState] = useState<LngLat[]>([]);
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

  // Stable closure to add all custom layers to the map (reads latest zoneColor)
  addLayersRef.current = (mapInstance: MapLibreMap) => {
    addEditorLayers(mapInstance, zoneColor);
  };

  // Initialize points from initial geometry
  useEffect(() => {
    if (initialGeometry?.coordinates?.[0]) {
      const coords = initialGeometry.coordinates[0].slice(0, -1) as LngLat[];
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
        center = polygonCenter(initialGeometry.coordinates[0]);
        zoom = INITIAL_ZOOM_WITH_GEOMETRY;
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
        addLayersRef.current(mapInstance);
        setIsMapReady(true);

        if (initialGeometry?.coordinates?.[0]?.length) {
          fitBoundsToRing(mapInstance, initialGeometry.coordinates[0]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    mapInstance.once("style.load", () => {
      addLayersRef.current(mapInstance);
      setIsMapReady(true);
    });
    mapInstance.setStyle(getMapStyle(isDark), { diff: false });
  }, [isDark]);

  // Update polygon layers when points change
  useEffect(() => {
    if (!map.current || !isMapReady) return;
    updateAllSources(map.current, points, isPolygonClosed);
  }, [points, isPolygonClosed, isMapReady]);

  // Update freehand path visualization while drawing
  useEffect(() => {
    if (!map.current) return;
    setFreehandPath(map.current, isDrawingFreehand, freehandPath);
  }, [freehandPath, isDrawingFreehand]);

  // Update preview line (from last point to cursor) - only for point mode
  useEffect(() => {
    if (!map.current) return;
    const show =
      drawMode === "draw" &&
      points.length > 0 &&
      !isPolygonClosed &&
      mousePosition !== null;
    setPreviewLine(map.current, {
      show,
      lastPoint: points.length > 0 ? points[points.length - 1] : undefined,
      mousePosition: mousePosition ?? undefined,
      firstPoint: points[0],
      includeClosingPreview: points.length >= 3,
    });
  }, [mousePosition, points, drawMode, isPolygonClosed]);

  // Handle mouse move - freehand drawing + vertex dragging
  useEffect(() => {
    if (!map.current) return;
    const mapInstance = map.current;

    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      const lngLat: LngLat = [e.lngLat.lng, e.lngLat.lat];
      setMousePosition(lngLat);

      // Vertex or midpoint dragging (select mode)
      if (draggingVertexRef.current !== null) {
        const idx = draggingVertexRef.current;
        const newPoints = [...pointsRef.current];
        newPoints[idx] = lngLat;
        pointsRef.current = newPoints;

        // Update the map sources directly for smooth visuals (no setState per frame)
        updateSourcesDuringDrag(mapInstance, newPoints, true);
        return;
      }

      // Hover cursor for vertices/midpoints in select mode
      if (drawMode === "select" && draggingVertexRef.current === null) {
        if (!mapInstance.getLayer(LYR_VERTICES)) return;
        const vertexFeatures = mapInstance.queryRenderedFeatures(e.point, {
          layers: [LYR_VERTICES, LYR_FIRST_VERTEX],
        });
        const midpointFeatures = mapInstance.getLayer(LYR_MIDPOINTS)
          ? mapInstance.queryRenderedFeatures(e.point, {
              layers: [LYR_MIDPOINTS],
            })
          : [];
        if (vertexFeatures.length > 0 || midpointFeatures.length > 0) {
          mapInstance.getCanvas().style.cursor = "grab";
        } else {
          mapInstance.getCanvas().style.cursor = "";
        }
      }

      // If freehand drawing is active, add points and check for self-intersection
      if (isDrawingFreehand && drawMode === "freehand") {
        const newPoint: LngLat = lngLat;

        setFreehandPathState((prev) => {
          const newPath = [...prev, newPoint];

          const closedPolygon = findClosedPolygon(newPath);
          if (closedPolygon && closedPolygon.length >= 3) {
            const zoom = mapInstance.getZoom();
            const tolerance =
              FREEHAND_TOLERANCE_BASE *
              Math.pow(2, FREEHAND_TOLERANCE_ZOOM_REF - zoom);
            const simplified = simplifyPath(closedPolygon, tolerance);

            if (simplified.length >= 3) {
              setTimeout(() => {
                setPoints(simplified);
                setIsPolygonClosed(true);
                setIsDrawingFreehand(false);
                setFreehandPathState([]);
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
      if (!mapInstance.getLayer(LYR_VERTICES)) return;

      // Check if clicking on a vertex
      const vertexFeatures = mapInstance.queryRenderedFeatures(e.point, {
        layers: [LYR_VERTICES, LYR_FIRST_VERTEX],
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
      if (!mapInstance.getLayer(LYR_MIDPOINTS)) return;
      const midpointFeatures = mapInstance.queryRenderedFeatures(e.point, {
        layers: [LYR_MIDPOINTS],
      });
      if (midpointFeatures.length > 0) {
        const insertIndex = midpointFeatures[0].properties?.insertIndex;
        if (typeof insertIndex === "number") {
          e.preventDefault();
          // Insert a new vertex at this position (ref only - no setState to avoid
          // the render effect overwriting drag visuals)
          const lngLat: LngLat = [e.lngLat.lng, e.lngLat.lat];
          const newPoints = [...pointsRef.current];
          newPoints.splice(insertIndex, 0, lngLat);
          pointsRef.current = newPoints;

          // Update sources directly so the new vertex appears immediately
          updateSourcesDuringDrag(mapInstance, newPoints, true);

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
        const newPoint: LngLat = [e.lngLat.lng, e.lngLat.lat];

        // Check if clicking near the first point to close polygon
        if (points.length >= 3) {
          const firstPoint = points[0];
          if (pointDistance(newPoint, firstPoint) < CLOSE_POLYGON_DISTANCE) {
            setIsPolygonClosed(true);
            setDrawMode("select");
            return;
          }
        }

        setPoints((prev) => [...prev, newPoint]);
      } else if (drawMode === "delete") {
        const features = mapInstance.queryRenderedFeatures(e.point, {
          layers: [LYR_VERTICES],
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
      setFreehandPathState([[e.lngLat.lng, e.lngLat.lat]]);
    };

    const handleMouseUp = () => {
      if (!isDrawingFreehand) return;

      mapInstance.dragPan.enable();
      setIsDrawingFreehand(false);
      setFreehandPathState([]);
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
    setFreehandPathState([]);
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
    setFreehandPathState([]);
    setIsDrawingFreehand(false);
    if ((mode === "draw" || mode === "freehand") && isPolygonClosed) {
      setIsPolygonClosed(false);
    }
  };

  return (
    <div className={`relative ${className}`} style={{ height }}>
      <Toolbar
        drawMode={drawMode}
        pointsCount={points.length}
        freehandPathCount={freehandPath.length}
        onSwitchMode={switchMode}
        onUndo={handleUndo}
        onClear={handleClear}
      />

      <Instructions
        drawMode={drawMode}
        isPolygonClosed={isPolygonClosed}
        isDrawingFreehand={isDrawingFreehand}
        pointsCount={points.length}
      />

      <StatusBar
        pointsCount={points.length}
        isPolygonClosed={isPolygonClosed}
      />

      <ActionButtons
        onCancel={onCancel}
        onSave={handleSave}
        saveDisabled={points.length < 3}
      />

      {isLoading && <LoadingOverlay />}

      <div
        ref={mapContainer}
        className="w-full h-full rounded-lg overflow-hidden"
      />
    </div>
  );
}
