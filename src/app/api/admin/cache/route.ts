/**
 * Cache Metrics API Endpoint
 *
 * GET /api/admin/cache - Get cache statistics
 * DELETE /api/admin/cache - Invalidate all cache (admin only)
 * POST /api/admin/cache/warmup - Warm up cache for a company
 *
 * Implements Story 17.2 - Cache metrics monitoring
 */

import { NextResponse } from "next/server";
import type { AuthenticatedRequest } from "@/lib/api-middleware";
import { withAuthAndAudit } from "@/lib/api-middleware";
import { Action, EntityType, isAdmin } from "@/lib/authorization";
import { getCacheStats, invalidateAllCache, warmupCache } from "@/lib/cache";

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

/**
 * POST /api/admin/cache/warmup
 *
 * Warm up cache for a company
 */
export const POST = withAuthAndAudit(
  EntityType.CACHE,
  Action.WARMUP,
  async (request: AuthenticatedRequest) => {
    try {
      const body = await request.json();
      const { companyId } = body;

      if (!companyId) {
        return NextResponse.json(
          { error: "companyId is required" },
          { status: 400 },
        );
      }

      await warmupCache(companyId);

      return NextResponse.json({
        success: true,
        message: `Cache warmed up for company ${companyId}`,
        companyId,
        timestamp: Date.now(),
      });
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }
  },
);
