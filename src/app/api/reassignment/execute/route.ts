import { and, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { reassignmentsHistory, USER_ROLES, users } from "@/db/schema";
import { createAuditLog } from "@/lib/audit";
import { executeReassignment } from "@/lib/reassignment";
import { setTenantContext } from "@/lib/tenant";
import {
  type ExecuteReassignmentSchema,
  executeReassignmentSchema,
} from "@/lib/validations/reassignment";

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
 * POST /api/reassignment/execute
 *
 * Story 11.3: Ejecución y Registro de Reasignaciones
 *
 * Features:
 * - Atomic execution with rollback in case of error
 * - Immediate monitoring view updates through data synchronization
 * - Complete audit logging and history tracking
 * - Automatic output file regeneration flag
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
    const validationResult = executeReassignmentSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validationResult.error.issues,
        },
        { status: 400 },
      );
    }

    const data: ExecuteReassignmentSchema = validationResult.data;

    // Validate company ID matches
    if (data.companyId !== tenantCtx.companyId) {
      return NextResponse.json(
        { error: "Company ID mismatch" },
        { status: 403 },
      );
    }

    // Validate absent driver exists and belongs to company
    const absentDriver = await db.query.users.findFirst({
      where: and(
        eq(users.id, data.absentDriverId),
        eq(users.companyId, tenantCtx.companyId),
        eq(users.role, USER_ROLES.CONDUCTOR),
      ),
    });

    if (!absentDriver) {
      return NextResponse.json(
        { error: "Absent driver not found" },
        { status: 404 },
      );
    }

    // Execute reassignment with atomic transaction support
    const result = await executeReassignment(
      tenantCtx.companyId,
      data.absentDriverId,
      data.reassignments,
      data.reason,
      data.userId,
      data.jobId,
    );

    // If execution was successful, create additional audit logs
    if (result.success) {
      // Create audit log entry for the entire operation
      await createAuditLog({
        entityType: "reassignment",
        entityId: result.reassignmentHistoryId || data.absentDriverId,
        action: "execute_reassignment",
        changes: JSON.stringify({
          absentDriverId: data.absentDriverId,
          absentDriverName: absentDriver.name,
          reassignmentsCount: data.reassignments.length,
          reassignedStops: result.reassignedStops,
          reassignedRoutes: result.reassignedRoutes,
          jobId: data.jobId,
          reason: data.reason,
          reassignmentHistoryId: result.reassignmentHistoryId,
        }),
      });

      // Create individual audit logs for each reassignment
      for (const reassignment of data.reassignments) {
        const replacementDriver = await db.query.users.findFirst({
          where: and(
            eq(users.id, reassignment.toDriverId),
            eq(users.role, USER_ROLES.CONDUCTOR),
          ),
        });

        if (replacementDriver) {
          await createAuditLog({
            entityType: "route_stop",
            entityId: reassignment.routeId,
            action: "driver_reassignment",
            changes: JSON.stringify({
              absentDriverId: data.absentDriverId,
              absentDriverName: absentDriver.name,
              replacementDriverId: reassignment.toDriverId,
              replacementDriverName: replacementDriver.name,
              vehicleId: reassignment.vehicleId,
              stopIds: reassignment.stopIds,
              stopCount: reassignment.stopIds.length,
            }),
          });
        }
      }

      // Check if output regeneration is requested
      const regenerateOutput = body.regenerateOutput === true;

      return NextResponse.json(
        {
          data: {
            success: true,
            reassignedStops: result.reassignedStops,
            reassignedRoutes: result.reassignedRoutes,
            reassignmentHistoryId: result.reassignmentHistoryId,
            errors: result.errors,
            warnings: result.warnings,
            regenerateOutput,
            outputRegenerationUrl: regenerateOutput
              ? `/api/reassignment/output/${result.reassignmentHistoryId}`
              : undefined,
          },
          meta: {
            absentDriverId: data.absentDriverId,
            absentDriverName: absentDriver.name,
            executedAt: new Date().toISOString(),
            executedBy: data.userId,
            jobId: data.jobId,
          },
        },
        { status: 200 },
      );
    } else {
      // Execution failed - return error details
      return NextResponse.json(
        {
          error: "Reassignment execution failed",
          data: {
            success: false,
            reassignedStops: 0,
            reassignedRoutes: 0,
            errors: result.errors,
            warnings: result.warnings,
          },
          meta: {
            absentDriverId: data.absentDriverId,
            absentDriverName: absentDriver.name,
            executedAt: new Date().toISOString(),
            executedBy: data.userId,
          },
        },
        { status: 400 },
      );
    }
  } catch (error) {
    console.error("Error executing reassignment:", error);
    return NextResponse.json(
      {
        error: "Error executing reassignment",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/reassignment/execute
 *
 * Get status of reassignment capability and available actions
 */
export async function GET(request: NextRequest) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    // Get count of drivers currently absent
    const absentDrivers = await db.query.users.findMany({
      where: and(
        eq(users.companyId, tenantCtx.companyId),
        eq(users.role, USER_ROLES.CONDUCTOR),
        eq(users.driverStatus, "ABSENT"),
      ),
    });

    // Get count of active reassignments in last 24 hours
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentReassignments = await db.query.reassignmentsHistory.findMany({
      where: and(
        eq(reassignmentsHistory.companyId, tenantCtx.companyId),
        sql`${reassignmentsHistory.executedAt} >= ${yesterday}`,
      ),
    });

    return NextResponse.json({
      data: {
        absentDriverCount: absentDrivers.length,
        recentReassignmentCount: recentReassignments.length,
        capabilities: {
          atomicExecution: true,
          rollbackSupport: true,
          auditLogging: true,
          outputRegeneration: true,
          realTimeUpdates: true,
        },
      },
    });
  } catch (error) {
    console.error("Error getting reassignment status:", error);
    return NextResponse.json(
      {
        error: "Error getting reassignment status",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
