/**
 * Ray-casting point-in-polygon (cliente, sin dependencias). Suficiente para
 * lassos y chequeos de zona en UI; el server usa turf en zone-utils.
 */
export function pointInPolygon(
  lng: number,
  lat: number,
  polygon: number[][],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0],
      yi = polygon[i][1];
    const xj = polygon[j][0],
      yj = polygon[j][1];
    if (
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}
