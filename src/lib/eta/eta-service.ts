/**
 * ETA en vivo por ruta.
 *
 * El ETA NUNCA se deriva de la geometría planificada: se recalcula desde la
 * posición ACTUAL del conductor hacia las paradas restantes en orden de
 * secuencia, vía OSRM. Por eso es inmune a desvíos — la ruta planificada solo
 * aporta el orden de las paradas.
 *
 * Disparadores (ver hooks en location POST y route-stops PATCH):
 * - Ping GPS del driver, con throttle (edad > 45s o movimiento > 200m).
 * - Transición de estado de una parada (force: cambia la secuencia restante).
 *
 * Los resultados viven en Redis con TTL corto: si el driver deja de pingear,
 * el ETA expira solo y los consumidores caen al horario planificado de VROOM
 * (routeStops.estimatedArrival).
 */

import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { routeStops } from "@/db/schema";
import { withRedis } from "@/lib/infra/redis";
import { getLegDurations, type LatLng } from "./osrm";

/** Vida del ETA en Redis: cubre varios ciclos de recálculo sin acumular basura. */
const ETA_TTL_SECONDS = 10 * 60;
/** No recalcular si el último ETA tiene menos de esto… */
const RECOMPUTE_MIN_INTERVAL_MS = 45_000;
/** …salvo que el driver se haya movido más de esto desde el último cálculo. */
const RECOMPUTE_MIN_MOVE_METERS = 200;
/** Fallback cuando la parada no trae estimatedServiceTime (segundos). */
const DEFAULT_SERVICE_TIME_SECONDS = 10 * 60;

export interface StopEta {
  stopId: string;
  orderId: string;
  sequence: number;
  /** ISO timestamp de llegada estimada a esta parada. */
  etaAt: string;
}

export interface RouteEtas {
  routeId: string;
  driverId: string;
  computedAt: string;
  fromLatitude: number;
  fromLongitude: number;
  stops: StopEta[];
}

export interface OrderEta {
  etaAt: string;
  computedAt: string;
  routeId: string;
}

const routeKey = (routeId: string) => `eta:route:${routeId}`;
const orderKey = (orderId: string) => `eta:order:${orderId}`;

function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** ETAs vigentes de una ruta completa (para my-route / monitoreo). */
export async function getRouteEtas(routeId: string): Promise<RouteEtas | null> {
  return withRedis(async (redis) => {
    const raw = await redis.get(routeKey(routeId));
    return raw ? (JSON.parse(raw) as RouteEtas) : null;
  }, null);
}

/** ETA vigente de un pedido puntual (para el tracking público). */
export async function getOrderEta(orderId: string): Promise<OrderEta | null> {
  return withRedis(async (redis) => {
    const raw = await redis.get(orderKey(orderId));
    return raw ? (JSON.parse(raw) as OrderEta) : null;
  }, null);
}

/**
 * Recalcula (con throttle) los ETAs de la ruta desde la posición dada.
 * Best-effort: cualquier fallo (OSRM caído, Redis caído) conserva el último
 * ETA publicado y no lanza.
 */
export async function recomputeRouteEtas(params: {
  companyId: string;
  driverId: string;
  routeId: string;
  latitude: number;
  longitude: number;
  /** Salta el throttle (p. ej. al completar/fallar una parada). */
  force?: boolean;
}): Promise<void> {
  const { companyId, driverId, routeId, latitude, longitude, force } = params;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

  const previous = await getRouteEtas(routeId);
  if (!force && previous) {
    const ageMs = Date.now() - Date.parse(previous.computedAt);
    const movedMeters = haversineMeters(
      { latitude: previous.fromLatitude, longitude: previous.fromLongitude },
      { latitude, longitude },
    );
    if (
      ageMs < RECOMPUTE_MIN_INTERVAL_MS &&
      movedMeters < RECOMPUTE_MIN_MOVE_METERS
    ) {
      return;
    }
  }

  const remaining = await db
    .select({
      id: routeStops.id,
      orderId: routeStops.orderId,
      sequence: routeStops.sequence,
      latitude: routeStops.latitude,
      longitude: routeStops.longitude,
      estimatedServiceTime: routeStops.estimatedServiceTime,
    })
    .from(routeStops)
    .where(
      and(
        eq(routeStops.companyId, companyId),
        eq(routeStops.routeId, routeId),
        inArray(routeStops.status, ["PENDING", "IN_PROGRESS"]),
      ),
    )
    .orderBy(asc(routeStops.sequence));

  if (remaining.length === 0) {
    // Ruta terminada: limpiar el blob; las keys por pedido expiran por TTL.
    await withRedis(async (redis) => {
      await redis.del(routeKey(routeId));
    }, undefined);
    return;
  }

  const validStops = remaining
    .map((stop) => ({
      ...stop,
      lat: Number.parseFloat(stop.latitude),
      lng: Number.parseFloat(stop.longitude),
    }))
    .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
  if (validStops.length === 0) return;

  const legs = await getLegDurations([
    { latitude, longitude },
    ...validStops.map((stop) => ({ latitude: stop.lat, longitude: stop.lng })),
  ]);
  // OSRM caído o respuesta inconsistente: conservar el último ETA publicado.
  if (!legs || legs.length !== validStops.length) return;

  const now = Date.now();
  let cumulativeSeconds = 0;
  const stops: StopEta[] = validStops.map((stop, i) => {
    cumulativeSeconds += legs[i];
    const etaAt = new Date(now + cumulativeSeconds * 1000).toISOString();
    cumulativeSeconds +=
      stop.estimatedServiceTime ?? DEFAULT_SERVICE_TIME_SECONDS;
    return {
      stopId: stop.id,
      orderId: stop.orderId,
      sequence: stop.sequence,
      etaAt,
    };
  });

  const payload: RouteEtas = {
    routeId,
    driverId,
    computedAt: new Date(now).toISOString(),
    fromLatitude: latitude,
    fromLongitude: longitude,
    stops,
  };

  await withRedis(async (redis) => {
    const pipeline = redis.pipeline();
    pipeline.set(
      routeKey(routeId),
      JSON.stringify(payload),
      "EX",
      ETA_TTL_SECONDS,
    );
    for (const stop of stops) {
      const orderEta: OrderEta = {
        etaAt: stop.etaAt,
        computedAt: payload.computedAt,
        routeId,
      };
      pipeline.set(
        orderKey(stop.orderId),
        JSON.stringify(orderEta),
        "EX",
        ETA_TTL_SECONDS,
      );
    }
    await pipeline.exec();
  }, undefined);
}
