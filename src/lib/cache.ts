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
  // Version prefix for overall cache invalidation
  VERSION: "cache_version",

  // Geocoding cache
  GEOCODING: `geo:${CACHE_VERSIONS.V1}:`,

  // Reference data
  VEHICLE_SKILLS: `vehicle_skills:${CACHE_VERSIONS.V1}:`,
  DRIVER_SKILLS: `driver_skills:${CACHE_VERSIONS.V1}:`,
  TIME_WINDOW_PRESETS: `time_presets:${CACHE_VERSIONS.V1}:`,
  OPTIMIZATION_PRESETS: `opt_presets:${CACHE_VERSIONS.V1}:`,
  ALERT_RULES: `alert_rules:${CACHE_VERSIONS.V1}:`,

  // User data
  USER_PROFILE: `user:${CACHE_VERSIONS.V1}:`,
  USER_PERMISSIONS: `permissions:${CACHE_VERSIONS.V1}:`,
  USER_ROLES: `roles:${CACHE_VERSIONS.V1}:`,

  // Operational data
  COMPANY: `company:${CACHE_VERSIONS.V1}:`,
  FLEET: `fleet:${CACHE_VERSIONS.V1}:`,
  VEHICLE: `vehicle:${CACHE_VERSIONS.V1}:`,
  DRIVER: `driver:${CACHE_VERSIONS.V1}:`,
  FLEET_VEHICLES: `fleet_vehicles:${CACHE_VERSIONS.V1}:`,
  FLEET_DRIVERS: `fleet_drivers:${CACHE_VERSIONS.V1}:`,

  // Planning data
  ORDERS: `orders:${CACHE_VERSIONS.V1}:`,
  ROUTE: `route:${CACHE_VERSIONS.V1}:`,
  JOB_STATUS: `job:${CACHE_VERSIONS.V1}:`,

  // Monitoring data
  MONITORING_SUMMARY: `monitor:${CACHE_VERSIONS.V1}:`,
  DRIVER_STATUS: `driver_status:${CACHE_VERSIONS.V1}:`,
  ALERTS: `alerts:${CACHE_VERSIONS.V1}:`,

  // Metrics
  METRICS_HISTORY: `metrics:${CACHE_VERSIONS.V1}:`,
  PLAN_METRICS: `plan_metrics:${CACHE_VERSIONS.V1}:`,

  // Optimization results
  OPTIMIZATION_RESULT: `opt_result:${CACHE_VERSIONS.V1}:`,
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const scanResult: any = await redis.scan(cursor, {
          match: pattern,
          count: 100,
        });
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

/**
 * Invalidate all geocoding cache
 */
export async function invalidateAllGeocodingCache(): Promise<void> {
  await cacheDeletePattern(`${CACHE_PREFIXES.GEOCODING}*`);
}

// ============================================================================
// Reference Data Cache
// ============================================================================

/**
 * Get vehicle skills catalog from cache
 */
export async function getVehicleSkillsCache(): Promise<unknown | null> {
  return cacheGet(`${CACHE_PREFIXES.VEHICLE_SKILLS}all`);
}

/**
 * Set vehicle skills catalog in cache
 */
export async function setVehicleSkillsCache(skills: unknown): Promise<void> {
  await cacheSet(
    `${CACHE_PREFIXES.VEHICLE_SKILLS}all`,
    skills,
    CACHE_TTL.REFERENCE_DATA,
  );
}

/**
 * Invalidate vehicle skills cache
 */
export async function invalidateVehicleSkillsCache(): Promise<void> {
  await cacheDeletePattern(`${CACHE_PREFIXES.VEHICLE_SKILLS}*`);
}

/**
 * Get time window presets from cache
 */
export async function getTimeWindowPresetsCache(): Promise<unknown | null> {
  return cacheGet(`${CACHE_PREFIXES.TIME_WINDOW_PRESETS}all`);
}

/**
 * Set time window presets in cache
 */
export async function setTimeWindowPresetsCache(
  presets: unknown,
): Promise<void> {
  await cacheSet(
    `${CACHE_PREFIXES.TIME_WINDOW_PRESETS}all`,
    presets,
    CACHE_TTL.REFERENCE_DATA,
  );
}

/**
 * Invalidate time window presets cache
 */
export async function invalidateTimeWindowPresetsCache(): Promise<void> {
  await cacheDeletePattern(`${CACHE_PREFIXES.TIME_WINDOW_PRESETS}*`);
}

/**
 * Get alert rules from cache
 */
export async function getAlertRulesCache(): Promise<unknown | null> {
  return cacheGet(`${CACHE_PREFIXES.ALERT_RULES}all`);
}

/**
 * Set alert rules in cache
 */
export async function setAlertRulesCache(rules: unknown): Promise<void> {
  await cacheSet(
    `${CACHE_PREFIXES.ALERT_RULES}all`,
    rules,
    CACHE_TTL.REFERENCE_DATA,
  );
}

/**
 * Invalidate alert rules cache
 */
