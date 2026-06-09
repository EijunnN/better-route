/**
 * Cliente Redis compartido (ioredis) contra la instancia local del
 * docker-compose. Reemplaza a Upstash: en el modelo single-tenant por VPS el
 * Redis vive junto a la app, sin costo por request ni latencia HTTPS.
 *
 * Filosofía de fallos: Redis es infraestructura OPCIONAL. Si no está
 * configurado o se cae, los callers degradan (cache → miss, sesiones →
 * JWT-only, ETA → horario planificado). Nunca se propaga una excepción de
 * conexión al request.
 */

import { Redis } from "ioredis";

let client: Redis | null = null;
let unavailableLoggedAt = 0;

function logUnavailableOnce(error: unknown): void {
  // Evita inundar el log: una línea por minuto como máximo.
  const now = Date.now();
  if (now - unavailableLoggedAt < 60_000) return;
  unavailableLoggedAt = now;
  console.warn(
    "[Redis] No disponible — degradando a fallbacks:",
    error instanceof Error ? error.message : error,
  );
}

/**
 * Devuelve el cliente singleton, o null si REDIS_URL no está configurado.
 * La conexión es lazy (se abre en el primer comando) y se auto-reconecta.
 */
export function getRedis(): Redis | null {
  if (client) return client;

  const url = process.env.REDIS_URL;
  if (!url) {
    logUnavailableOnce(new Error("REDIS_URL no configurado"));
    return null;
  }

  client = new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 2,
    // Backoff corto y acotado: si Redis está caído queremos fallar rápido y
    // dejar que el caller degrade, no bloquear requests.
    retryStrategy: (times) => Math.min(times * 200, 2_000),
    enableOfflineQueue: false,
  });

  client.on("error", (err) => logUnavailableOnce(err));

  return client;
}

/**
 * Ejecuta una operación contra Redis devolviendo `fallback` si Redis no está
 * configurado, está caído o el comando falla.
 */
export async function withRedis<T>(
  operation: (redis: Redis) => Promise<T>,
  fallback: T,
): Promise<T> {
  const redis = getRedis();
  if (!redis) return fallback;
  try {
    return await operation(redis);
  } catch (error) {
    logUnavailableOnce(error);
    return fallback;
  }
}

/** Ping de salud (para /api/health o métricas). */
export async function isRedisAvailable(): Promise<boolean> {
  return withRedis(async (redis) => (await redis.ping()) === "PONG", false);
}
