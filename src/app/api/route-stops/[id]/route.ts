import { and, desc, eq, sql } from "drizzle-orm";
import { after, type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  companyDeliveryPolicy,
  deliveryVisits,
  driverLocations,
  type ORDER_STATUS,
  orderStatusHistory,
  orders,
  routeStopHistory,
  routeStops,
  STOP_STATUS_TRANSITIONS,
  USER_ROLES,
} from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { getOptionalUser } from "@/lib/auth/auth-api";
import { Action, EntityType } from "@/lib/auth/authorization";
import { getRouteEtas, recomputeRouteEtas } from "@/lib/eta";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { setTenantContext } from "@/lib/infra/tenant";
import { withContractHeader } from "@/lib/mobile-contract";
import { publishStopEvent } from "@/lib/realtime";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";
import {
  loadStopFieldDefinitions,
  validateStopCustomFields,
} from "@/lib/routing/stop-custom-fields";
import { DEFAULT_FAILURE_REASONS } from "@/lib/workflow/states";

/**
 * Loads the per-company delivery policy fields the PATCH guards need.
 * Read-only direct query (unlike the mobile/company endpoints we do NOT
 * lazily insert a row here — a stop transition shouldn't have the side
 * effect of materializing policy). When the row is absent we fall back to
 * the schema defaults: photo required for COMPLETED, and the canonical
 * `DEFAULT_FAILURE_REASONS` for FAILED (a reason is required).
 */
async function loadDeliveryPolicyGuards(companyId: string): Promise<{
  completedRequiresPhoto: boolean;
  failureReasons: string[];
}> {
  const policy = await db.query.companyDeliveryPolicy.findFirst({
    where: eq(companyDeliveryPolicy.companyId, companyId),
    columns: { completedRequiresPhoto: true, failureReasons: true },
  });

  if (!policy) {
    return {
      completedRequiresPhoto: true,
      failureReasons: [...DEFAULT_FAILURE_REASONS],
    };
  }

  return {
    completedRequiresPhoto: policy.completedRequiresPhoto,
    failureReasons: Array.isArray(policy.failureReasons)
      ? policy.failureReasons
      : [],
  };
}

// Map route_stop status to order status
const STOP_TO_ORDER_STATUS: Record<string, string> = {
  PENDING: "ASSIGNED", // Order stays assigned until stop starts
  IN_PROGRESS: "IN_PROGRESS", // Order is in progress
  COMPLETED: "COMPLETED", // Order was completed
  FAILED: "FAILED", // Order delivery failed
};

