import { and, eq, notInArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { routeStops, vehicleStatusHistory, vehicles } from "@/db/schema";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { logUpdate } from "@/lib/infra/audit";
import { setTenantContext } from "@/lib/infra/tenant";
import { EntityType, Action } from "@/lib/auth/authorization";
import {
  requiresActiveRouteCheck,
  STATUS_DISPLAY_NAMES,
  STATUS_TRANSITION_RULES,
  type StatusChangeResult,
  type StatusTransitionError,
  validateStatusTransition,
  vehicleStatusTransitionSchema,
} from "@/lib/validations/vehicle-status";

import { extractTenantContext } from "@/lib/routing/route-helpers";

async function getVehicle(id: string, companyId: string) {
  const [vehicle] = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.id, id), eq(vehicles.companyId, companyId)))
    .limit(1);

  return vehicle;
}

/**
 * POST /api/vehicles/[id]/status-transition
 * Changes the status of a vehicle with validation and history tracking
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRoutePermission(request, EntityType.VEHICLE, Action.CHANGE_STATUS);
    if (authResult instanceof NextResponse) return authResult;

    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const { id } = await params;
    const existingVehicle = await getVehicle(id, tenantCtx.companyId);

    if (!existingVehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    const body = await request.json();
    const validatedData = vehicleStatusTransitionSchema.parse(body);

    const currentStatus = existingVehicle.status;
    const newStatus = validatedData.newStatus;

    // Validate status transition rules
    const transitionValidation = validateStatusTransition(
      currentStatus,
      newStatus,
    );
    if (!transitionValidation.valid) {
      const errorResponse: StatusTransitionError = {
        valid: false,
        reason: transitionValidation.reason || "Transición de estado no válida",
        suggestedAlternativeStatuses:
          STATUS_TRANSITION_RULES[currentStatus] || [],
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    // Check for active routes/assignments if required
    if (requiresActiveRouteCheck(currentStatus, newStatus)) {
      // Check for active route stops assigned to this vehicle
      const activeStops = await db
        .select({ id: routeStops.id })
        .from(routeStops)
        .where(
          and(
            eq(routeStops.vehicleId, id),
            eq(routeStops.companyId, tenantCtx.companyId),
            notInArray(routeStops.status, ["COMPLETED", "FAILED", "SKIPPED"]),
          ),
        )
        .limit(1);

      const hasActiveRoutes = activeStops.length > 0;

      if (hasActiveRoutes && !validatedData.force) {
        const errorResponse: StatusTransitionError = {
          valid: false,
          reason: `El vehículo tiene rutas activas asignadas. Use el parámetro 'force: true' para forzar el cambio después de reasignar las rutas.`,
          requiresReassignment: true,
          activeRouteCount: activeStops.length,
          suggestedAlternativeStatuses:
            STATUS_TRANSITION_RULES[currentStatus]?.filter(
              (s) => s !== newStatus && s !== "INACTIVE",
            ) || [],
        };
        return NextResponse.json(errorResponse, { status: 409 });
      }
    }

    // Perform the status change inside a transaction with optimistic locking
    let txResult: { previousStatus: string; newStatus: string };
    try {
      txResult = await db.transaction(async (tx) => {
        // Re-fetch inside transaction for fresh state
        const [fresh] = await tx
          .select()
          .from(vehicles)
          .where(and(eq(vehicles.id, id), eq(vehicles.companyId, tenantCtx.companyId)))
          .limit(1);

        if (!fresh) {
          throw new Error("NOT_FOUND");
        }

        // Optimistic lock: ensure status hasn't changed since we validated
        if (fresh.status !== currentStatus) {
          throw new Error("CONFLICT");
        }

        // Update vehicle with optimistic lock in WHERE clause
        const [updated] = await tx
          .update(vehicles)
          .set({
            status: newStatus,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(vehicles.id, id),
              eq(vehicles.status, currentStatus),
            ),
          )
          .returning();

        if (!updated) {
          throw new Error("CONFLICT");
        }

        // Record status change history
        await tx.insert(vehicleStatusHistory).values({
          companyId: tenantCtx.companyId,
          vehicleId: id,
          previousStatus: currentStatus,
          newStatus: newStatus,
          userId: tenantCtx.userId,
          reason: validatedData.reason || null,
        });

        return { previousStatus: currentStatus, newStatus };
      });
    } catch (txError) {
      if (txError instanceof Error) {
        if (txError.message === "NOT_FOUND") {
          return NextResponse.json(
            { error: "Vehicle not found" },
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

    // Log the status change (non-critical, outside transaction)
    await logUpdate("vehicle_status", id, {
      before: { status: txResult.previousStatus },
      after: { status: txResult.newStatus, reason: validatedData.reason },
    });

    const result: StatusChangeResult = {
      success: true,
      vehicleId: id,
      previousStatus: currentStatus,
      newStatus: newStatus,
      message: `Estado cambiado de ${STATUS_DISPLAY_NAMES[currentStatus] || currentStatus} a ${STATUS_DISPLAY_NAMES[newStatus] || newStatus}`,
      warning: validatedData.force
        ? "El cambio de estado fue forzado a pesar de tener rutas activas"
        : undefined,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error updating vehicle status:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input", details: error },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Error updating vehicle status" },
      { status: 500 },
    );
  }
}
