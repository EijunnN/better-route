import { and, eq, inArray, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  optimizationConfigurations,
  optimizationJobs,
  orders,
  routeStops,
} from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { logDelete, logUpdate } from "@/lib/infra/audit";
import { forceReleaseCompanyLock } from "@/lib/infra/job-queue";
import { hasPgErrorCode, PG_DEADLOCK_DETECTED } from "@/lib/infra/pg-errors";
import { setTenantContext } from "@/lib/infra/tenant";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";
import { safeParseJson } from "@/lib/utils/safe-json";
import { optimizationConfigUpdateSchema } from "@/lib/validations/optimization-config";
// GET - Get single optimization configuration
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.OPTIMIZATION_CONFIG,
      Action.READ,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);
    const { id } = await params;

    const [config] = await db
      .select()
      .from(optimizationConfigurations)
      .where(
        and(
          eq(optimizationConfigurations.id, id),
          withTenantFilter(optimizationConfigurations, [], tenantCtx.companyId),
        ),
      )
      .limit(1);

    if (!config) {
      return NextResponse.json(
        { error: "Configuration not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: config });
  } catch (error) {
    console.error("Error fetching optimization configuration:", error);
    return NextResponse.json(
      { error: "Failed to fetch configuration" },
      { status: 500 },
    );
  }
}

// PATCH - Update optimization configuration
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireRoutePermission(
    request,
    EntityType.OPTIMIZATION_CONFIG,
    Action.UPDATE,
  );
  if (authResult instanceof NextResponse) return authResult;
  const tenantCtx = extractTenantContextAuthed(request, authResult);
  if (tenantCtx instanceof NextResponse) return tenantCtx;
  setTenantContext(tenantCtx);
  const { id } = await params;

  try {
    const body = await request.json();
    const data = optimizationConfigUpdateSchema.parse(body);

    // Check if configuration exists
    const [existing] = await db
      .select()
      .from(optimizationConfigurations)
      .where(
        and(
          eq(optimizationConfigurations.id, id),
          withTenantFilter(optimizationConfigurations, [], tenantCtx.companyId),
        ),
      )
      .limit(1);

    if (!existing) {
      return NextResponse.json(
        { error: "Configuration not found" },
        { status: 404 },
      );
    }

    // Don't allow updates to configurations that are already being processed
    if (existing.status === "OPTIMIZING") {
      return NextResponse.json(
        {
          error:
            "Cannot modify configuration while optimization is in progress",
        },
        { status: 400 },
      );
    }

    // Check if there are any RUNNING jobs for this configuration
    const runningJobs = await db
      .select({ id: optimizationJobs.id })
      .from(optimizationJobs)
      .where(
        and(
          eq(optimizationJobs.configurationId, id),
          eq(optimizationJobs.status, "RUNNING"),
        ),
      )
      .limit(1);

    if (runningJobs.length > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot modify configuration while an optimization job is running.",
        },
        { status: 409 },
      );
    }

    // Separate selected*Ids and parse if strings
    const {
      selectedVehicleIds,
      selectedDriverIds,
      selectedOrderIds,
      ...restData
    } = data;

    // Update configuration
    const [updated] = await db
      .update(optimizationConfigurations)
      .set({
        ...restData,
        ...(selectedVehicleIds !== undefined && {
          selectedVehicleIds:
            typeof selectedVehicleIds === "string"
              ? safeParseJson<string[]>(selectedVehicleIds)
              : selectedVehicleIds,
        }),
        ...(selectedOrderIds !== undefined && {
          selectedOrderIds:
            typeof selectedOrderIds === "string"
              ? safeParseJson<string[]>(selectedOrderIds)
              : selectedOrderIds,
        }),
        ...(selectedDriverIds !== undefined && {
          selectedDriverIds:
            typeof selectedDriverIds === "string"
              ? safeParseJson<string[]>(selectedDriverIds)
              : selectedDriverIds,
        }),
        updatedAt: new Date(),
      })
      .where(eq(optimizationConfigurations.id, id))
      .returning();

    // Log update
    await logUpdate("optimization_configuration", id, {
      changes: data,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof Error && "name" in error) {
      return NextResponse.json(
        { error: "Validation error", details: error },
        { status: 400 },
      );
    }
    console.error("Error updating optimization configuration:", error);
    return NextResponse.json(
      { error: "Failed to update configuration" },
      { status: 500 },
    );
  }
}

