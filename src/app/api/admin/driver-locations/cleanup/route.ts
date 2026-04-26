import { and, lt } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { driverLocations } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { setTenantContext } from "@/lib/infra/tenant";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_RETENTION_DAYS = 30;
const MIN_RETENTION_DAYS = 7;
const MAX_RETENTION_DAYS = 365;

/**
 * Purge tracking history older than `retentionDays` for the calling
 * tenant. The driver_locations table is append-only and grows fast
 * (~4-5 rows/min per active driver). Without periodic cleanup the
 * monitoring queries degrade and storage cost climbs.
 *
 * Designed to be invoked by an external cron (cron-job.org, GitHub
 * Actions on schedule, etc.) — there is no in-process scheduler.
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

  let retentionDays = DEFAULT_RETENTION_DAYS;
  try {
    const body = await request.json().catch(() => null);
    if (body && typeof body.retentionDays === "number") {
      retentionDays = body.retentionDays;
    }
  } catch {
    /* fall through to default */
  }

  if (
    !Number.isFinite(retentionDays) ||
    retentionDays < MIN_RETENTION_DAYS ||
    retentionDays > MAX_RETENTION_DAYS
  ) {
    return NextResponse.json(
      {
        error: `retentionDays must be between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS}`,
        code: "INVALID_RETENTION",
      },
      { status: 400 },
    );
  }

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const deleted = await db
    .delete(driverLocations)
    .where(
      and(
        withTenantFilter(driverLocations, [], tenantCtx.companyId),
        lt(driverLocations.recordedAt, cutoff),
      ),
    )
    .returning({ id: driverLocations.id });

  return NextResponse.json({
    data: {
      deleted: deleted.length,
      cutoff: cutoff.toISOString(),
      retentionDays,
    },
  });
}
