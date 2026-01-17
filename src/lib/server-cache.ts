import { cache } from "react";
import { LRUCache } from "lru-cache";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";

/**
 * React.cache() wrapped function for per-request deduplication.
 * Multiple calls within the same request will only execute once.
 */
export const getCompanyId = cache(async (): Promise<string | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload || payload.type !== "access") return null;

  return payload.companyId;
});

/**
 * LRU Cache for cross-request caching.
 * Useful for data that doesn't change frequently.
 */

// Generic entity cache with 5 minute TTL
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const entityCache = new LRUCache<string, any>({
  max: 500,
  ttl: 5 * 60 * 1000, // 5 minutes
});

// Shorter TTL cache for more dynamic data (1 minute)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const shortCache = new LRUCache<string, any>({
  max: 200,
  ttl: 60 * 1000, // 1 minute
});

/**
 * Get or set cached value with automatic fetching
 */
export async function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: { ttl?: "short" | "normal" } = {}
): Promise<T> {
  const cacheInstance = options.ttl === "short" ? shortCache : entityCache;

  const cached = cacheInstance.get(key) as T | undefined;
  if (cached !== undefined) {
    return cached;
  }

  const value = await fetcher();
  cacheInstance.set(key, value);
  return value;
}

/**
 * Invalidate cache entry
 */
export function invalidateCache(key: string): void {
  entityCache.delete(key);
  shortCache.delete(key);
}

/**
 * Invalidate cache entries by prefix
 */
export function invalidateCacheByPrefix(prefix: string): void {
  for (const key of entityCache.keys()) {
    if (key.startsWith(prefix)) {
      entityCache.delete(key);
    }
  }
  for (const key of shortCache.keys()) {
    if (key.startsWith(prefix)) {
      shortCache.delete(key);
    }
  }
}

/**
 * Clear all caches
 */
export function clearAllCaches(): void {
  entityCache.clear();
  shortCache.clear();
}
