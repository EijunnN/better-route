import { type NextRequest, NextResponse } from "next/server";
import type { OUTPUT_FORMAT } from "@/db/schema";
import {
  canGenerateOutput,
  convertOutputToCSV,
  generatePlanOutput,
} from "@/lib/output-generator";
import { getTenantContext, setTenantContext } from "@/lib/tenant";

/**
 * POST /api/output
 * Generate output for a confirmed plan
 *
 * Request body:
 * {
 *   "jobId": string,
 *   "format": "JSON" | "CSV" // optional, defaults to JSON
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "outputId": string,
 *   "format": string,
 *   "data": PlanOutput | string (CSV if format is CSV)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Extract tenant context from headers
    const tenantCtx = getTenantContext();
    if (!tenantCtx) {
      return NextResponse.json(
        { success: false, error: "Missing tenant context" },
        { status: 401 },
      );
    }

    const { companyId, userId } = tenantCtx;

    // Parse request body
    const body = await request.json();
    const {
      jobId,
      format = "JSON",
    }: { jobId: string; format?: keyof typeof OUTPUT_FORMAT } = body;

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: "jobId is required" },
        { status: 400 },
      );
    }

    // Validate format
    if (format !== "JSON" && format !== "CSV") {
      return NextResponse.json(
        { success: false, error: "format must be JSON or CSV" },
        { status: 400 },
      );
    }

    // Set tenant context for database operations
    setTenantContext({ companyId, userId: userId || "" });

    // Check if output can be generated
    const canGenerate = await canGenerateOutput(companyId, jobId);
    if (!canGenerate.canGenerate) {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot generate output",
          reason: canGenerate.reason,
        },
        { status: 400 },
      );
    }

    // Generate output (userId must be defined for database operation)
    const outputUserId = userId || "system";
    const output = await generatePlanOutput(
      companyId,
      jobId,
      outputUserId,
      format,
    );

    // Return based on format
    if (format === "CSV") {
      const csv = convertOutputToCSV(output);
      return NextResponse.json({
        success: true,
        outputId: output.outputId,
        format: "CSV",
        data: csv,
        summary: output.summary,
      });
    }

    return NextResponse.json({
      success: true,
      outputId: output.outputId,
      format: "JSON",
      data: output,
    });
  } catch (error) {
    console.error("Error generating output:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to generate output",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/output
 * List output history for the company
 *
 * Query params:
 * - jobId: filter by job ID (optional)
 * - limit: number of results (optional, default 50)
 * - offset: pagination offset (optional, default 0)
 *
 * Response:
 * {
 *   "success": true,
 *   "outputs": [...]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // Extract tenant context from headers
    const tenantCtx = getTenantContext();
    if (!tenantCtx) {
      return NextResponse.json(
        { success: false, error: "Missing tenant context" },
        { status: 401 },
      );
    }

    const { companyId } = tenantCtx;

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Set tenant context for database operations
    setTenantContext({ companyId, userId: "" });

    // Get output history
    const { getOutputHistory } = await import("@/lib/output-generator");
    const outputs = await getOutputHistory(companyId, { jobId, limit, offset });

    return NextResponse.json({
      success: true,
      outputs,
      pagination: {
        limit,
        offset,
        count: outputs.length,
      },
    });
  } catch (error) {
    console.error("Error fetching output history:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch output history",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
