import { and, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { reassignmentsHistory, USER_ROLES, users } from "@/db/schema";
import { createAuditLog } from "@/lib/infra/audit";
import { executeReassignment } from "@/lib/routing/reassignment";
import { setTenantContext } from "@/lib/infra/tenant";
import {
  type ExecuteReassignmentSchema,
  executeReassignmentSchema,
} from "@/lib/validations/reassignment";

import { extractTenantContext } from "@/lib/routing/route-helpers";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { EntityType, Action } from "@/lib/auth/authorization";

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
    const authResult = await requireRoutePermission(request, EntityType.REASSIGNMENT, Action.EXECUTE);
    if (authResult instanceof NextResponse) return authResult;

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
        changes: {
          absentDriverId: data.absentDriverId,
          absentDriverName: absentDriver.name,
          reassignmentsCount: data.reassignments.length,
          reassignedStops: result.reassignedStops,
          reassignedRoutes: result.reassignedRoutes,
          jobId: data.jobId,
          reason: data.reason,
          reassignmentHistoryId: result.reassignmentHistoryId,
        },
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
            changes: {
              absentDriverId: data.absentDriverId,
              absentDriverName: absentDriver.name,
              replacementDriverId: reassignment.toDriverId,
              replacementDriverName: replacementDriver.name,
              vehicleId: reassignment.vehicleId,
              stopIds: reassignment.stopIds,
              stopCount: reassignment.stopIds.length,
            },
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
          details: {
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
      { error: "Internal server error" },
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
    const authResult = await requireRoutePermission(request, EntityType.REASSIGNMENT, Action.READ);
    if (authResult instanceof NextResponse) return authResult;

    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Execute independent queries in parallel
    const [absentDrivers, recentReassignments] = await Promise.all([
      // Get count of drivers currently absent
      db.query.users.findMany({
        where: and(
          eq(users.companyId, tenantCtx.companyId),
          eq(users.role, USER_ROLES.CONDUCTOR),
          eq(users.driverStatus, "ABSENT"),
        ),
      }),
      // Get count of active reassignments in last 24 hours
      db.query.reassignmentsHistory.findMany({
        where: and(
          eq(reassignmentsHistory.companyId, tenantCtx.companyId),
          sql`${reassignmentsHistory.executedAt} >= ${yesterday}`,
        ),
      }),
    ]);

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
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
