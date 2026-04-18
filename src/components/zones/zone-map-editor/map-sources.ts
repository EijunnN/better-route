import maplibregl, {
  type Map as MapLibreMap,
  type GeoJSONSource,
} from "maplibre-gl";
import { calculateMidpoints } from "./geometry";
import type { LngLat } from "./types";
import {
  FILL_OPACITY,
  FIT_BOUNDS_PADDING,
  FIRST_VERTEX_COLOR,
  FIRST_VERTEX_OPACITY,
  FIRST_VERTEX_RADIUS,
  FIRST_VERTEX_STROKE_WIDTH,
  FREEHAND_COLOR,
  FREEHAND_OPACITY,
  FREEHAND_WIDTH,
  LYR_FIRST_VERTEX,
  LYR_FREEHAND_PATH,
  LYR_MIDPOINTS,
  LYR_POLYGON_FILL,
  LYR_POLYGON_OUTLINE,
  LYR_PREVIEW_LINE,
  LYR_VERTICES,
  MIDPOINT_OPACITY,
  MIDPOINT_RADIUS,
  MIDPOINT_STROKE_OPACITY,
  MIDPOINT_STROKE_WIDTH,
  OUTLINE_WIDTH,
  PREVIEW_DASH,
  PREVIEW_OPACITY,
  PREVIEW_WIDTH,
  SRC_FREEHAND,
  SRC_MIDPOINTS,
  SRC_OUTLINE,
  SRC_POLYGON,
  SRC_PREVIEW,
  SRC_VERTICES,
  VERTEX_RADIUS,
  VERTEX_STROKE_WIDTH,
} from "./constants";

