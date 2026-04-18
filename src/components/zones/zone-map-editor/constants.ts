// Source ids
export const SRC_POLYGON = "polygon";
export const SRC_OUTLINE = "polygon-outline";
export const SRC_VERTICES = "vertices";
export const SRC_MIDPOINTS = "midpoints";
export const SRC_PREVIEW = "preview-line";
export const SRC_FREEHAND = "freehand-path";

// Layer ids
export const LYR_POLYGON_FILL = "polygon-fill";
export const LYR_POLYGON_OUTLINE = "polygon-outline";
export const LYR_FREEHAND_PATH = "freehand-path";
export const LYR_PREVIEW_LINE = "preview-line";
export const LYR_MIDPOINTS = "midpoints";
export const LYR_VERTICES = "vertices";
export const LYR_FIRST_VERTEX = "first-vertex";

// Visual tuning
export const FILL_OPACITY = 0.3;
export const OUTLINE_WIDTH = 3;
export const FREEHAND_COLOR = "#f59e0b";
export const FREEHAND_WIDTH = 3;
export const FREEHAND_OPACITY = 0.9;
export const PREVIEW_WIDTH = 2;
export const PREVIEW_DASH: [number, number] = [3, 3];
export const PREVIEW_OPACITY = 0.7;
export const MIDPOINT_RADIUS = 5;
export const MIDPOINT_OPACITY = 0.5;
export const MIDPOINT_STROKE_WIDTH = 1.5;
export const MIDPOINT_STROKE_OPACITY = 0.7;
export const VERTEX_RADIUS = 8;
export const VERTEX_STROKE_WIDTH = 2;
export const FIRST_VERTEX_RADIUS = 12;
export const FIRST_VERTEX_COLOR = "#22c55e";
export const FIRST_VERTEX_STROKE_WIDTH = 3;
export const FIRST_VERTEX_OPACITY = 0.8;

// Interaction thresholds
export const CLOSE_POLYGON_DISTANCE = 0.001;
export const FREEHAND_TOLERANCE_BASE = 0.00005;
export const FREEHAND_TOLERANCE_ZOOM_REF = 15;

// Default styling
export const DEFAULT_ZONE_COLOR = "#3B82F6";
export const FIT_BOUNDS_PADDING = 50;
export const INITIAL_ZOOM_WITH_GEOMETRY = 13;
