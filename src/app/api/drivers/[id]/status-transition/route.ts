import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { drivers, driverStatusHistory, DRIVER_STATUS_TRANSITIONS } from "@/db/schema";
import {
  driverStatusTransitionSchema,
  validateStatusTransition,
  requiresActiveRouteCheck,
  STATUS_DISPLAY_NAMES,
  type StatusTransitionError,
  type StatusChangeResult,
} from "@/lib/validations/driver-status";
import { DRIVER_STATUS } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { setTenantContext } from "@/lib/tenant";
import { logUpdate } from "@/lib/audit";

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

async function getDriver(id: string, companyId: string) {
  const [driver] = await db
    .select()
    .from(drivers)
    .where(
      and(
        eq(drivers.id, id),
        eq(drivers.companyId, companyId)
      )
    )
    .limit(1);

  return driver;
}

/**
 * POST /api/drivers/[id]/status-transition
 * Changes the status of a driver with validation and history tracking
 * Implements Story 4.3: Gestión del Estado Operativo de Conductores
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 }
      );
    }

    setTenantContext(tenantCtx);

    const { id } = await params;
    const existingDriver = await getDriver(id, tenantCtx.companyId);

    if (!existingDriver) {
      return NextResponse.json(
        { error: "Driver not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validatedData = driverStatusTransitionSchema.parse(body);

    const currentStatus = existingDriver.status;
    const newStatus = validatedData.newStatus;

    // Validate status transition rules
    const transitionValidation = validateStatusTransition(currentStatus, newStatus);
    if (!transitionValidation.valid) {
      const errorResponse: StatusTransitionError = {
        valid: false,
        reason: transitionValidation.reason || "Transición de estado no válida",
        suggestedAlternativeStatuses: DRIVER_STATUS_TRANSITIONS[currentStatus] || [],
      };
      return NextResponse.json(
        errorResponse,
        { status: 400 }
      );
    }

    // Check for active routes/assignments if required
    if (requiresActiveRouteCheck(currentStatus, newStatus)) {
      const hasActiveRoutes = currentStatus === "ASSIGNED" || currentStatus === "IN_ROUTE";
      // TODO: Implement actual route checking when planifications module exists
      if (hasActiveRoutes && !validatedData.force) {
        const errorResponse: StatusTransitionError = {
          valid: false,
          reason: `El conductor tiene rutas activas asignadas. Use el parámetro 'force: true' para forzar el cambio después de reasignar las rutas.`,
          requiresReassignment: true,
          activeRouteCount: 0, // TODO: Get actual count from planifications
          suggestedAlternativeStatuses: DRIVER_STATUS_TRANSITIONS[currentStatus]?.filter(
            s => s !== newStatus && s !== "UNAVAILABLE"
          ) || [],
        };
        return NextResponse.json(
          errorResponse,
          { status: 409 }
        );
      }
    }

    // Perform the status change
    const [updatedDriver] = await db
      .update(drivers)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(drivers.id, id))
      .returning();

    // Record status change history
    await db.insert(driverStatusHistory).values({
      companyId: tenantCtx.companyId,
      driverId: id,
      previousStatus: currentStatus,
      newStatus: newStatus,
      userId: tenantCtx.userId,
      reason: validatedData.reason || null,
      context: validatedData.context || null,
    });

    // Log the status change
    await logUpdate("driver_status", id, {
      before: { status: currentStatus },
      after: { status: newStatus, reason: validatedData.reason, context: validatedData.context },
    });

    const result: StatusChangeResult = {
      success: true,
      driverId: id,
      previousStatus: currentStatus,
      newStatus: newStatus,
      message: `Estado cambiado de ${STATUS_DISPLAY_NAMES[currentStatus]} a ${STATUS_DISPLAY_NAMES[newStatus]}`,
      warning: validatedData.force ? "El cambio de estado fue forzado a pesar de tener rutas activas" : undefined,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error updating driver status:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input", details: error },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Error updating driver status" },
      { status: 500 }
    );
  }
}
