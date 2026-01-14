import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  optimizationJobs,
  orders,
  USER_ROLES,
  users,
  vehicles,
} from "@/db/schema";
import { logCreate } from "@/lib/audit";
import {
  type AssignmentValidationResult,
  validateDriverAssignment,
} from "@/lib/driver-assignment";
import { setTenantContext } from "@/lib/tenant";
import {
  type ManualDriverAssignmentSchema,
  manualDriverAssignmentSchema,
} from "@/lib/validations/driver-assignment";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");

  if (!companyId) {
    return null;
  }

  return {
    companyId,
    userId: userId || undefined,
  };
}

/**
 * POST - Manually assign a driver to a route
 * This endpoint allows manual override of automatic driver assignments
 */
export async function POST(request: NextRequest) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

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
        const result = JSON.parse(job.result);
        // Extract order IDs from the job result
        // The structure may vary, so we'll handle it flexibly
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
    const hasWarnings = validation.warnings.length > 0;

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

    // Update the job result with the manual assignment
    let updatedResult = null;
    if (job.result) {
      try {
        const result = JSON.parse(job.result);
        // Find the route for this vehicle and update driver assignment
        if (result.routes) {
          for (const route of result.routes) {
            if (route.vehicleId === data.vehicleId) {
              // Update driver assignment
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

        updatedResult = JSON.stringify(result);

        // Update the job with the new result
        await db
          .update(optimizationJobs)
          .set({
            result: updatedResult,
            updatedAt: new Date(),
          })
          .where(eq(optimizationJobs.id, data.routeId));
      } catch (e) {
        console.error("Error updating job result:", e);
        return NextResponse.json(
          { error: "Failed to update assignment" },
          { status: 500 },
        );
      }
    }

    // Create audit log entry
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
    console.error("Error creating manual driver assignment:", error);
    return NextResponse.json(
      { error: "Error creating manual driver assignment" },
      { status: 500 },
    );
  }
}
