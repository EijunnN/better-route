import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationJobs, vehicles } from "@/db/schema";
import { logCreate } from "@/lib/infra/audit";
import { setTenantContext } from "@/lib/infra/tenant";

import { extractTenantContext } from "@/lib/routing/route-helpers";

import { safeParseJson } from "@/lib/utils/safe-json";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { EntityType, Action } from "@/lib/auth/authorization";
/**
 * DELETE - Remove driver assignment from a route
 * This endpoint allows removing a driver assignment for reassignment
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ routeId: string; vehicleId: string }> },
) {
  try {
    const authResult = await requireRoutePermission(request, EntityType.ROUTE, Action.ASSIGN);
    if (authResult instanceof NextResponse) return authResult;

    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

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

    // Get previous driver info for audit log
    let previousDriverId: string | null = null;
    let previousDriverName: string | null = null;

    // Update the job result to remove the driver assignment
    let updatedResult = null;
    if (job.result) {
      try {
        const result = safeParseJson<{ routes?: Array<{ vehicleId?: string; driverId?: string | null; driverName?: string | null; isManualOverride?: boolean; manualAssignmentReason?: string | null; assignmentValidation?: unknown; stops?: Array<{ orderId?: string }> }> }>(job.result);
        // Find the route for this vehicle and remove driver assignment
        if (result.routes) {
          for (const route of result.routes) {
            if (route.vehicleId === vehicleId) {
              // Store previous assignment for audit
              previousDriverId = route.driverId || null;
              previousDriverName = route.driverName || null;

              // Remove driver assignment
              route.driverId = null;
              route.driverName = null;
              route.isManualOverride = false;
              route.manualAssignmentReason = null;
              route.assignmentValidation = null;
              break;
            }
          }
        }

        updatedResult = result;

        // Update the job with the new result
        await db
          .update(optimizationJobs)
          .set({
            result: updatedResult,
            updatedAt: new Date(),
          })
          .where(eq(optimizationJobs.id, routeId));
      } catch (e) {
        console.error("Error updating job result:", e);
        return NextResponse.json(
          { error: "Failed to remove assignment" },
          { status: 500 },
        );
      }
    }

    // Create audit log entry
    await logCreate("DRIVER_ASSIGNMENT", routeId, {
      action: "REMOVE_ASSIGNMENT",
      previousDriverId,
      previousDriverName,
      vehicleId,
      reason: "Driver assignment removed for reassignment",
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
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

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
        const result = safeParseJson<{ routes?: Array<{ vehicleId?: string; driverId?: string | null; driverName?: string | null; isManualOverride?: boolean; manualAssignmentReason?: string | null; stops?: Array<{ orderId?: string }> }> }>(job.result);
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
