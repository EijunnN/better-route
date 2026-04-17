import { type NextRequest, NextResponse } from "next/server";
import {
  csvImportRequestSchema,
  processCsvImport,
} from "@/lib/orders/import";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { requireTenantContext, setTenantContext } from "@/lib/infra/tenant";
import { EntityType, Action } from "@/lib/auth/authorization";
import { extractTenantContext } from "@/lib/routing/route-helpers";

// POST - Import orders from CSV
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.ORDER,
      Action.IMPORT,
    );
    if (authResult instanceof NextResponse) return authResult;

    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);
    const context = requireTenantContext();

    const body = await request.json();
    const validatedData = csvImportRequestSchema.parse(body);

    const result = await processCsvImport(validatedData, {
      companyId: context.companyId,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: (error as { errors?: unknown }).errors,
        },
        { status: 400 },
      );
    }
    console.error("[Orders Import] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
