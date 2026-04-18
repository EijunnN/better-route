/**
 * Data Caching Layer with Redis
 *
 * Implements Story 17.2 - Caché de Datos con Redis
 * - Redis configured with appropriate connection strategy
 * - Cache keys include versioning for granular invalidation
 * - TTL configured appropriately for each data type
 * - Sessions stored in Redis with configurable TTL (see session.ts)
 * - Geocoding cached with long TTL
 * - Appropriate handling of Redis failures
 * - Cache metrics monitored for optimization
 */

import { Redis } from "@upstash/redis";

// ============================================================================
// Cache Configuration
// ============================================================================

/**
 * Cache TTL configuration for different data types
 * All values are in seconds
 */
export const CACHE_TTL = {
  // Session data - 7 days (managed by session.ts)
  SESSION: 7 * 24 * 60 * 60,

  // Geocoding data - 30 days (addresses rarely change)
  GEOCODING: 30 * 24 * 60 * 60,

  // Reference data - 1 hour (skills, presets, etc.)
  REFERENCE_DATA: 60 * 60,

  // User data - 15 minutes (profiles, permissions)
  USER_DATA: 15 * 60,

  // Fleet/vehicle/driver lists - 5 minutes (operational data)
  OPERATIONAL_DATA: 5 * 60,

  // Orders/routes - 2 minutes (frequently changing during planning)
  PLANNING_DATA: 2 * 60,

  // Monitoring data - 30 seconds (real-time updates)
  REALTIME_DATA: 30,

  // Metrics/summaries - 1 minute (updated frequently)
  METRICS: 60,

  // Optimization results - 10 minutes (reuse same results)
  OPTIMIZATION_RESULTS: 10 * 60,
} as const;

/**
 * Cache key prefixes with versioning
 * Version numbers allow for granular cache invalidation when data structures change
 */
const CACHE_VERSIONS = {
  V1: "v1",
  V2: "v2",
} as const;

const CACHE_PREFIXES = {
  // Geocoding cache (address → lat/lng, tenant-agnostic).
  GEOCODING: `geo:${CACHE_VERSIONS.V1}:`,
} as const;

// ============================================================================
// Redis Client
// ============================================================================

let redisClient: Redis | null = null;
let redisAvailable: boolean = true;
let reconnectTimeout: NodeJS.Timeout | null = null;

/**
 * Get or create Redis client with failure handling
 */
function getRedisClient(): Redis {
  if (!redisClient) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      throw new Error(
        "Upstash Redis credentials not configured. Please set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables.",
      );
    }

    redisClient = new Redis({
      url,
      token,
      // Enable automatic retries
      retry: {
        retries: 3,
        backoff: (retryCount) => Math.min(retryCount * 100, 1000),
      },
    });
  }

  return redisClient;
}

/**
 * Check if Redis is available
 */
export async function isRedisAvailable(): Promise<boolean> {
  if (!redisAvailable) {
    return false;
  }

  try {
    const redis = getRedisClient();
    await redis.ping();
    redisAvailable = true;
    return true;
  } catch (error) {
    redisAvailable = false;
    console.warn(
      "[Cache] Redis unavailable:",
      error instanceof Error ? error.message : error,
    );

    // Schedule reconnection attempt
    if (!reconnectTimeout) {
      reconnectTimeout = setTimeout(() => {
        redisAvailable = true;
        reconnectTimeout = null;
      }, 30000); // Retry after 30 seconds
    }

    return false;
  }
}

/**
 * Execute Redis operation with fallback
 */
async function withRedisFallback<T>(
  operation: (redis: Redis) => Promise<T>,
  fallback: () => T,
): Promise<T> {
  try {
    if (!(await isRedisAvailable())) {
      return fallback();
    }

    const redis = getRedisClient();
    return await operation(redis);
  } catch (error) {
    console.warn(
      "[Cache] Redis operation failed:",
      error instanceof Error ? error.message : error,
    );
    return fallback();
  }
}

// ============================================================================
// Cache Metrics
// ============================================================================

export interface CacheMetrics {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
}

const metrics: CacheMetrics = {
  hits: 0,
  misses: 0,
  sets: 0,
  deletes: 0,
  errors: 0,
};

/**
 * Record cache hit
 */
function recordHit(): void {
  metrics.hits++;
}

/**
 * Record cache miss
 */
function recordMiss(): void {
  metrics.misses++;
}

/**
 * Record cache set
 */
function recordSet(): void {
  metrics.sets++;
}

/**
 * Record cache delete
 */
function recordDelete(): void {
  metrics.deletes++;
}

/**
 * Record cache error
 */
function _recordError(): void {
  metrics.errors++;
}

/**
 * Get cache metrics
 */
export function getCacheMetrics(): CacheMetrics {
  return { ...metrics };
}

/**
 * Reset cache metrics
 */
export function resetCacheMetrics(): void {
  metrics.hits = 0;
  metrics.misses = 0;
  metrics.sets = 0;
  metrics.deletes = 0;
  metrics.errors = 0;
}

