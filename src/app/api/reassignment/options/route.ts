import { type NextRequest, NextResponse } from "next/server";
import {
  generateReassignmentOptions,
  getAffectedRoutesForAbsentDriver,
} from "@/lib/routing/reassignment";
import { setTenantContext } from "@/lib/infra/tenant";
import {
  type AvailableReplacementsSchema,
  availableReplacementsSchema,
} from "@/lib/validations/reassignment";

import { extractTenantContext } from "@/lib/routing/route-helpers";

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
    const validationResult = availableReplacementsSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validationResult.error.issues,
        },
        { status: 400 },
      );
    }

    const data: AvailableReplacementsSchema = validationResult.data;

    // Validate company ID matches
    if (data.companyId !== tenantCtx.companyId) {
      return NextResponse.json(
        { error: "Company ID mismatch" },
        { status: 403 },
      );
    }

    // Get affected routes first to provide context
    const affectedRoutes = await getAffectedRoutesForAbsentDriver(
      tenantCtx.companyId,
      data.absentDriverId,
      data.jobId,
    );

    if (affectedRoutes.length === 0) {
      return NextResponse.json({
        data: [],
        meta: {
          absentDriverId: data.absentDriverId,
          strategy: data.strategy,
          affectedRoutes: 0,
          message: "No active routes found for this driver",
        },
      });
    }

    // Generate reassignment options
    const options = await generateReassignmentOptions(
      tenantCtx.companyId,
      data.absentDriverId,
      data.strategy,
      data.jobId,
      data.limit,
    );

    return NextResponse.json({
      data: options,
      meta: {
        absentDriverId: data.absentDriverId,
        strategy: data.strategy,
        affectedRoutes: affectedRoutes.length,
        totalStops: affectedRoutes.reduce((sum, r) => sum + r.totalStops, 0),
        pendingStops: affectedRoutes.reduce(
          (sum, r) => sum + r.pendingStops,
          0,
        ),
        inProgressStops: affectedRoutes.reduce(
          (sum, r) => sum + r.inProgressStops,
          0,
        ),
        optionsGenerated: options.length,
        affectedRoutesSummary: affectedRoutes.map((r) => ({
          routeId: r.routeId,
          vehiclePlate: r.vehiclePlate,
          pendingStops: r.pendingStops,
          inProgressStops: r.inProgressStops,
        })),
      },
    });
  } catch (error) {
    console.error("Error generating reassignment options:", error);
    return NextResponse.json(
      { error: "Error generating reassignment options" },
      { status: 500 },
    );
  }
}
