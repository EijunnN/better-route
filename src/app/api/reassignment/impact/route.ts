import { type NextRequest, NextResponse } from "next/server";
import {
  calculateReassignmentImpact,
  getAffectedRoutesForAbsentDriver,
} from "@/lib/reassignment";
import { setTenantContext } from "@/lib/tenant";
import {
  type ReassignmentImpactRequestSchema,
  reassignmentImpactRequestSchema,
} from "@/lib/validations/reassignment";

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
    const validationResult = reassignmentImpactRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validationResult.error.issues,
        },
        { status: 400 },
      );
    }

    const data: ReassignmentImpactRequestSchema = validationResult.data;

    // Validate company ID matches
    if (data.companyId !== tenantCtx.companyId) {
      return NextResponse.json(
        { error: "Company ID mismatch" },
        { status: 403 },
      );
    }

    // Get affected routes for context
    const affectedRoutes = await getAffectedRoutesForAbsentDriver(
      tenantCtx.companyId,
      data.absentDriverId,
      data.jobId,
    );

    // Calculate impact for the specific replacement driver
    const impact = await calculateReassignmentImpact(
      tenantCtx.companyId,
      data.absentDriverId,
      data.replacementDriverId,
      data.jobId,
    );

    return NextResponse.json({
      data: {
        ...impact,
        affectedRoutesCount: affectedRoutes.length,
        totalAffectedStops: affectedRoutes.reduce(
          (sum, r) => sum + r.totalStops,
          0,
        ),
        pendingAffectedStops: affectedRoutes.reduce(
          (sum, r) => sum + r.pendingStops,
          0,
        ),
      },
      meta: {
        absentDriverId: data.absentDriverId,
        replacementDriverId: data.replacementDriverId,
        calculatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error calculating reassignment impact:", error);
    return NextResponse.json(
      { error: "Error calculating reassignment impact" },
      { status: 500 },
    );
  }
}