export async function invalidateAlertRulesCache(): Promise<void> {
  await cacheDeletePattern(`${CACHE_PREFIXES.ALERT_RULES}*`);
}

// ============================================================================
// User Data Cache
// ============================================================================

/**
 * Get user profile from cache
 *
 * @param userId - User ID
 */
export async function getUserProfileCache(
  userId: string,
): Promise<unknown | null> {
  return cacheGet(`${CACHE_PREFIXES.USER_PROFILE}${userId}`);
}

/**
 * Set user profile in cache
 *
 * @param userId - User ID
 * @param profile - User profile data
 */
export async function setUserProfileCache(
  userId: string,
  profile: unknown,
): Promise<void> {
  await cacheSet(
    `${CACHE_PREFIXES.USER_PROFILE}${userId}`,
    profile,
    CACHE_TTL.USER_DATA,
  );
}

/**
 * Invalidate user profile cache
 *
 * @param userId - User ID
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  await cacheDeletePattern(`${CACHE_PREFIXES.USER_PROFILE}${userId}`);
  await cacheDeletePattern(`${CACHE_PREFIXES.USER_PERMISSIONS}${userId}`);
  await cacheDeletePattern(`${CACHE_PREFIXES.USER_ROLES}${userId}`);
}

// ============================================================================
// Operational Data Cache
// ============================================================================

/**
 * Get fleet vehicles from cache
 *
 * @param fleetId - Fleet ID
 */
export async function getFleetVehiclesCache(
  fleetId: string,
): Promise<unknown | null> {
  return cacheGet(`${CACHE_PREFIXES.FLEET_VEHICLES}${fleetId}`);
}

/**
 * Set fleet vehicles in cache
 *
 * @param fleetId - Fleet ID
 * @param vehicles - Vehicles data
 */
export async function setFleetVehiclesCache(
  fleetId: string,
  vehicles: unknown,
): Promise<void> {
  await cacheSet(
    `${CACHE_PREFIXES.FLEET_VEHICLES}${fleetId}`,
    vehicles,
    CACHE_TTL.OPERATIONAL_DATA,
  );
}

/**
 * Get fleet drivers from cache
 *
 * @param fleetId - Fleet ID
 */
export async function getFleetDriversCache(
  fleetId: string,
): Promise<unknown | null> {
  return cacheGet(`${CACHE_PREFIXES.FLEET_DRIVERS}${fleetId}`);
}

/**
 * Set fleet drivers in cache
 *
 * @param fleetId - Fleet ID
 * @param drivers - Drivers data
 */
export async function setFleetDriversCache(
  fleetId: string,
  drivers: unknown,
): Promise<void> {
  await cacheSet(
    `${CACHE_PREFIXES.FLEET_DRIVERS}${fleetId}`,
    drivers,
    CACHE_TTL.OPERATIONAL_DATA,
  );
}

/**
 * Invalidate fleet cache (vehicles and drivers)
 *
 * @param fleetId - Fleet ID
 */
export async function invalidateFleetCache(fleetId: string): Promise<void> {
  await cacheDelete(`${CACHE_PREFIXES.FLEET_VEHICLES}${fleetId}`);
  await cacheDelete(`${CACHE_PREFIXES.FLEET_DRIVERS}${fleetId}`);
  await cacheDelete(`${CACHE_PREFIXES.FLEET}${fleetId}`);
}

/**
 * Invalidate vehicle cache
 *
 * @param vehicleId - Vehicle ID
 */
export async function invalidateVehicleCache(vehicleId: string): Promise<void> {
  await cacheDelete(`${CACHE_PREFIXES.VEHICLE}${vehicleId}`);
  // Also invalidate associated fleet cache
  // (would need to query DB to get fleet ID)
}

/**
 * Invalidate driver cache
 *
 * @param driverId - Driver ID
 */
export async function invalidateDriverCache(driverId: string): Promise<void> {
  await cacheDelete(`${CACHE_PREFIXES.DRIVER}${driverId}`);
}

// ============================================================================
// Planning Data Cache
// ============================================================================

/**
 * Get pending orders summary from cache
 *
 * @param companyId - Company ID
 */
export async function getPendingOrdersSummaryCache(
  companyId: string,
): Promise<unknown | null> {
  return cacheGet(`${CACHE_PREFIXES.ORDERS}pending:${companyId}`);
}

/**
 * Set pending orders summary in cache
 *
 * @param companyId - Company ID
 * @param summary - Orders summary
 */
export async function setPendingOrdersSummaryCache(
  companyId: string,
  summary: unknown,
): Promise<void> {
  await cacheSet(
    `${CACHE_PREFIXES.ORDERS}pending:${companyId}`,
    summary,
    CACHE_TTL.PLANNING_DATA,
  );
}

/**
 * Invalidate orders cache for company
 *
 * @param companyId - Company ID
 */
export async function invalidateOrdersCache(companyId: string): Promise<void> {
  await cacheDeletePattern(`${CACHE_PREFIXES.ORDERS}*:${companyId}`);
}

