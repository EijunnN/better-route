/**
 * Cache Metrics API Endpoint
 *
 * GET /api/admin/cache    — cache statistics (hit rate, key counts, availability).
 * DELETE /api/admin/cache — invalidate all cache (emergency, admin only).
 *
 * Global infra resource: the Redis cache is not tenant-partitioned, so there is
 * no tenancy guard here — only RBAC (`cache:*`, which no legacy role but
 * ADMIN_SISTEMA holds) plus an explicit `isAdmin` re-check on the destructive
 * verb. Allowlisted in scripts/route-guards-allowlist.json for that reason.
 *
 * The legacy POST /api/admin/cache "warmup" endpoint was removed along with
 * the dead warmupCache() stub. See docs/cache-audit.md.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Action, EntityType, isAdmin } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { getCacheStats, invalidateAllCache } from "@/lib/infra/cache";

/**
 * GET /api/admin/cache
 *
 * Get cache statistics including hit rate, key counts, and availability
 */
export async function GET(request: NextRequest) {
  const authResult = await requireRoutePermission(
    request,
    EntityType.CACHE,
    Action.READ,
  );
  if (authResult instanceof NextResponse) return authResult;

  const stats = await getCacheStats();

  return NextResponse.json({
    available: stats.available,
    hitRate: stats.hitRate,
    metrics: stats.metrics,
    timestamp: Date.now(),
  });
}

/**
 * DELETE /api/admin/cache
 *
 * Invalidate all cache (emergency operation - admin only)
 */
export async function DELETE(request: NextRequest) {
  const authResult = await requireRoutePermission(
    request,
    EntityType.CACHE,
    Action.DELETE_ALL,
  );
  if (authResult instanceof NextResponse) return authResult;

  // Double-check admin permission
  if (!isAdmin(authResult)) {
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
}
