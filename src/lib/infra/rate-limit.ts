/**
 * Rate limiter de ventana fija.
 *
 * Respaldado por Redis cuando está configurado (compartido entre procesos y
 * sobrevive a los deploys); si no, cae a un Map in-process — suficiente para
 * dev y tests, inútil como defensa real con más de un worker.
 */

import { getRedis } from "./redis";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const limitStore = new Map<string, RateLimitEntry>();

// Periodic cleanup of expired entries to prevent unbounded memory growth
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of limitStore) {
      if (entry.resetTime < now) limitStore.delete(key);
    }
  }, 60_000);
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetTime: number;
}

/**
 * Default rate limit configurations
 */
export const RATE_LIMITS = {
  AUTH: { maxRequests: 5, windowMs: 60 * 1000 }, // 5 requests per minute
  API: { maxRequests: 100, windowMs: 60 * 1000 }, // 100 requests per minute
  POLLING: { maxRequests: 60, windowMs: 60 * 1000 }, // 60 requests per minute
  PUBLIC_TRACKING: { maxRequests: 30, windowMs: 60 * 1000 }, // 30 requests per minute
} as const;

const REDIS_PREFIX = "ratelimit:";

function checkInMemory(
  identifier: string,
  config: RateLimitConfig,
): RateLimitResult {
  const now = Date.now();
  const entry = limitStore.get(identifier);

  if (entry && entry.resetTime < now) {
    limitStore.delete(identifier);
  }

  const currentEntry = limitStore.get(identifier);

  if (!currentEntry) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetTime: now + config.windowMs,
    };
    limitStore.set(identifier, newEntry);
    return {
      success: true,
      remaining: config.maxRequests - 1,
      resetTime: newEntry.resetTime,
    };
  }

  if (currentEntry.count >= config.maxRequests) {
    return { success: false, remaining: 0, resetTime: currentEntry.resetTime };
  }

  currentEntry.count += 1;
  return {
    success: true,
    remaining: config.maxRequests - currentEntry.count,
    resetTime: currentEntry.resetTime,
  };
}

/**
 * Consume one unit from `identifier`'s bucket.
 *
 * Redis path: `INCR` + `PEXPIRE … NX` en un MULTI — atómico, así que dos
 * requests concurrentes no pueden ambos "estrenar" la ventana. Si Redis está
 * caído o sin configurar, degrada al Map in-process en lugar de rechazar: un
 * rate limiter no debe tumbar el login.
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = RATE_LIMITS.AUTH,
): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) return checkInMemory(identifier, config);

  try {
    const key = `${REDIS_PREFIX}${identifier}`;
    const replies = await redis
      .multi()
      .incr(key)
      .pexpire(key, config.windowMs, "NX")
      .pttl(key)
      .exec();

    if (!replies) return checkInMemory(identifier, config);

    const count = Number(replies[0]?.[1] ?? 0);
    const ttlMs = Number(replies[2]?.[1] ?? config.windowMs);
    // PTTL devuelve -1 (sin expiración) o -2 (sin clave) en casos de borde.
    const resetTime = Date.now() + (ttlMs > 0 ? ttlMs : config.windowMs);

    if (count > config.maxRequests) {
      return { success: false, remaining: 0, resetTime };
    }

    return {
      success: true,
      remaining: Math.max(0, config.maxRequests - count),
      resetTime,
    };
  } catch {
    return checkInMemory(identifier, config);
  }
}

/**
 * Reset rate limit for an identifier
 */
export async function resetRateLimit(identifier: string): Promise<void> {
  limitStore.delete(identifier);

  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(`${REDIS_PREFIX}${identifier}`);
  } catch {
    // Un reset best-effort: la ventana expira sola.
  }
}

/**
 * Get rate limit headers for response
 */
export function getRateLimitHeaders(
  info: {
    remaining: number;
    resetTime: number;
  },
  config: RateLimitConfig = RATE_LIMITS.AUTH,
): Record<string, string> {
  const resetTime = Math.ceil(info.resetTime / 1000);
  return {
    "X-RateLimit-Limit": config.maxRequests.toString(),
    "X-RateLimit-Remaining": info.remaining.toString(),
    "X-RateLimit-Reset": resetTime.toString(),
  };
}

/**
 * IP del cliente, tomada SOLO de headers que escribe el reverse proxy.
 *
 * `x-forwarded-for` es texto que manda el cliente: nginx le concatena la IP
 * real al final, pero cualquiera puede prefijarlo con valores inventados. Leer
 * el PRIMER elemento (lo que hacía esta función) permitía estrenar una cubeta
 * de rate limit por request y volvía inútil el límite del login.
 *
 * Orden: `x-real-ip` (lo escribe nuestro nginx con `$remote_addr`) →
 * `cf-connecting-ip` (Cloudflare) → ÚLTIMO hop de `x-forwarded-for`, que es el
 * único que agregó un proxy nuestro. Los hops previos son del cliente.
 *
 * Sin proxy que setee headers devuelve "unknown"; por eso los callers
 * sensibles limitan además por una segunda dimensión (p. ej. el email del
 * login), para que un "unknown" compartido no bloquee a todos.
 */
export function getClientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const cfConnectingIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfConnectingIp) return cfConnectingIp;

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const hops = forwardedFor
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    const lastHop = hops.at(-1);
    if (lastHop) return lastHop;
  }

  return "unknown";
}
