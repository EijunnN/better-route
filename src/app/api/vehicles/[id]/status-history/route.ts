import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { vehicles, vehicleStatusHistory, users } from "@/db/schema";
import { vehicleStatusHistoryQuerySchema } from "@/lib/validations/vehicle-status";
import { eq, and, desc } from "drizzle-orm";
import { setTenantContext } from "@/lib/tenant";

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

async function getVehicle(id: string, companyId: string) {
  const [vehicle] = await db
    .select()
    .from(vehicles)
    .where(
      and(
        eq(vehicles.id, id),
        eq(vehicles.companyId, companyId)
      )
    )
    .limit(1);

  return vehicle;
}

/**
 * GET /api/vehicles/[id]/status-history
 * Returns the status change history for a specific vehicle
 */
export async function GET(
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
    const vehicle = await getVehicle(id, tenantCtx.companyId);

    if (!vehicle) {
      return NextResponse.json(
        { error: "Vehicle not found" },
        { status: 404 }
      );
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const queryParams = vehicleStatusHistoryQuerySchema.parse({
      vehicleId: id,
      limit: searchParams.get("limit") || "50",
      offset: searchParams.get("offset") || "0",
    });

    // Fetch status history with user information
    const history = await db
      .select({
        id: vehicleStatusHistory.id,
        previousStatus: vehicleStatusHistory.previousStatus,
        newStatus: vehicleStatusHistory.newStatus,
        reason: vehicleStatusHistory.reason,
        createdAt: vehicleStatusHistory.createdAt,
        userId: vehicleStatusHistory.userId,
        userName: users.name,
      })
      .from(vehicleStatusHistory)
      .leftJoin(users, eq(vehicleStatusHistory.userId, users.id))
      .where(
        and(
          eq(vehicleStatusHistory.vehicleId, queryParams.vehicleId),
          eq(vehicleStatusHistory.companyId, tenantCtx.companyId)
        )
      )
      .orderBy(desc(vehicleStatusHistory.createdAt))
      .limit(queryParams.limit)
      .offset(queryParams.offset);

    // Get total count
    const [countResult] = await db
      .select({ count: vehicleStatusHistory.id })
      .from(vehicleStatusHistory)
      .where(
        and(
          eq(vehicleStatusHistory.vehicleId, queryParams.vehicleId),
          eq(vehicleStatusHistory.companyId, tenantCtx.companyId)
        )
      );

    const total = countResult ? 1 : 0;

    return NextResponse.json({
      history,
      total,
      limit: queryParams.limit,
      offset: queryParams.offset,
    });
  } catch (error) {
    console.error("Error fetching vehicle status history:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid query parameters", details: error },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Error fetching vehicle status history" },
      { status: 500 }
    );
  }
}