// Add all sources + layers used by the zone editor. No-op if already added.
export function addEditorLayers(
  mapInstance: MapLibreMap,
  zoneColor: string,
): void {
  // Skip if sources already exist (e.g. style.load fired twice)
  if (mapInstance.getSource(SRC_POLYGON)) return;

  // Sources
  mapInstance.addSource(SRC_POLYGON, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  mapInstance.addSource(SRC_OUTLINE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  mapInstance.addSource(SRC_VERTICES, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  mapInstance.addSource(SRC_MIDPOINTS, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  mapInstance.addSource(SRC_PREVIEW, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  mapInstance.addSource(SRC_FREEHAND, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  // Polygon fill layer
  mapInstance.addLayer({
    id: LYR_POLYGON_FILL,
    type: "fill",
    source: SRC_POLYGON,
    paint: {
      "fill-color": zoneColor,
      "fill-opacity": FILL_OPACITY,
    },
  });

  // Polygon outline layer
  mapInstance.addLayer({
    id: LYR_POLYGON_OUTLINE,
    type: "line",
    source: SRC_OUTLINE,
    paint: {
      "line-color": zoneColor,
      "line-width": OUTLINE_WIDTH,
    },
  });

  // Freehand path layer (shown while drawing)
  mapInstance.addLayer({
    id: LYR_FREEHAND_PATH,
    type: "line",
    source: SRC_FREEHAND,
    paint: {
      "line-color": FREEHAND_COLOR,
      "line-width": FREEHAND_WIDTH,
      "line-opacity": FREEHAND_OPACITY,
    },
  });

  // Preview line layer (dashed) - for point mode
  mapInstance.addLayer({
    id: LYR_PREVIEW_LINE,
    type: "line",
    source: SRC_PREVIEW,
    paint: {
      "line-color": zoneColor,
      "line-width": PREVIEW_WIDTH,
      "line-dasharray": PREVIEW_DASH,
      "line-opacity": PREVIEW_OPACITY,
    },
  });

  // Midpoints layer (smaller circles, more muted)
  mapInstance.addLayer({
    id: LYR_MIDPOINTS,
    type: "circle",
    source: SRC_MIDPOINTS,
    paint: {
      "circle-radius": MIDPOINT_RADIUS,
      "circle-color": zoneColor,
      "circle-opacity": MIDPOINT_OPACITY,
      "circle-stroke-width": MIDPOINT_STROKE_WIDTH,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-opacity": MIDPOINT_STROKE_OPACITY,
    },
  });

  // Vertices layer
  mapInstance.addLayer({
    id: LYR_VERTICES,
    type: "circle",
    source: SRC_VERTICES,
    paint: {
      "circle-radius": VERTEX_RADIUS,
      "circle-color": zoneColor,
      "circle-stroke-width": VERTEX_STROKE_WIDTH,
      "circle-stroke-color": "#ffffff",
    },
  });

  // First vertex highlight (larger, different color to show where to close)
  mapInstance.addLayer({
    id: LYR_FIRST_VERTEX,
    type: "circle",
    source: SRC_VERTICES,
    filter: ["==", ["get", "index"], 0],
    paint: {
      "circle-radius": FIRST_VERTEX_RADIUS,
      "circle-color": FIRST_VERTEX_COLOR,
      "circle-stroke-width": FIRST_VERTEX_STROKE_WIDTH,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": FIRST_VERTEX_OPACITY,
    },
  });
}

// Build the vertices FeatureCollection for a set of points.
function verticesFC(points: LngLat[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.map((pt, i) => ({
      type: "Feature" as const,
      properties: { index: i },
      geometry: { type: "Point" as const, coordinates: pt },
    })),
  };
}

// Build the outline FeatureCollection (closed if polygon is closed).
function outlineFC(
  points: LngLat[],
  isClosed: boolean,
): GeoJSON.FeatureCollection {
  if (points.length < 2) {
    return { type: "FeatureCollection", features: [] };
  }
  const coords = [...points];
  if (isClosed && points.length >= 3) {
    coords.push(points[0]);
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: coords },
      },
    ],
  };
}

// Build the polygon fill FeatureCollection (empty unless closed with >=3 pts).
function polygonFC(
  points: LngLat[],
  isClosed: boolean,
): GeoJSON.FeatureCollection {
  if (!isClosed || points.length < 3) {
    return { type: "FeatureCollection", features: [] };
  }
  return {
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
  };
}

// Build the midpoints FeatureCollection.
function midpointsFC(
  points: LngLat[],
  isClosed: boolean,
): GeoJSON.FeatureCollection {
  if (!isClosed || points.length < 3) {
    return { type: "FeatureCollection", features: [] };
  }
  const mids = calculateMidpoints(points);
  return {
    type: "FeatureCollection",
    features: mids.map((m) => ({
      type: "Feature" as const,
      properties: { insertIndex: m.insertIndex },
      geometry: { type: "Point" as const, coordinates: m.coord },
    })),
  };
}

// Declarative update of all polygon-related sources.
// Mirrors the behavior of the render useEffect (without freehand/preview).
export function updateAllSources(
  mapInstance: MapLibreMap,
  points: LngLat[],
  isClosed: boolean,
): void {
  const polygonSource = mapInstance.getSource(SRC_POLYGON) as
    | GeoJSONSource
    | undefined;
  const outlineSource = mapInstance.getSource(SRC_OUTLINE) as
    | GeoJSONSource
    | undefined;
  const verticesSource = mapInstance.getSource(SRC_VERTICES) as
    | GeoJSONSource
    | undefined;
  const midpointsSource = mapInstance.getSource(SRC_MIDPOINTS) as
    | GeoJSONSource
    | undefined;

  if (!polygonSource || !outlineSource || !verticesSource) return;

  verticesSource.setData(verticesFC(points));
  outlineSource.setData(outlineFC(points, isClosed));
  polygonSource.setData(polygonFC(points, isClosed));
  if (midpointsSource) {
    midpointsSource.setData(midpointsFC(points, isClosed));
  }
}

// Variant used during vertex-drag where we always want midpoints rendered
// when there are >=3 points, regardless of `isPolygonClosed` state (mirrors
// original behavior which updated midpoints without the closed check during
// drag).
export function updateSourcesDuringDrag(
  mapInstance: MapLibreMap,
  points: LngLat[],
  isClosed: boolean,
): void {
  const polygonSource = mapInstance.getSource(SRC_POLYGON) as
    | GeoJSONSource
    | undefined;
  const outlineSource = mapInstance.getSource(SRC_OUTLINE) as
    | GeoJSONSource
    | undefined;
  const verticesSource = mapInstance.getSource(SRC_VERTICES) as
    | GeoJSONSource
    | undefined;
  const midpointsSource = mapInstance.getSource(SRC_MIDPOINTS) as
    | GeoJSONSource
    | undefined;

  if (verticesSource) {
    verticesSource.setData(verticesFC(points));
  }
  if (outlineSource && points.length >= 2) {
    outlineSource.setData(outlineFC(points, isClosed || points.length >= 3));
  }
  if (polygonSource && points.length >= 3) {
    polygonSource.setData(polygonFC(points, true));
  }
  if (midpointsSource && points.length >= 3) {
    midpointsSource.setData(midpointsFC(points, true));
  }
}

export function setFreehandPath(
  mapInstance: MapLibreMap,
  isDrawing: boolean,
  path: LngLat[],
): void {
  const freehandSource = mapInstance.getSource(SRC_FREEHAND) as
    | GeoJSONSource
    | undefined;
  if (!freehandSource) return;

  if (isDrawing && path.length >= 2) {
    freehandSource.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: path },
        },
      ],
    });
  } else {
    freehandSource.setData({ type: "FeatureCollection", features: [] });
  }
}

export function fitBoundsToRing(
  mapInstance: MapLibreMap,
  ring: number[][],
): void {
  const bounds = new maplibregl.LngLatBounds();
  ring.forEach((coord) => {
    bounds.extend([coord[0], coord[1]]);
  });
  mapInstance.fitBounds(bounds, { padding: FIT_BOUNDS_PADDING });
}

export function setPreviewLine(
  mapInstance: MapLibreMap,
  options: {
    show: boolean;
    lastPoint?: LngLat;
    mousePosition?: LngLat;
    firstPoint?: LngLat;
    includeClosingPreview: boolean;
  },
): void {
  const previewSource = mapInstance.getSource(SRC_PREVIEW) as
    | GeoJSONSource
    | undefined;
  if (!previewSource) return;

  if (!options.show || !options.lastPoint || !options.mousePosition) {
    previewSource.setData({ type: "FeatureCollection", features: [] });
    return;
  }

  const features: GeoJSON.Feature[] = [
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [options.lastPoint, options.mousePosition],
      },
    },
  ];

  if (options.includeClosingPreview && options.firstPoint) {
    features.push({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [options.mousePosition, options.firstPoint],
      },
    });
  }

  previewSource.setData({ type: "FeatureCollection", features });
}
