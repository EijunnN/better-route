/**
 * Cliente mínimo de OSRM para ETAs en vivo. Usa el servicio /route con todos
 * los waypoints de la ruta restante en UNA llamada y devuelve la duración de
 * cada leg. OSRM corre local (docker-compose, perfil "routing"), así que el
 * costo por llamada es de milisegundos.
 */

const OSRM_URL = process.env.OSRM_URL || "http://localhost:5001";
/** Timeout corto: el ETA es best-effort, nunca debe colgar un request. */
const ETA_OSRM_TIMEOUT_MS = 8_000;

export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Duración en segundos de cada tramo consecutivo de `coordinates`
 * (length = coordinates.length - 1), o null si OSRM no respondió.
 */
export async function getLegDurations(
  coordinates: LatLng[],
): Promise<number[] | null> {
  if (coordinates.length < 2) return [];

  const path = coordinates.map((c) => `${c.longitude},${c.latitude}`).join(";");
  const url = `${OSRM_URL}/route/v1/driving/${path}?overview=false&alternatives=false&steps=false`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(ETA_OSRM_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const json = (await response.json()) as {
      code?: string;
      routes?: Array<{ legs?: Array<{ duration: number }> }>;
    };
    if (json.code !== "Ok") return null;

    const legs = json.routes?.[0]?.legs;
    if (!legs || legs.length !== coordinates.length - 1) return null;

    return legs.map((leg) => leg.duration);
  } catch (error) {
    console.warn(
      "[ETA] OSRM no respondió:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
