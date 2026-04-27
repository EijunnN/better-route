import { type NextRequest, NextResponse } from "next/server";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { setTenantContext } from "@/lib/infra/tenant";
import {
  cleanupDriverLocations,
  DEFAULT_RETENTION_DAYS,
  InvalidRetentionError,
} from "@/lib/maintenance/driver-locations-cleanup";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Purge tracking history older than `retentionDays` for the calling
 * tenant. Thin wrapper over `cleanupDriverLocations` — the actual
 * delete logic lives in `lib/maintenance` so the cron-friendly CLI
 * (`bun run cleanup:locations`) can reuse it without going through
 * HTTP.
 *
 * Permission: METRICS:DELETE_ALL (ADMIN_SISTEMA wildcard only).
 */
export async function POST(request: NextRequest) {
  const authResult = await requireRoutePermission(
    request,
    EntityType.METRICS,
    Action.DELETE_ALL,
  );
  if (authResult instanceof NextResponse) return authResult;
  const tenantCtx = extractTenantContextAuthed(request, authResult);
  if (tenantCtx instanceof NextResponse) return tenantCtx;
  setTenantContext(tenantCtx);

  let retentionDays: number = DEFAULT_RETENTION_DAYS;
  const body = await request.json().catch(() => null);
  if (body && typeof body.retentionDays === "number") {
    retentionDays = body.retentionDays;
  }

  try {
    const result = await cleanupDriverLocations({
      companyId: tenantCtx.companyId,
      retentionDays,
    });
    return NextResponse.json({
      data: {
        deleted: result.deleted,
        cutoff: result.cutoff.toISOString(),
        retentionDays: result.retentionDays,
      },
    });
  } catch (error) {
    if (error instanceof InvalidRetentionError) {
      return NextResponse.json(
        { error: error.message, code: "INVALID_RETENTION" },
        { status: 400 },
      );
    }
    throw error;
  }
}
