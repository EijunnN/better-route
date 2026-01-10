import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { driverStatusHistory, drivers } from "@/db/schema";
import { driverStatusHistoryQuerySchema } from "@/lib/validations/driver-status";
import { eq, and, desc, count } from "drizzle-orm";
import { setTenantContext } from "@/lib/tenant";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");

  if (!companyId) {
    return null;
  }

  return { companyId };
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
 * GET /api/drivers/[id]/status-history
 * Retrieves the status change history for a specific driver
 * Implements Story 4.3: Gestión del Estado Operativo de Conductores
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
    const existingDriver = await getDriver(id, tenantCtx.companyId);

    if (!existingDriver) {
      return NextResponse.json(
        { error: "Driver not found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const validatedQuery = driverStatusHistoryQuerySchema.parse({
      driverId: id,
      limit: searchParams.get("limit") || "50",
      offset: searchParams.get("offset") || "0",
    });

    // Get total count
    const [totalCount] = await db
      .select({ count: count() })
      .from(driverStatusHistory)
      .where(eq(driverStatusHistory.driverId, id));

    // Get history records with pagination
    const history = await db
      .select({
        id: driverStatusHistory.id,
        previousStatus: driverStatusHistory.previousStatus,
        newStatus: driverStatusHistory.newStatus,
        userId: driverStatusHistory.userId,
        reason: driverStatusHistory.reason,
        context: driverStatusHistory.context,
        createdAt: driverStatusHistory.createdAt,
      })
      .from(driverStatusHistory)
      .where(eq(driverStatusHistory.driverId, id))
      .orderBy(desc(driverStatusHistory.createdAt))
      .limit(validatedQuery.limit)
      .offset(validatedQuery.offset);

    return NextResponse.json({
      driverId: id,
      history,
      pagination: {
        total: totalCount.count,
        limit: validatedQuery.limit,
        offset: validatedQuery.offset,
        hasMore: validatedQuery.offset + validatedQuery.limit < totalCount.count,
      },
    });
  } catch (error) {
    console.error("Error fetching driver status history:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid query parameters", details: error },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Error fetching driver status history" },
      { status: 500 }
    );
  }
}
