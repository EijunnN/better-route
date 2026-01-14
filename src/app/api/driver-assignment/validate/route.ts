import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, USER_ROLES, userSkills, users, vehicles } from "@/db/schema";
import {
  type AssignmentValidationResult,
  validateDriverAssignment,
} from "@/lib/driver-assignment";
import { setTenantContext } from "@/lib/tenant";
import {
  type ValidateDriverAssignmentSchema,
  validateDriverAssignmentSchema,
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
    const validationResult = validateDriverAssignmentSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validationResult.error.issues,
        },
        { status: 400 },
      );
    }

    const data: ValidateDriverAssignmentSchema = validationResult.data;

    // Verify all entities belong to the company
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

    // Validate orders belong to company
    const orderIds = data.routeStops.map((s) => s.orderId);
    const ordersList = await db.query.orders.findMany({
      where: and(
        eq(orders.companyId, tenantCtx.companyId),
        inArray(orders.id, orderIds),
      ),
    });

    if (ordersList.length !== orderIds.length) {
      return NextResponse.json(
        { error: "One or more orders not found" },
        { status: 404 },
      );
    }

    // Perform validation
    const result: AssignmentValidationResult = await validateDriverAssignment(
      tenantCtx.companyId,
      data.driverId,
      data.vehicleId,
      data.routeStops,
    );

    return NextResponse.json({
      data: result,
      meta: {
        driverId: data.driverId,
        vehicleId: data.vehicleId,
        validatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error validating driver assignment:", error);
    return NextResponse.json(
      { error: "Error validating driver assignment" },
      { status: 500 },
    );
  }
}
