import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  orders,
  routeStopHistory,
  routeStops,
  STOP_STATUS_TRANSITIONS,
  DELIVERY_FAILURE_REASONS,
  DELIVERY_FAILURE_LABELS,
  USER_ROLES,
  companyWorkflowStates,
  companyWorkflowTransitions,
} from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/infra/tenant";
import { getAuthenticatedUser, getOptionalUser } from "@/lib/auth/auth-api";

// Map route_stop status to order status
const STOP_TO_ORDER_STATUS: Record<string, string> = {
  PENDING: "ASSIGNED", // Order stays assigned until stop starts
  IN_PROGRESS: "IN_TRANSIT", // Order is in transit
  COMPLETED: "DELIVERED", // Order was delivered
  FAILED: "FAILED", // Order delivery failed
  SKIPPED: "FAILED", // Order was skipped (treat as failed)
};

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

// GET - Get a single route stop with details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Missing tenant context" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);
  const { id: stopId } = await params;

  try {
    const stop = await db.query.routeStops.findFirst({
      where: and(
        eq(routeStops.id, stopId),
        withTenantFilter(routeStops, [], tenantCtx.companyId),
      ),
      with: {
        user: true,
        vehicle: true,
        order: true,
        job: true,
        history: {
          with: {
            user: true,
          },
          orderBy: (history, { desc }) => [desc(history.createdAt)],
        },
      },
    });

    if (!stop) {
      return NextResponse.json({ error: "Stop not found" }, { status: 404 });
    }

    return NextResponse.json({ data: stop });
  } catch (error) {
    after(() => console.error("Error fetching route stop:", error));
    return NextResponse.json(
      { error: "Failed to fetch route stop" },
      { status: 500 },
    );
  }
}