/**
 * Calculate cache hit rate
 */
export function getCacheHitRate(): number {
  const total = metrics.hits + metrics.misses;
  if (total === 0) return 0;
  return (metrics.hits / total) * 100;
}

// ============================================================================
// Generic Cache Operations
// ============================================================================

/**
 * Get value from cache
 *
 * @param key - Cache key
 * @param ttl - Cache TTL in seconds
 * @returns Cached value or null if not found
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  return withRedisFallback(
    async (redis) => {
      const value = await redis.get<string>(key);

      if (value === null) {
        recordMiss();
        return null;
      }

      recordHit();
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    },
    () => {
      recordMiss();
      return null;
    },
  );
}

/**
 * Set value in cache
 *
 * @param key - Cache key
 * @param value - Value to cache
 * @param ttl - Cache TTL in seconds
 */
export async function cacheSet<T>(
  key: string,
  value: T,
  ttl: number,
): Promise<void> {
  return withRedisFallback(
    async (redis) => {
      const serialized =
        typeof value === "string" ? value : JSON.stringify(value);
      await redis.set(key, serialized, { ex: ttl });
      recordSet();
    },
    () => {
      // Silent fallback - cache is optional
    },
  );
}

/**
 * Delete value from cache
 *
 * @param key - Cache key
 */
export async function cacheDelete(key: string): Promise<void> {
  return withRedisFallback(
    async (redis) => {
      await redis.del(key);
      recordDelete();
    },
    () => {
      // Silent fallback
    },
  );
}

/**
 * Delete multiple keys matching a pattern
 *
 * @param pattern - Key pattern (e.g., "user:v1:*")
 */
export async function cacheDeletePattern(pattern: string): Promise<void> {
  return withRedisFallback(
    async (redis) => {
      // Scan for keys matching pattern
      let cursor: string | number = "0";
      const keys: string[] = [];

      do {
        const scanResult = (await redis.scan(cursor, {
          match: pattern,
          count: 100,
        })) as [string | number, string[]];
        cursor = scanResult[0];
        keys.push(...(scanResult[1] || []));
      } while (cursor !== 0);

      // Delete all matching keys
      if (keys.length > 0) {
        await redis.del(...keys);
        recordDelete();
      }
    },
    () => {
      // Silent fallback
    },
  );
}

/**
 * Get or set pattern - fetch from cache or compute and store
 *
 * @param key - Cache key
 * @param factory - Function to compute value if not cached
 * @param ttl - Cache TTL in seconds
 * @returns Cached or computed value
 */
export async function cacheGetOrSet<T>(
  key: string,
  factory: () => Promise<T> | T,
  ttl: number,
): Promise<T> {
  // Try to get from cache
  const cached = await cacheGet<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Compute value
  const value = await factory();

  // Store in cache
  await cacheSet(key, value, ttl);

  return value;
}

// ============================================================================
// Geocoding Cache
// ============================================================================

/**
 * Geocoding result structure
 */
export interface GeocodingResult {
  address: string;
  latitude: number;
  longitude: number;
  formattedAddress?: string;
  country?: string;
  city?: string;
  postalCode?: string;
}

/**
 * Generate geocoding cache key from address
 */
function geocodingCacheKey(address: string): string {
  // Normalize address for consistent keys
  const normalized = address.toLowerCase().trim().replace(/\s+/g, " ");
  return `${CACHE_PREFIXES.GEOCODING}${Buffer.from(normalized).toString("base64")}`;
}

/**
 * Get geocoding result from cache
 *
 * @param address - Address string
 * @returns Geocoding result or null
 */
export async function getGeocodingFromCache(
  address: string,
): Promise<GeocodingResult | null> {
  return cacheGet<GeocodingResult>(geocodingCacheKey(address));
}

/**
 * Set geocoding result in cache
 *
 * @param address - Address string
 * @param result - Geocoding result
 */
export async function setGeocodingCache(
  address: string,
  result: GeocodingResult,
): Promise<void> {
  await cacheSet(geocodingCacheKey(address), result, CACHE_TTL.GEOCODING);
}

/**
 * Invalidate geocoding cache for specific address
 *
 * @param address - Address string
 */
export async function invalidateGeocodingCache(address: string): Promise<void> {
  await cacheDelete(geocodingCacheKey(address));
}

// ============================================================================
// Global Cache Operations
// ============================================================================

/**
 * Invalidate all cache (emergency operation)
 * Should only be used by administrators.
 */
export async function invalidateAllCache(): Promise<void> {
  await cacheDeletePattern("*");
}

/**
 * Get cache statistics
 *
 * @returns Cache statistics including hit rate and key counts
 */
export async function getCacheStats(): Promise<{
  metrics: CacheMetrics;
  hitRate: number;
  available: boolean;
}> {
  const available = await isRedisAvailable();

  return {
    metrics: getCacheMetrics(),
    hitRate: getCacheHitRate(),
    available,
  };
}
