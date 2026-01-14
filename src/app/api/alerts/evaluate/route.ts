import { type NextRequest, NextResponse } from "next/server";
import { setTenantContext } from "@/lib/tenant";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

// POST - Trigger alert evaluation (typically called by background job)
export async function POST(request: NextRequest) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Missing tenant context" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);

  try {
    // Dynamically import the alert engine to avoid circular dependencies
    const { runAllAlertEvaluations } = await import("@/lib/alerts/engine");

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type"); // Specific evaluation type or 'all'

    let result;

    if (type === "driver-license") {
      const { evaluateDriverLicenseAlerts } = await import(
        "@/lib/alerts/engine"
      );
      const alerts = await evaluateDriverLicenseAlerts(tenantCtx);
      result = { created: alerts.length, alerts };
    } else if (type === "vehicle-documents") {
      const { evaluateVehicleDocumentAlerts } = await import(
        "@/lib/alerts/engine"
      );
      const alerts = await evaluateVehicleDocumentAlerts(tenantCtx);
      result = { created: alerts.length, alerts };
    } else if (type === "driver-absent") {
      const { evaluateDriverAbsentAlerts } = await import(
        "@/lib/alerts/engine"
      );
      const alerts = await evaluateDriverAbsentAlerts(tenantCtx);
      result = { created: alerts.length, alerts };
    } else if (type === "optimization-failed") {
      const { evaluateOptimizationFailedAlerts } = await import(
        "@/lib/alerts/engine"
      );
      const alerts = await evaluateOptimizationFailedAlerts(tenantCtx);
      result = { created: alerts.length, alerts };
    } else {
      // Run all evaluations
      result = await runAllAlertEvaluations(tenantCtx);
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error evaluating alerts:", error);
    return NextResponse.json(
      { error: "Failed to evaluate alerts", details: String(error) },
      { status: 500 },
    );
  }
}
