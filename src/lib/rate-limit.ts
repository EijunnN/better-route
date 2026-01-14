/**
 * Simple in-memory rate limiter
 * For production, consider using Redis or a dedicated rate limiting service
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const limitStore = new Map<string, RateLimitEntry>();

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

/**
 * Default rate limit configurations
 */
export const RATE_LIMITS = {
  AUTH: { maxRequests: 5, windowMs: 60 * 1000 }, // 5 requests per minute
  API: { maxRequests: 100, windowMs: 60 * 1000 }, // 100 requests per minute
  POLLING: { maxRequests: 60, windowMs: 60 * 1000 }, // 60 requests per minute
} as const;

/**
 * Check if a request should be rate limited
 *
 * @param identifier - Unique identifier (IP address, user ID, etc.)
 * @param config - Rate limit configuration
 * @returns Object with success status and rate limit info
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = RATE_LIMITS.AUTH,
): { success: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const entry = limitStore.get(identifier);

  // Clean up expired entries
  if (entry && entry.resetTime < now) {
    limitStore.delete(identifier);
  }

  const currentEntry = limitStore.get(identifier);

  if (!currentEntry) {
    // First request in window
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
    // Rate limit exceeded
    return {
      success: false,
      remaining: 0,
      resetTime: currentEntry.resetTime,
    };
  }

  // Increment counter
  currentEntry.count += 1;
  return {
    success: true,
    remaining: config.maxRequests - currentEntry.count,
    resetTime: currentEntry.resetTime,
  };
}

/**
 * Reset rate limit for an identifier
 */
export function resetRateLimit(identifier: string): void {
  limitStore.delete(identifier);
}

/**
 * Get rate limit headers for response
 */
export function getRateLimitHeaders(info: {
  remaining: number;
  resetTime: number;
}): Record<string, string> {
  const resetTime = Math.ceil(info.resetTime / 1000);
  return {
    "X-RateLimit-Limit": RATE_LIMITS.AUTH.maxRequests.toString(),
    "X-RateLimit-Remaining": info.remaining.toString(),
    "X-RateLimit-Reset": resetTime.toString(),
  };
}

/**
 * Extract client IP from request
 */
export function getClientIp(request: Request): string {
  // Check various headers for the real IP
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // Fallback to remote address (not available in serverless/edge)
  return "unknown";
}