// DELETE - Delete optimization configuration
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.OPTIMIZATION_CONFIG,
      Action.DELETE,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);
    const { id } = await params;

    // Check if configuration exists
    const [existing] = await db
      .select()
      .from(optimizationConfigurations)
      .where(
        and(
          eq(optimizationConfigurations.id, id),
          withTenantFilter(optimizationConfigurations, [], tenantCtx.companyId),
        ),
      )
      .limit(1);

    if (!existing) {
      return NextResponse.json(
        { error: "Configuration not found" },
        { status: 404 },
      );
    }

    // Don't allow deletion of configurations that are being processed
    if (existing.status === "OPTIMIZING") {
      return NextResponse.json(
        {
          error:
            "Cannot delete configuration while optimization is in progress",
        },
        { status: 400 },
      );
    }

    // Revert + delete run in one tx behind the per-company advisory lock
    // (the same serialization point confirm takes): without it, the revert
    // could flip an ASSIGNED that a concurrent confirm of ANOTHER plan just
    // set, leaving a PENDING order with a live stop from that plan.
    let ordersReverted = 0;
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${tenantCtx.companyId}))`,
      );

      if (existing.status === "CONFIRMED") {
        // Revert only orders whose ACTIVE stop belongs to this config's
        // jobs — not the persisted result blob, which is a plan-time
        // snapshot: an order can have since moved on to another plan.
        const activeStopOrders = await tx
          .select({ orderId: routeStops.orderId })
          .from(routeStops)
          .innerJoin(
            optimizationJobs,
            eq(routeStops.jobId, optimizationJobs.id),
          )
          .where(
            and(
              eq(optimizationJobs.configurationId, id),
              eq(routeStops.companyId, tenantCtx.companyId),
              inArray(routeStops.status, ["PENDING", "IN_PROGRESS"]),
            ),
          );

        // Sorted for stable lock order against other bulk order writers.
        const orderIds = [
          ...new Set(activeStopOrders.map((s) => s.orderId)),
        ].sort();

        if (orderIds.length > 0) {
          const reverted = await tx
            .update(orders)
            .set({ status: "PENDING", updatedAt: new Date() })
            .where(
              and(
                inArray(orders.id, orderIds),
                eq(orders.companyId, tenantCtx.companyId),
                eq(orders.status, "ASSIGNED"),
              ),
            )
            .returning({ id: orders.id });
          ordersReverted = reverted.length;
        }
      }

      // Cascades to jobs → route_stops → history, plan_metrics, etc.
      await tx
        .delete(optimizationConfigurations)
        .where(eq(optimizationConfigurations.id, id));
    });

    // Release any optimization lock held for this company
    forceReleaseCompanyLock(tenantCtx.companyId);

    // Log deletion
    await logDelete("optimization_configuration", id, {
      name: existing.name,
      ordersReverted,
    });

    return NextResponse.json({ success: true, ordersReverted });
  } catch (error) {
    // Deadlock against another bulk order writer: clean rollback, retryable.
    if (hasPgErrorCode(error, PG_DEADLOCK_DETECTED)) {
      return NextResponse.json(
        {
          error:
            "The deletion collided with a concurrent operation on the same orders. Retry the deletion.",
          retryable: true,
        },
        { status: 409 },
      );
    }
    console.error("Error deleting optimization configuration:", error);
    return NextResponse.json(
      { error: "Failed to delete configuration" },
      { status: 500 },
    );
  }
}
