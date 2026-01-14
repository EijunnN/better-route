import { type NextRequest, NextResponse } from "next/server";
import { getReassignmentHistory } from "@/lib/reassignment";
import { setTenantContext } from "@/lib/tenant";
import {
  type ReassignmentHistoryQuerySchema,
  reassignmentHistoryQuerySchema,
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

export async function GET(request: NextRequest) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const searchParams = request.nextUrl.searchParams;

    // Validate query parameters
    const validationResult = reassignmentHistoryQuerySchema.safeParse({
      companyId: tenantCtx.companyId,
      jobId: searchParams.get("jobId") || undefined,
      driverId: searchParams.get("driverId") || undefined,
      limit: parseInt(searchParams.get("limit") || "50"),
      offset: parseInt(searchParams.get("offset") || "0"),
    });

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validationResult.error.issues,
        },
        { status: 400 },
      );
    }

    const data: ReassignmentHistoryQuerySchema = validationResult.data;

    // Get reassignment history
    const history = await getReassignmentHistory(
      data.companyId,
      data.jobId,
      data.driverId,
      data.limit,
      data.offset,
    );

    return NextResponse.json({
      data: history,
      meta: {
        companyId: data.companyId,
        jobId: data.jobId,
        driverId: data.driverId,
        limit: data.limit,
        offset: data.offset,
        total: history.length,
        retrievedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error getting reassignment history:", error);
    return NextResponse.json(
      { error: "Error getting reassignment history" },
      { status: 500 },
    );
  }
}
