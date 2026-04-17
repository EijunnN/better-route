import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  reassignmentsHistory,
  routeStops,
  USER_ROLES,
  users,
} from "@/db/schema";
import type {
  ExecuteReassignmentResult,
  ReassignmentOperation,
} from "./types";

export async function executeReassignment(
  companyId: string,
  absentDriverId: string,
  reassignments: Array<{
    routeId: string;
    vehicleId: string;
    toDriverId: string;
    stopIds: string[];
  }>,
  reason?: string,
  userId?: string,
  jobId?: string,
): Promise<ExecuteReassignmentResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let reassignedStops = 0;
  let reassignedRoutes = 0;
  let reassignmentHistoryId: string | undefined;

  // Get absent driver (user with CONDUCTOR role) info for audit/history
  const absentDriver = await db.query.users.findFirst({
    where: and(
      eq(users.companyId, companyId),
      eq(users.id, absentDriverId),
      eq(users.role, USER_ROLES.CONDUCTOR),
    ),
  });

  if (!absentDriver) {
    return {
      success: false,
      reassignedStops: 0,
      reassignedRoutes: 0,
      errors: ["Absent driver not found"],
    };
  }

  // Prepare operations with driver names
  const operations: ReassignmentOperation[] = [];

  for (const reassignment of reassignments) {
    const replacementDriver = await db.query.users.findFirst({
      where: and(
        eq(users.companyId, companyId),
        eq(users.id, reassignment.toDriverId),
        eq(users.role, USER_ROLES.CONDUCTOR),
      ),
    });

    if (!replacementDriver) {
      errors.push(`Replacement driver ${reassignment.toDriverId} not found`);
      continue;
    }

    // Validate driver availability
    if (
      replacementDriver.driverStatus === "UNAVAILABLE" ||
      replacementDriver.driverStatus === "ABSENT"
    ) {
      errors.push(
        `Replacement driver ${replacementDriver.name} is not available`,
      );
      continue;
    }

    // Capture current state for potential rollback
    const currentStops = await db.query.routeStops.findMany({
      where: and(
        eq(routeStops.companyId, companyId),
        eq(routeStops.routeId, reassignment.routeId),
        eq(routeStops.vehicleId, reassignment.vehicleId),
        eq(routeStops.userId, absentDriverId),
        inArray(routeStops.id, reassignment.stopIds),
      ),
    });

    // Only reassign PENDING stops - IN_PROGRESS or COMPLETED stops should not be moved
    const pendingStopsForReassignment = currentStops.filter(
      (s) => s.status === "PENDING",
    );
    const inProgressStops = currentStops.filter(
      (s) => s.status === "IN_PROGRESS",
    );

    if (pendingStopsForReassignment.length === 0) {
      errors.push(
        `No pending stops available for reassignment on route ${reassignment.routeId}. All stops are in progress or completed.`,
      );
      continue;
    }

    if (inProgressStops.length > 0) {
      warnings.push(
        `${inProgressStops.length} in-progress stop(s) on route ${reassignment.routeId} were skipped (not reassigned).`,
      );
    }

    const pendingStopIds = pendingStopsForReassignment.map((s) => s.id);

    operations.push({
      routeId: reassignment.routeId,
      vehicleId: reassignment.vehicleId,
      toDriverId: reassignment.toDriverId,
      toDriverName: replacementDriver.name,
      stopIds: pendingStopIds,
      stopIdsBeforeUpdate: pendingStopsForReassignment.map((s) => ({
        id: s.id,
        driverId: s.userId,
        status: s.status,
      })),
    });
  }

  if (errors.length > 0) {
    return {
      success: false,
      reassignedStops: 0,
      reassignedRoutes: 0,
      errors,
      warnings,
    };
  }

  // Phase 0: Validate capacity for each replacement driver before executing
  const stopCountsByDriver = new Map<string, number>();
  for (const op of operations) {
    const current = stopCountsByDriver.get(op.toDriverId) || 0;
    stopCountsByDriver.set(op.toDriverId, current + op.stopIds.length);
  }

  for (const [driverId, newStopsCount] of stopCountsByDriver) {
    const existingPendingStops = await db.query.routeStops.findMany({
      where: and(
        eq(routeStops.companyId, companyId),
        eq(routeStops.userId, driverId),
        eq(routeStops.status, "PENDING"),
      ),
      columns: { id: true },
    });

    const maxCapacity = 50;
    const projectedStops = existingPendingStops.length + newStopsCount;

    if (projectedStops > maxCapacity) {
      errors.push(
        `Replacement driver ${driverId} cannot absorb ${newStopsCount} stops. Current: ${existingPendingStops.length}, Projected: ${projectedStops}, Max: ${maxCapacity}`,
      );
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      reassignedStops: 0,
      reassignedRoutes: 0,
      errors,
      warnings,
    };
  }

  // Execute reassignments atomically using a transaction-like approach
  // Note: Full transaction support would require db.transaction() wrapper
  const rollbackData: Array<{ stopId: string; previousDriverId: string }> = [];

  try {
    // Phase 1: Update all route stops
    for (const op of operations) {
      const updateResult = await db
        .update(routeStops)
        .set({
          userId: op.toDriverId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(routeStops.companyId, companyId),
            eq(routeStops.routeId, op.routeId),
            eq(routeStops.vehicleId, op.vehicleId),
            eq(routeStops.userId, absentDriverId),
            inArray(routeStops.id, op.stopIds),
          ),
        )
        .returning();

      // Capture rollback data
      for (const stop of updateResult) {
        rollbackData.push({
          stopId: stop.id,
          previousDriverId: absentDriverId,
        });
      }

      reassignedStops += updateResult.length;
      reassignedRoutes++;

      // Update replacement driver status if they have in-progress stops
      const hasInProgressStops = await db.query.routeStops.findMany({
        where: and(
          eq(routeStops.companyId, companyId),
          eq(routeStops.userId, op.toDriverId),
          eq(routeStops.status, "IN_PROGRESS"),
        ),
      });

      if (hasInProgressStops.length > 0) {
        await db
          .update(users)
          .set({
            driverStatus: "IN_ROUTE",
            updatedAt: new Date(),
          })
          .where(eq(users.id, op.toDriverId));
      }
    }

    // Phase 2: Update absent driver status if all stops reassigned
    const remainingStops = await db.query.routeStops.findMany({
      where: and(
        eq(routeStops.companyId, companyId),
        eq(routeStops.userId, absentDriverId),
        sql`(${routeStops.status} = 'PENDING' OR ${routeStops.status} = 'IN_PROGRESS')`,
      ),
    });

    if (remainingStops.length === 0 && absentDriver.driverStatus === "ABSENT") {
      await db
        .update(users)
        .set({
          driverStatus: "UNAVAILABLE",
          updatedAt: new Date(),
        })
        .where(eq(users.id, absentDriverId));

      warnings.push(
        `Absent driver ${absentDriver.name} status updated to UNAVAILABLE`,
      );
    }

    // Phase 3: Create reassignment history entry
    const routeIds = [...new Set(operations.map((op) => op.routeId))];
    const vehicleIds = [...new Set(operations.map((op) => op.vehicleId))];

    const reassignmentsDetails = operations.map((op) => ({
      driverId: op.toDriverId,
      driverName: op.toDriverName,
      stopIds: op.stopIds,
      stopCount: op.stopIds.length,
      vehicleId: op.vehicleId,
      routeId: op.routeId,
    }));

    const historyResult = await db
      .insert(reassignmentsHistory)
      .values({
        companyId,
        jobId: jobId || null,
        absentUserId: absentDriverId,
        absentUserName: absentDriver.name,
        routeIds,
        vehicleIds,
        reassignments: reassignmentsDetails,
        reason: reason || null,
        executedBy: userId || null,
        executedAt: new Date(),
      })
      .returning();

    reassignmentHistoryId = historyResult[0]?.id;

    return {
      success: true,
      reassignedStops,
      reassignedRoutes,
      reassignmentHistoryId,
      errors: [],
      warnings,
    };
  } catch (error) {
    // Rollback: Restore previous driver assignments
    const rollbackErrors: string[] = [];

    for (const data of rollbackData) {
      try {
        await db
          .update(routeStops)
          .set({
            userId: data.previousDriverId,
            updatedAt: new Date(),
          })
          .where(eq(routeStops.id, data.stopId));
      } catch (rbError) {
        rollbackErrors.push(
          `Failed to rollback stop ${data.stopId}: ${
            rbError instanceof Error ? rbError.message : "Unknown error"
          }`,
        );
      }
    }

    errors.push(
      `Reassignment failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );

    if (rollbackErrors.length > 0) {
      errors.push(...rollbackErrors);
      errors.push(
        "Partial rollback may have occurred - manual verification required",
      );
    } else {
      errors.push("All changes were rolled back successfully");
    }

    return {
      success: false,
      reassignedStops: 0,
      reassignedRoutes: 0,
      errors,
    };
  }
}
