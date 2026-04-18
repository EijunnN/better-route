/**
 * Cache Metrics API Endpoint
 *
 * GET /api/admin/cache    — cache statistics (hit rate, key counts, availability).
 * DELETE /api/admin/cache — invalidate all cache (emergency, admin only).
 *
 * The legacy POST /api/admin/cache "warmup" endpoint was removed along with
 * the dead warmupCache() stub. See docs/cache-audit.md.
 */

import { NextResponse } from "next/server";
import type { AuthenticatedRequest } from "@/lib/infra/api-middleware";
import { withAuthAndAudit } from "@/lib/infra/api-middleware";
import { Action, EntityType, isAdmin } from "@/lib/auth/authorization";
import { getCacheStats, invalidateAllCache } from "@/lib/infra/cache";

/**
 * GET /api/admin/cache
 *
 * Get cache statistics including hit rate, key counts, and availability
 */
export const GET = withAuthAndAudit(
  EntityType.CACHE,
  Action.READ,
  async (_request: AuthenticatedRequest) => {
    const stats = await getCacheStats();

    return NextResponse.json({
      available: stats.available,
      hitRate: stats.hitRate,
      metrics: stats.metrics,
      timestamp: Date.now(),
    });
  },
);

/**
 * DELETE /api/admin/cache
 *
 * Invalidate all cache (emergency operation - admin only)
 */
export const DELETE = withAuthAndAudit(
  EntityType.CACHE,
  Action.DELETE_ALL,
  async (request: AuthenticatedRequest) => {
    // Double-check admin permission
    if (!isAdmin(request.user)) {
      return NextResponse.json(
        { error: "Forbidden. Requires system administrator privileges." },
        { status: 403 },
      );
    }

    await invalidateAllCache();

    return NextResponse.json({
      success: true,
      message: "All cache has been invalidated",
      timestamp: Date.now(),
    });
  },
);

