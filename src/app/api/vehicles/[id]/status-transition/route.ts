import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { vehicleStatusHistory, vehicles } from "@/db/schema";
import { logUpdate } from "@/lib/infra/audit";
import { setTenantContext } from "@/lib/infra/tenant";
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
      const hasActiveRoutes = currentStatus === "ASSIGNED"; // TODO: Implement actual route checking when planifications module exists
      if (hasActiveRoutes && !validatedData.force) {
        const errorResponse: StatusTransitionError = {
          valid: false,
          reason: `El vehículo tiene rutas activas asignadas. Use el parámetro 'force: true' para forzar el cambio después de reasignar las rutas.`,
          requiresReassignment: true,
          activeRouteCount: 0, // TODO: Get actual count from planifications
          suggestedAlternativeStatuses:
            STATUS_TRANSITION_RULES[currentStatus]?.filter(
              (s) => s !== newStatus && s !== "INACTIVE",
            ) || [],
        };
        return NextResponse.json(errorResponse, { status: 409 });
      }
    }

    // Perform the status change
    const [_updatedVehicle] = await db
      .update(vehicles)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(vehicles.id, id))
      .returning();

    // Record status change history
    await db.insert(vehicleStatusHistory).values({
      companyId: tenantCtx.companyId,
      vehicleId: id,
      previousStatus: currentStatus,
      newStatus: newStatus,
      userId: tenantCtx.userId,
      reason: validatedData.reason || null,
    });

    // Log the status change
    await logUpdate("vehicle_status", id, {
      before: { status: currentStatus },
      after: { status: newStatus, reason: validatedData.reason },
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