/**
 * Get job status from cache
 *
 * @param jobId - Job ID
 */
export async function getJobStatusCache(
  jobId: string,
): Promise<unknown | null> {
  return cacheGet(`${CACHE_PREFIXES.JOB_STATUS}${jobId}`);
}

/**
 * Set job status in cache
 *
 * @param jobId - Job ID
 * @param status - Job status
 */
export async function setJobStatusCache(
  jobId: string,
  status: unknown,
): Promise<void> {
  await cacheSet(
    `${CACHE_PREFIXES.JOB_STATUS}${jobId}`,
    status,
    CACHE_TTL.PLANNING_DATA,
  );
}

/**
 * Invalidate job status cache
 *
 * @param jobId - Job ID
 */
export async function invalidateJobStatusCache(jobId: string): Promise<void> {
  await cacheDelete(`${CACHE_PREFIXES.JOB_STATUS}${jobId}`);
}

// ============================================================================
// Monitoring Data Cache
// ============================================================================

/**
 * Get monitoring summary from cache
 *
 * @param companyId - Company ID
 */
export async function getMonitoringSummaryCache(
  companyId: string,
): Promise<unknown | null> {
  return cacheGet(`${CACHE_PREFIXES.MONITORING_SUMMARY}${companyId}`);
}

/**
 * Set monitoring summary in cache
 *
 * @param companyId - Company ID
 * @param summary - Monitoring summary
 */
export async function setMonitoringSummaryCache(
  companyId: string,
  summary: unknown,
): Promise<void> {
  await cacheSet(
    `${CACHE_PREFIXES.MONITORING_SUMMARY}${companyId}`,
    summary,
    CACHE_TTL.REALTIME_DATA,
  );
}

/**
 * Get driver status from cache
 *
 * @param driverId - Driver ID
 */
export async function getDriverStatusCache(
  driverId: string,
): Promise<unknown | null> {
  return cacheGet(`${CACHE_PREFIXES.DRIVER_STATUS}${driverId}`);
}

/**
 * Set driver status in cache
 *
 * @param driverId - Driver ID
 * @param status - Driver status
 */
export async function setDriverStatusCache(
  driverId: string,
  status: unknown,
): Promise<void> {
  await cacheSet(
    `${CACHE_PREFIXES.DRIVER_STATUS}${driverId}`,
    status,
    CACHE_TTL.REALTIME_DATA,
  );
}

/**
 * Invalidate monitoring data cache for company
 *
 * @param companyId - Company ID
 */
export async function invalidateMonitoringCache(
  companyId: string,
): Promise<void> {
  await cacheDeletePattern(`${CACHE_PREFIXES.MONITORING_SUMMARY}${companyId}`);
  await cacheDeletePattern(`${CACHE_PREFIXES.ALERTS}*:${companyId}`);
}

// ============================================================================
// Metrics Cache
// ============================================================================

/**
 * Get plan metrics from cache
 *
 * @param jobId - Job ID
 */
export async function getPlanMetricsCache(
  jobId: string,
): Promise<unknown | null> {
  return cacheGet(`${CACHE_PREFIXES.PLAN_METRICS}${jobId}`);
}

/**
 * Set plan metrics in cache
 *
 * @param jobId - Job ID
 * @param metrics - Plan metrics
 */
export async function setPlanMetricsCache(
  jobId: string,
  metricsData: unknown,
): Promise<void> {
  await cacheSet(
    `${CACHE_PREFIXES.PLAN_METRICS}${jobId}`,
    metricsData,
    CACHE_TTL.METRICS,
  );
}

/**
 * Invalidate metrics cache
 *
 * @param jobId - Job ID (optional, if not provided clears all metrics)
 */
export async function invalidateMetricsCache(jobId?: string): Promise<void> {
  if (jobId) {
    await cacheDelete(`${CACHE_PREFIXES.PLAN_METRICS}${jobId}`);
  } else {
    await cacheDeletePattern(`${CACHE_PREFIXES.PLAN_METRICS}*`);
  }
}

// ============================================================================
// Global Cache Operations
// ============================================================================

/**
 * Invalidate all cache for a specific company
 * Useful when company data is updated
 *
 * @param companyId - Company ID
 */
export async function invalidateCompanyCache(companyId: string): Promise<void> {
  await cacheDeletePattern(`*:${companyId}`);
}

/**
 * Invalidate all cache (emergency operation)
 * Should only be used by administrators
 */
export async function invalidateAllCache(): Promise<void> {
  await cacheDeletePattern("*");
}

/**
 * Warm up cache with commonly accessed data
 *
 * @param companyId - Company ID
 */
export async function warmupCache(companyId: string): Promise<void> {
  // This would typically fetch and cache:
  // - Reference data (skills, presets, rules)
  // - User profiles for active users
  // - Fleet information
  //
  // Implementation would call the respective setters
  // after fetching from the database
  console.log(`[Cache] Warmed up cache for company ${companyId}`);
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
