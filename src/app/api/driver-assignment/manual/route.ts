import { and, eq } from "drizzle-orm";
import { after, type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  optimizationJobs,
  routeStops as routeStopsTable,
  USER_ROLES,
  users,
  vehicles,
} from "@/db/schema";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { logCreate } from "@/lib/infra/audit";
import { setTenantContext } from "@/lib/infra/tenant";
import {
  type AssignmentValidationResult,
  validateDriverAssignment,
} from "@/lib/routing/driver-assignment";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";
import { safeParseJson } from "@/lib/utils/safe-json";
import {
  type ManualDriverAssignmentSchema,
  manualDriverAssignmentSchema,
} from "@/lib/validations/driver-assignment";
/**
 * POST - Manually assign a driver to a route
 * This endpoint allows manual override of automatic driver assignments
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json();

    // Validate request body
    const validationResult = manualDriverAssignmentSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validationResult.error.issues,
        },
        { status: 400 },
      );
    }

    const data: ManualDriverAssignmentSchema = validationResult.data;

    // Verify all entities belong to the company (driver is user with CONDUCTOR role)
    const [driver, vehicle] = await Promise.all([
      db.query.users.findFirst({
        where: and(
          eq(users.id, data.driverId),
          eq(users.companyId, tenantCtx.companyId),
          eq(users.role, USER_ROLES.CONDUCTOR),
        ),
      }),
      db.query.vehicles.findFirst({
        where: eq(vehicles.id, data.vehicleId),
      }),
    ]);

    if (!driver) {
      return NextResponse.json({ error: "Driver not found" }, { status: 404 });
    }

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
        eq(optimizationJobs.id, data.routeId),
        eq(optimizationJobs.companyId, tenantCtx.companyId),
      ),
    });

    if (!job) {
      return NextResponse.json(
        { error: "Route/job not found" },
        { status: 404 },
      );
    }

    // Validate orders belong to company (we need to extract them from job result)
    const routeStops: Array<{ orderId: string; promisedDate?: Date | null }> =
      [];
    if (job.result) {
      try {
        const result = safeParseJson<{
          routes?: Array<{
            stops?: Array<{ orderId?: string; promisedDate?: string }>;
          }>;
        }>(job.result);
        if (result.routes) {
          for (const route of result.routes) {
            if (route.stops) {
              for (const stop of route.stops) {
                if (stop.orderId) {
                  routeStops.push({
                    orderId: stop.orderId,
                    promisedDate: stop.promisedDate
                      ? new Date(stop.promisedDate)
                      : undefined,
                  });
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn("Could not parse job result:", e);
      }
    }

    // Perform validation
    const validation: AssignmentValidationResult =
      await validateDriverAssignment(
        tenantCtx.companyId,
        data.driverId,
        data.vehicleId,
        routeStops,
      );

    // Check if we should proceed despite warnings
    const hasBlockingErrors = validation.errors.length > 0;
    const _hasWarnings = validation.warnings.length > 0;

    if (hasBlockingErrors && !data.overrideWarnings) {
      return NextResponse.json(
        {
          error: "Assignment validation failed",
          validation: {
            isValid: false,
            errors: validation.errors,
            warnings: validation.warnings,
          },
        },
        { status: 400 },
      );
    }

    // Update the job result with the manual assignment — atomic + row-locked,
    // so a concurrent assign/remove can't clobber the blob, and a confirmed
    // plan (already materialized into route_stops) can't be silently diverged.
    if (job.result) {
      try {
        await db.transaction(async (tx) => {
          const [locked] = await tx
            .select()
            .from(optimizationJobs)
            .where(
              and(
                eq(optimizationJobs.id, data.routeId),
                eq(optimizationJobs.companyId, tenantCtx.companyId),
              ),
            )
            .for("update")
            .limit(1);
          if (!locked || !locked.result) throw new Error("NO_RESULT");

          // Once the route is materialized into route_stops it is in execution
          // (the driver app reads those, not this blob) — force reassignment.
          const [materialized] = await tx
            .select({ id: routeStopsTable.id })
            .from(routeStopsTable)
            .where(
              and(
                eq(routeStopsTable.jobId, data.routeId),
                eq(routeStopsTable.vehicleId, data.vehicleId),
                eq(routeStopsTable.companyId, tenantCtx.companyId),
              ),
            )
            .limit(1);
          if (materialized) throw new Error("MATERIALIZED");

          const result = safeParseJson<{
            routes?: Array<{
              vehicleId?: string;
              driverId?: string;
              driverName?: string;
              isManualOverride?: boolean;
              manualAssignmentReason?: string;
              assignmentValidation?: unknown;
            }>;
          }>(locked.result);
          if (result.routes) {
            for (const route of result.routes) {
              if (route.vehicleId === data.vehicleId) {
                route.driverId = data.driverId;
                route.driverName = driver.name;
                route.isManualOverride = true;
                route.manualAssignmentReason = data.reason;
                route.assignmentValidation = {
                  isValid: validation.isValid,
                  errors: validation.errors,
                  warnings: validation.warnings,
                };
                break;
              }
            }
          }

          await tx
            .update(optimizationJobs)
            .set({ result, updatedAt: new Date() })
            .where(eq(optimizationJobs.id, data.routeId));
        });
      } catch (e) {
        if (e instanceof Error && e.message === "MATERIALIZED") {
          return NextResponse.json(
            {
              error:
                "El plan ya fue confirmado. Usa la reasignación de conductores para cambiar la asignación de esta ruta.",
            },
            { status: 409 },
          );
        }
        console.error("Error updating job result:", e);
        return NextResponse.json(
          { error: "Failed to update assignment" },
          { status: 500 },
        );
      }
    }

    // Create audit log entry (non-blocking)
    after(async () => {
      await logCreate("DRIVER_ASSIGNMENT", data.routeId, {
        action: "MANUAL_ASSIGNMENT",
        driverId: data.driverId,
        driverName: driver.name,
        vehicleId: data.vehicleId,
        reason: data.reason,
        overrideWarnings: data.overrideWarnings,
        validation: {
          isValid: validation.isValid,
          errors: validation.errors,
          warnings: validation.warnings,
        },
      });
    });

    return NextResponse.json({
      data: {
        routeId: data.routeId,
        driverId: data.driverId,
        driverName: driver.name,
        vehicleId: data.vehicleId,
        isManualOverride: true,
        validation: {
          isValid: validation.isValid,
          errors: validation.errors,
          warnings: validation.warnings,
        },
      },
      meta: {
        assignedAt: new Date().toISOString(),
        assignedBy: tenantCtx.userId,
      },
    });
  } catch (error) {
    after(() =>
      console.error("Error creating manual driver assignment:", error),
    );
    return NextResponse.json(
      { error: "Error creating manual driver assignment" },
      { status: 500 },
    );
  }
}
