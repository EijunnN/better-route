import type { LngLat, Midpoint } from "./types";

// Check if two line segments intersect and return intersection point
export function lineIntersection(
  p1: LngLat,
  p2: LngLat,
  p3: LngLat,
  p4: LngLat,
): LngLat | null {
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
export function findClosedPolygon(path: LngLat[]): LngLat[] | null {
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
      const polygon: LngLat[] = [intersection];
      for (let j = i + 1; j < lastIdx; j++) {
        polygon.push(path[j]);
      }
      return polygon;
    }
  }

  return null;
}

// Simplify path by removing points that are too close together
export function simplifyPath(points: LngLat[], tolerance: number): LngLat[] {
  if (points.length < 3) return points;

  const result: LngLat[] = [points[0]];

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

// Calculate midpoints between consecutive vertices
// (including last->first for closed polygons)
export function calculateMidpoints(pts: LngLat[]): Midpoint[] {
  if (pts.length < 2) return [];
  const mids: Midpoint[] = [];
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

// Euclidean distance between two lng/lat points (in degrees - used as a rough
// pixel-agnostic proximity check, not geographic distance).
export function pointDistance(a: LngLat, b: LngLat): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
}

// Compute the centroid (average of min/max) of a polygon ring.
export function polygonCenter(ring: number[][]): LngLat {
  const lngs = ring.map((c) => c[0]);
  const lats = ring.map((c) => c[1]);
  return [
    (Math.min(...lngs) + Math.max(...lngs)) / 2,
    (Math.min(...lats) + Math.max(...lats)) / 2,
  ];
}