// GET - Get a single route stop with details
async function handleGet(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.ROUTE_STOP,
      Action.READ,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);
    const { id: stopId } = await params;

    const stop = await db.query.routeStops.findFirst({
      where: and(
        eq(routeStops.id, stopId),
        withTenantFilter(routeStops, [], tenantCtx.companyId),
      ),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
            role: true,
            phone: true,
          },
        },
        vehicle: {
          columns: { id: true, name: true, plate: true, status: true },
        },
        order: {
          columns: {
            id: true,
            trackingId: true,
            customerName: true,
            address: true,
            latitude: true,
            longitude: true,
            status: true,
          },
        },
        job: true,
        history: {
          with: {
            user: {
              columns: {
                id: true,
                name: true,
                email: true,
                role: true,
                phone: true,
              },
            },
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
async function handlePatch(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.ROUTE_STOP,
      Action.UPDATE,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);
    const { id: stopId } = await params;

    const body = await request.json();
    const {
      notes,
      failureReason,
      evidenceUrls,
      customFields: customFieldsInput,
      gpsLatitude,
      gpsLongitude,
    } = body;
    const { status } = body;
    // JSON-merge-patch semantics for notes (FIX-3): absent = leave the
    // stored value untouched, explicit null (or non-string junk) = clear.
    const notesProvided = Object.hasOwn(body, "notes");
    const notesValue: string | null =
      notesProvided && typeof notes === "string" ? notes : null;
    const hasCustomFieldsUpdate =
      customFieldsInput &&
      typeof customFieldsInput === "object" &&
      !Array.isArray(customFieldsInput);

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
          {
            error:
              "No tiene permiso para modificar esta parada. Solo puede modificar paradas asignadas a usted.",
          },
          { status: 403 },
        );
      }
    }

    if (!status && !hasCustomFieldsUpdate) {
      return NextResponse.json(
        { error: "status or customFields is required" },
        { status: 400 },
      );
    }

    // Idempotent re-send guard: the mobile offline outbox retries a close
    // after a lost ack. If the stop is ALREADY in this terminal status, return
    // it as-is instead of re-running the transition (which would insert a
    // duplicate route_stop_history row AND a duplicate delivery_visit).
    if (
      status &&
      status === currentStop.status &&
      (status === "COMPLETED" || status === "FAILED")
    ) {
      return NextResponse.json({ data: currentStop });
    }

    // Validate + normalize customFields. We run this whenever the payload
    // includes customFields OR when transitioning to COMPLETED (to enforce
    // required fields on the completion path even if the driver didn't send
    // new values this call).
    let normalizedCustomFields: Record<string, unknown> | null = null;
    if (hasCustomFieldsUpdate || status === "COMPLETED") {
      const defs = await loadStopFieldDefinitions(tenantCtx.companyId);
      if (defs.length > 0 || hasCustomFieldsUpdate) {
        const result = validateStopCustomFields(
          hasCustomFieldsUpdate
            ? (customFieldsInput as Record<string, unknown>)
            : {},
          defs,
          (currentStop.customFields as Record<string, unknown> | null) ?? null,
          status === "COMPLETED",
        );
        if (!result.ok) {
          return NextResponse.json(
            { error: "Custom field validation failed", details: result.errors },
            { status: 400 },
          );
        }
        if (hasCustomFieldsUpdate) normalizedCustomFields = result.value;
      }
    }

    // Custom-fields-only path: short update, no history or alert. The status
    // path below (which also handles optimistic locking) is skipped entirely.
    if (!status) {
      const now = new Date();
      const [updated] = await db
        .update(routeStops)
        .set({ customFields: normalizedCustomFields, updatedAt: now })
        .where(
          and(
            eq(routeStops.id, stopId),
            withTenantFilter(routeStops, [], tenantCtx.companyId),
          ),
        )
        .returning();
      if (!updated) {
        return NextResponse.json({ error: "Stop not found" }, { status: 404 });
      }
      return NextResponse.json({ data: updated });
    }

    // Load the per-company delivery policy once for the terminal
    // transitions whose guards depend on it (COMPLETED needs the photo
    // requirement, FAILED needs the failure-reason list). Other paths
    // (IN_PROGRESS, PENDING, status-only without policy needs) never touch it.
    const deliveryPolicy =
      status === "COMPLETED" || status === "FAILED"
        ? await loadDeliveryPolicyGuards(tenantCtx.companyId)
        : null;

    // Photo evidence is required for COMPLETED when the company policy says
    // so. Enforced server-side here (the mobile client gates too, but the
    // API is the authority). Mirrors the customFields-required check above:
    // both run before the transaction.
    const hasEvidencePhotos =
      Array.isArray(evidenceUrls) && evidenceUrls.length > 0;
    if (
      status === "COMPLETED" &&
      deliveryPolicy?.completedRequiresPhoto === true &&
      !hasEvidencePhotos
    ) {
      return NextResponse.json(
        {
          error:
            "Se requiere al menos una foto de evidencia para completar la entrega",
        },
        { status: 400 },
      );
    }

    // Failure reason is required text when transitioning to FAILED — but
    // ONLY when the company actually defines a non-empty `failureReasons`
    // list. If the operator cleared the list, there's nothing for the
    // driver to pick, so we allow FAILED without a reason. Blank-after-trim
    // is rejected (FIX-2: a whitespace-only reason is a lost failure cause).
    // Membership in the list is deliberately NOT enforced (ADR-0011: a
    // stale cached policy on the device must not turn a real failure into
    // a permanent 400).
    if (
      status === "FAILED" &&
      (deliveryPolicy?.failureReasons.length ?? 0) > 0
    ) {
      if (
        typeof failureReason !== "string" ||
        failureReason.trim().length === 0
      ) {
        return NextResponse.json(
          { error: "failureReason is required when status is FAILED" },
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

    // Validate status transition against the crystalized state machine
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

    // Calculate timestamps based on status
    const now = new Date();
    const updateData: Partial<typeof routeStops.$inferInsert> = {
      status,
      updatedAt: now,
    };
    if (notesProvided) {
      updateData.notes = notesValue;
    }

    // Persist customFields alongside the status change
    if (normalizedCustomFields !== null) {
      updateData.customFields = normalizedCustomFields;
    }

    // Set startedAt when moving to IN_PROGRESS
    if (status === "IN_PROGRESS" && !currentStop.startedAt) {
      updateData.startedAt = now;
    }

    // Snapshot de calibración ETA: congelar la predicción vigente al momento
    // del arribo, ANTES de que el recompute post-transición la saque de
    // Redis. Comparado contra startedAt/completedAt da el error real de
    // predicción por franja horaria (base del factor de hora punta).
    const isArrivalTransition =
      status !== currentStop.status &&
      (status === "IN_PROGRESS" ||
        status === "COMPLETED" ||
        status === "FAILED");
    if (isArrivalTransition && currentStop.routeId) {
      // IN_PROGRESS refresca el snapshot (cubre revisitas re-intentadas);
      // las terminales solo escriben si falta (driver saltó IN_PROGRESS).
      const shouldSnapshot =
        status === "IN_PROGRESS" || !currentStop.predictedEtaAt;
      if (shouldSnapshot) {
        const routeEtas = await getRouteEtas(currentStop.routeId);
        if (routeEtas) {
          const stopEta = routeEtas.stops.find((s) => s.stopId === stopId);
          if (stopEta) {
            updateData.predictedEtaAt = new Date(stopEta.etaAt);
            updateData.etaComputedAt = new Date(routeEtas.computedAt);
          }
        }
      }
    }

    // Set completedAt when moving to COMPLETED
    if (status === "COMPLETED" && !currentStop.completedAt) {
      updateData.completedAt = now;
    }

    // Set failure reason and evidence when FAILED. The reason can be null
    // when the company's policy defines no failure reasons (guard above
    // skips the requirement in that case).
    if (status === "FAILED") {
      updateData.failureReason = failureReason ?? null;
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

    // Create history entry metadata
    const historyMetadata =
      status === "FAILED"
        ? { failureReason, evidenceUrls: evidenceUrls || [] }
        : status === "COMPLETED" && evidenceUrls
          ? { evidenceUrls }
          : null;

    // Wrap all writes in a transaction with optimistic locking
    let updatedStop: (typeof routeStops.$inferSelect)[];
    try {
      updatedStop = await db.transaction(async (tx) => {
        // Re-fetch inside transaction for fresh state
        const [fresh] = await tx
          .select()
          .from(routeStops)
          .where(eq(routeStops.id, stopId))
          .limit(1);

        if (!fresh) {
          throw new Error("NOT_FOUND");
        }

        // Optimistic lock: ensure status hasn't changed since we read it
        if (fresh.status !== currentStop.status) {
          throw new Error("CONFLICT");
        }

        // Update stop with optimistic lock in WHERE clause
        const result = await tx
          .update(routeStops)
          .set(updateData)
          .where(
            and(
              eq(routeStops.id, stopId),
              eq(routeStops.status, currentStop.status),
            ),
          )
          .returning();

        if (result.length === 0) {
          throw new Error("CONFLICT");
        }

        // Sync order status if the stop has an associated order. A FAILED
        // stop reset to PENDING drives the order back to PENDING (matching
        // /reopen) rather than ASSIGNED — FAILED→ASSIGNED is an illegal order
        // transition. Every real change is recorded append-only with the
        // `driver_sync` source so order_status_history stays complete.
        if (currentStop.orderId && STOP_TO_ORDER_STATUS[status]) {
          const newOrderStatus = (
            currentStop.status === "FAILED" && status === "PENDING"
              ? "PENDING"
              : STOP_TO_ORDER_STATUS[status]
          ) as keyof typeof ORDER_STATUS;

          // Check current order status - don't overwrite CANCELLED orders
          const [currentOrder] = await tx
            .select({ status: orders.status })
            .from(orders)
            .where(eq(orders.id, currentStop.orderId))
            .limit(1);

          if (
            currentOrder &&
            currentOrder.status !== "CANCELLED" &&
            currentOrder.status !== newOrderStatus
          ) {
            await tx
              .update(orders)
              .set({
                status: newOrderStatus,
                updatedAt: now,
              })
              .where(
                and(
                  eq(orders.id, currentStop.orderId),
                  // Optimistic lock: only update if not cancelled
                  sql`${orders.status} != 'CANCELLED'`,
                ),
              );

            await tx.insert(orderStatusHistory).values({
              companyId: tenantCtx.companyId,
              orderId: currentStop.orderId,
              previousStatus: currentOrder.status,
              newStatus: newOrderStatus,
              source: "driver_sync",
              actorUserId: tenantCtx.userId || null,
              metadata: { routeStopId: stopId, stopStatus: status },
            });
          }
        }

        // Insert history record
        await tx.insert(routeStopHistory).values({
          companyId: tenantCtx.companyId,
          routeStopId: stopId,
          previousStatus: currentStop.status,
          newStatus: status,
          userId: tenantCtx.userId || null,
          notes: notesValue,
          metadata: historyMetadata,
        });

        // Persist a `Visit` for terminal driver-side transitions (ADR-0005).
        // Append-only: each COMPLETED/FAILED transition is one immutable
        // physical attempt. The Stop's evidence/reason live on the Stop
        // until reopened; the Visit is the historical snapshot.
        if (status === "COMPLETED" || status === "FAILED") {
          await tx.insert(deliveryVisits).values({
            companyId: tenantCtx.companyId,
            orderId: currentStop.orderId,
            routeStopId: stopId,
            driverId: currentStop.userId,
            planId: currentStop.jobId,
            attemptedAt: currentStop.startedAt ?? now,
            completedAt: now,
            outcome: status === "COMPLETED" ? "SUCCESS" : "FAILURE",
            failureReason: status === "FAILED" ? (failureReason ?? null) : null,
            notes: notesValue,
            evidenceUrls: evidenceUrls ?? null,
            intendedAddress: currentStop.address,
            intendedLatitude: currentStop.latitude,
            intendedLongitude: currentStop.longitude,
            gpsLatitude: typeof gpsLatitude === "string" ? gpsLatitude : null,
            gpsLongitude:
              typeof gpsLongitude === "string" ? gpsLongitude : null,
          });
        }

        return result;
      });
    } catch (txError) {
      if (txError instanceof Error) {
        if (txError.message === "NOT_FOUND") {
          return NextResponse.json(
            { error: "Stop not found" },
            { status: 404 },
          );
        }
        if (txError.message === "CONFLICT") {
          return NextResponse.json(
            {
              error:
                "Record was modified by another operation. Please refresh and try again.",
            },
            { status: 409 },
          );
        }
      }
      throw txError;
    }

    // If stop was failed, create an alert
    if (status === "FAILED") {
      // Import alerts dynamically to avoid circular dependency
      const { createAlert } = await import("@/lib/alerts/engine");
      const alertType = "STOP_FAILED";

      // failureReason is an opaque, human-readable Spanish string drawn
      // from the company's delivery policy (companyDeliveryPolicy.failureReasons),
      // not a code. Use it verbatim in the alert description.
      const failureLabel =
        status === "FAILED" && failureReason ? failureReason : null;

      await createAlert(
        { companyId: tenantCtx.companyId, userId: tenantCtx.userId },
        {
          type: alertType,
          severity: "WARNING",
          entityType: "STOP",
          entityId: stopId,
          title: `Stop #${currentStop.sequence} ${status.toLowerCase()}: ${currentStop.address}`,
          description: failureLabel
            ? `No entregado: ${failureLabel}. ${notesValue ?? ""}`
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

    // Push the transition to the in-process monitoring bus so connected
    // SSE clients (the /monitoring page) can revalidate immediately
    // instead of waiting up to 10s for the next SWR poll.
    if (status !== currentStop.status) {
      publishStopEvent({
        companyId: tenantCtx.companyId,
        stopId,
        routeId: currentStop.routeId ?? null,
        driverId: currentStop.userId ?? null,
        previousStatus: currentStop.status,
        newStatus: status,
      });

      // ETA en vivo: la secuencia restante cambió → recálculo forzado desde
      // la última posición conocida del driver, fuera del request.
      const etaRouteId = currentStop.routeId;
      const etaDriverId = currentStop.userId;
      const etaCompanyId = tenantCtx.companyId;
      if (etaRouteId && etaDriverId) {
        after(async () => {
          try {
            const lastLocation = await db.query.driverLocations.findFirst({
              where: and(
                eq(driverLocations.companyId, etaCompanyId),
                eq(driverLocations.driverId, etaDriverId),
              ),
              orderBy: desc(driverLocations.recordedAt),
              columns: { latitude: true, longitude: true },
            });
            if (!lastLocation) return;
            await recomputeRouteEtas({
              companyId: etaCompanyId,
              driverId: etaDriverId,
              routeId: etaRouteId,
              latitude: Number.parseFloat(lastLocation.latitude),
              longitude: Number.parseFloat(lastLocation.longitude),
              force: true,
            });
          } catch (err) {
            console.warn(
              "[ETA] recompute tras transición de parada falló:",
              err,
            );
          }
        });
      }
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

export const GET = withContractHeader(handleGet);
export const PATCH = withContractHeader(handlePatch);

// DELETE - Delete a route stop (should be rare, mainly for cleanup)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireRoutePermission(
    request,
    EntityType.ROUTE_STOP,
    Action.DELETE,
  );
  if (authResult instanceof NextResponse) return authResult;
  const tenantCtx = extractTenantContextAuthed(request, authResult);
  if (tenantCtx instanceof NextResponse) return tenantCtx;
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
