import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationJobs, routeStops, vehicles } from "@/db/schema";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { logUpdate } from "@/lib/infra/audit";
import { setTenantContext } from "@/lib/infra/tenant";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";
import { safeParseJson } from "@/lib/utils/safe-json";
/**
 * DELETE - Remove driver assignment from a route
 * This endpoint allows removing a driver assignment for reassignment
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ routeId: string; vehicleId: string }> },
) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.ROUTE,
      Action.ASSIGN,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);

    const { routeId, vehicleId } = await params;

    // Verify vehicle exists and belongs to the company
    const vehicle = await db.query.vehicles.findFirst({
      where: eq(vehicles.id, vehicleId),
    });

    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    if (vehicle.companyId !== tenantCtx.companyId) {
      return NextResponse.json(
        { error: "Vehicle does not belong to this company" },
        { status: 403 },
      );
    }

    // Verify the job/route exists and belongs to the company
    const job = await db.query.optimizationJobs.findFirst({
      where: and(
        eq(optimizationJobs.id, routeId),
        eq(optimizationJobs.companyId, tenantCtx.companyId),
      ),
    });

    if (!job) {
      return NextResponse.json(
        { error: "Route/job not found" },
        { status: 404 },
      );
    }

    if (!job.result) {
      return NextResponse.json(
        { error: "Route/job has no result to modify" },
        { status: 409 },
      );
    }

    let previousDriverId: string | null = null;
    let previousDriverName: string | null = null;
    try {
      await db.transaction(async (tx) => {
        // Lock the job row for the duration of the tx so concurrent removes
        // serialize (read-modify-write of the result blob) instead of
        // clobbering each other with a last-write-wins.
        const [locked] = await tx
          .select()
          .from(optimizationJobs)
          .where(
            and(
              eq(optimizationJobs.id, routeId),
              eq(optimizationJobs.companyId, tenantCtx.companyId),
            ),
          )
          .for("update")
          .limit(1);
        if (!locked || !locked.result) throw new Error("NO_RESULT");

        // Once a plan is confirmed it materializes into route_stops, which
        // become the execution source of truth (the driver app reads those,
        // not this blob). Editing the blob then would silently diverge from
        // what the driver sees — force the reassignment flow instead.
        const [materialized] = await tx
          .select({ id: routeStops.id })
          .from(routeStops)
          .where(
            and(
              eq(routeStops.jobId, routeId),
              eq(routeStops.vehicleId, vehicleId),
              eq(routeStops.companyId, tenantCtx.companyId),
            ),
          )
          .limit(1);
        if (materialized) throw new Error("MATERIALIZED");

        // Detach the driver from this vehicle's route inside the FRESH blob
        // (read under the row lock above, never the stale outer read).
        const result = safeParseJson<{
          routes?: Array<{
            vehicleId?: string;
            driverId?: string | null;
            driverName?: string | null;
            isManualOverride?: boolean;
            manualAssignmentReason?: string | null;
            assignmentValidation?: unknown;
            stops?: Array<{ orderId?: string }>;
          }>;
        }>(locked.result);
        if (result.routes) {
          for (const route of result.routes) {
            if (route.vehicleId === vehicleId) {
              previousDriverId = route.driverId || null;
              previousDriverName = route.driverName || null;
              route.driverId = null;
              route.driverName = null;
              route.isManualOverride = false;
              route.manualAssignmentReason = null;
              route.assignmentValidation = null;
              break;
            }
          }
        }

        await tx
          .update(optimizationJobs)
          .set({ result, updatedAt: new Date() })
          .where(eq(optimizationJobs.id, routeId));
      });
    } catch (txError) {
      if (txError instanceof Error && txError.message === "MATERIALIZED") {
        return NextResponse.json(
          {
            error:
              "El plan ya fue confirmado. Usa la reasignación de conductores para cambiar la asignación de esta ruta.",
          },
          { status: 409 },
        );
      }
      if (txError instanceof Error && txError.message === "NO_RESULT") {
        return NextResponse.json(
          { error: "Route/job has no result to modify" },
          { status: 409 },
        );
      }
      console.error("Error updating job result:", txError);
      return NextResponse.json(
        { error: "Failed to remove assignment" },
        { status: 500 },
      );
    }

    await logUpdate("optimization_job", routeId, {
      action: "remove_driver_assignment",
      previousDriverId,
      previousDriverName,
      vehicleId,
    });

    return NextResponse.json({
      data: {
        routeId,
        vehicleId,
        previousDriverId,
        previousDriverName,
        driverRemoved: true,
      },
      meta: {
        removedAt: new Date().toISOString(),
        removedBy: tenantCtx.userId,
      },
    });
  } catch (error) {
    console.error("Error removing driver assignment:", error);
    return NextResponse.json(
      { error: "Error removing driver assignment" },
      { status: 500 },
    );
  }
}

/**
 * GET - Validate before removing assignment
 * Returns information about what would be affected
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ routeId: string; vehicleId: string }> },
) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.ROUTE,
      Action.READ,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);

    const { routeId, vehicleId } = await params;

    // Verify the job/route exists and belongs to the company
    const job = await db.query.optimizationJobs.findFirst({
      where: and(
        eq(optimizationJobs.id, routeId),
        eq(optimizationJobs.companyId, tenantCtx.companyId),
      ),
    });

    if (!job) {
      return NextResponse.json(
        { error: "Route/job not found" },
        { status: 404 },
      );
    }

    // Get current assignment info
    let currentAssignment = null;
    let stopsCount = 0;

    if (job.result) {
      try {
        const result = safeParseJson<{
          routes?: Array<{
            vehicleId?: string;
            driverId?: string | null;
            driverName?: string | null;
            isManualOverride?: boolean;
            manualAssignmentReason?: string | null;
            stops?: Array<{ orderId?: string }>;
          }>;
        }>(job.result);
        if (result.routes) {
          for (const route of result.routes) {
            if (route.vehicleId === vehicleId) {
              currentAssignment = {
                driverId: route.driverId || null,
                driverName: route.driverName || null,
                isManualOverride: route.isManualOverride || false,
                manualAssignmentReason: route.manualAssignmentReason || null,
              };
              stopsCount = route.stops?.length || 0;
              break;
            }
          }
        }
      } catch (e) {
        console.warn("Could not parse job result:", e);
      }
    }

    return NextResponse.json({
      data: {
        routeId,
        vehicleId,
        currentAssignment,
        stopsCount,
        canRemove: true,
      },
    });
  } catch (error) {
    console.error("Error getting remove assignment info:", error);
    return NextResponse.json(
      { error: "Error getting remove assignment info" },
      { status: 500 },
    );
  }
}