// PATCH - Update stop status (with validation and history)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Missing tenant context" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);
  const { id: stopId } = await params;

  try {
    const body = await request.json();
    const { workflowStateId, notes, failureReason, evidenceUrls } = body;
    let { status } = body;

    // Get current stop
    const currentStop = await db.query.routeStops.findFirst({
      where: and(
        eq(routeStops.id, stopId),
        withTenantFilter(routeStops, [], tenantCtx.companyId),
      ),
    });

    if (!currentStop) {
      return NextResponse.json({ error: "Stop not found" }, { status: 404 });
    }

    // Security validation: Conductors can only modify their own stops
    const authUser = await getOptionalUser(request);
    if (authUser && authUser.role === USER_ROLES.CONDUCTOR) {
      if (currentStop.userId !== authUser.userId) {
        return NextResponse.json(
          { error: "No tiene permiso para modificar esta parada. Solo puede modificar paradas asignadas a usted." },
          { status: 403 },
        );
      }
    }

    // If workflowStateId is provided, use custom workflow logic
    if (workflowStateId) {
      // Look up the workflow state
      const workflowState = await db.query.companyWorkflowStates.findFirst({
        where: and(
          eq(companyWorkflowStates.id, workflowStateId),
          eq(companyWorkflowStates.companyId, tenantCtx.companyId),
          eq(companyWorkflowStates.active, true),
        ),
      });

      if (!workflowState) {
        return NextResponse.json(
          { error: "Workflow state not found" },
          { status: 400 },
        );
      }

      // If the stop currently has a workflowStateId, validate the transition is allowed
      if (currentStop.workflowStateId) {
        const allowedTransition = await db.query.companyWorkflowTransitions.findFirst({
          where: and(
            eq(companyWorkflowTransitions.companyId, tenantCtx.companyId),
            eq(companyWorkflowTransitions.fromStateId, currentStop.workflowStateId),
            eq(companyWorkflowTransitions.toStateId, workflowStateId),
            eq(companyWorkflowTransitions.active, true),
          ),
        });

        if (!allowedTransition) {
          return NextResponse.json(
            { error: "Workflow transition not allowed" },
            { status: 400 },
          );
        }
      }

      // Derive status from the workflow state's systemState
      status = workflowState.systemState;
    }

    if (!status) {
      return NextResponse.json(
        { error: "Status or workflowStateId is required" },
        { status: 400 },
      );
    }

    // Validate failureReason is required when status is FAILED (only for legacy flow without workflow)
    if (status === "FAILED" && !workflowStateId) {
      if (!failureReason) {
        return NextResponse.json(
          {
            error: "failureReason is required when status is FAILED",
            validReasons: Object.keys(DELIVERY_FAILURE_REASONS),
          },
          { status: 400 },
        );
      }
      if (
        !Object.keys(DELIVERY_FAILURE_REASONS).includes(failureReason)
      ) {
        return NextResponse.json(
          {
            error: `Invalid failureReason: ${failureReason}`,
            validReasons: Object.keys(DELIVERY_FAILURE_REASONS),
          },
          { status: 400 },
        );
      }
    }

    // Validate evidenceUrls if provided
    if (evidenceUrls && !Array.isArray(evidenceUrls)) {
      return NextResponse.json(
        { error: "evidenceUrls must be an array of URLs" },
        { status: 400 },
      );
    }

    // Validate status transition (legacy path - skip if using workflow)
    if (!workflowStateId) {
      const validTransitions =
        STOP_STATUS_TRANSITIONS[
          currentStop.status as keyof typeof STOP_STATUS_TRANSITIONS
        ] || [];
      if (
        status !== currentStop.status &&
        !(validTransitions as string[]).includes(status)
      ) {
        return NextResponse.json(
          {
            error: `Invalid status transition from ${currentStop.status} to ${status}`,
            validTransitions,
          },
          { status: 400 },
        );
      }
    }

    // Calculate timestamps based on status
    const now = new Date();
    const updateData: Partial<typeof routeStops.$inferInsert> = {
      status,
      notes: notes || null,
      updatedAt: now,
    };

    // Set workflowStateId if provided
    if (workflowStateId) {
      updateData.workflowStateId = workflowStateId;
    }

    // Set startedAt when moving to IN_PROGRESS
    if (status === "IN_PROGRESS" && !currentStop.startedAt) {
      updateData.startedAt = now;
    }

    // Set completedAt when moving to COMPLETED
    if (status === "COMPLETED" && !currentStop.completedAt) {
      updateData.completedAt = now;
    }

    // Clear completedAt if moving away from COMPLETED back to IN_PROGRESS
    if (status === "IN_PROGRESS" && currentStop.status === "COMPLETED") {
      updateData.completedAt = null;
    }

    // Set failure reason and evidence when FAILED
    if (status === "FAILED") {
      updateData.failureReason = failureReason;
      updateData.evidenceUrls = evidenceUrls || null;
      updateData.completedAt = now; // Mark as completed (with failure)
    }

    // Set evidence when COMPLETED (proof of delivery)
    if (status === "COMPLETED" && evidenceUrls) {
      updateData.evidenceUrls = evidenceUrls;
    }

    // Clear failure data if moving away from FAILED (but keep evidence if moving to COMPLETED)
    if (status !== "FAILED" && currentStop.status === "FAILED") {
      updateData.failureReason = null;
      // Only clear evidence if not completing with new evidence
      if (status !== "COMPLETED" || !evidenceUrls) {
        updateData.evidenceUrls = null;
      }
    }

    // Update stop
    const updatedStop = await db
      .update(routeStops)
      .set(updateData)
      .where(eq(routeStops.id, stopId))
      .returning();

    // Sync order status if the stop has an associated order
    if (currentStop.orderId && STOP_TO_ORDER_STATUS[status]) {
      const newOrderStatus = STOP_TO_ORDER_STATUS[status];
      await db
        .update(orders)
        .set({
          status: newOrderStatus as typeof orders.$inferInsert.status,
          updatedAt: now,
        })
        .where(eq(orders.id, currentStop.orderId));
    }

    // Create history entry with evidence metadata
    const historyMetadata =
      status === "FAILED"
        ? { failureReason, evidenceUrls: evidenceUrls || [] }
        : status === "COMPLETED" && evidenceUrls
          ? { evidenceUrls }
          : null;

    await db.insert(routeStopHistory).values({
      companyId: tenantCtx.companyId,
      routeStopId: stopId,
      previousStatus: currentStop.status,
      newStatus: status,
      userId: tenantCtx.userId || null,
      notes: notes || null,
      metadata: historyMetadata,
    });

    // If stop was failed or skipped, create an alert
    if (status === "FAILED" || status === "SKIPPED") {
      // Import alerts dynamically to avoid circular dependency
      const { createAlert } = await import("@/lib/alerts/engine");
      const alertType = status === "FAILED" ? "STOP_FAILED" : "STOP_SKIPPED";

      // Get failure reason label for alert description
      const failureLabel =
        status === "FAILED" && failureReason
          ? DELIVERY_FAILURE_LABELS[
              failureReason as keyof typeof DELIVERY_FAILURE_LABELS
            ]
          : null;

      await createAlert(
        { companyId: tenantCtx.companyId, userId: tenantCtx.userId },
        {
          type: alertType,
          severity: "WARNING",
          entityType: "STOP",
          entityId: stopId,
          title: `Stop #${currentStop.sequence} ${status.toLowerCase()}: ${currentStop.address}`,
          description: failureLabel
            ? `No entregado: ${failureLabel}. ${notes || ""}`
            : `The stop at ${currentStop.address} was marked as ${status.toLowerCase()}.`,
          metadata: {
            userId: currentStop.userId,
            vehicleId: currentStop.vehicleId,
            orderId: currentStop.orderId,
            routeId: currentStop.routeId,
            sequence: currentStop.sequence,
            failureReason: failureReason || null,
            evidenceUrls: evidenceUrls || [],
          },
        },
      );
    }

    return NextResponse.json({ data: updatedStop[0] });
  } catch (error) {
    after(() => console.error("Error updating route stop:", error));
    return NextResponse.json(
      { error: "Failed to update route stop" },
      { status: 500 },
    );
  }
}

// DELETE - Delete a route stop (should be rare, mainly for cleanup)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Missing tenant context" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);
  const { id: stopId } = await params;

  try {
    // Check if stop exists and belongs to tenant
    const stop = await db.query.routeStops.findFirst({
      where: and(
        eq(routeStops.id, stopId),
        withTenantFilter(routeStops, [], tenantCtx.companyId),
      ),
    });

    if (!stop) {
      return NextResponse.json({ error: "Stop not found" }, { status: 404 });
    }

    // Don't allow deletion of stops that are in progress or completed
    if (stop.status === "IN_PROGRESS" || stop.status === "COMPLETED") {
      return NextResponse.json(
        { error: "Cannot delete stop that is in progress or completed" },
        { status: 400 },
      );
    }

    // Delete stop (history will be cascade deleted)
    await db.delete(routeStops).where(eq(routeStops.id, stopId));

    return NextResponse.json({ success: true });
  } catch (error) {
    after(() => console.error("Error deleting route stop:", error));
    return NextResponse.json(
      { error: "Failed to delete route stop" },
      { status: 500 },
    );
  }
}
