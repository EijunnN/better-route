import { type NextRequest, NextResponse } from "next/server";
import { csvImportRequestSchema, previewCsvImport } from "@/lib/orders/import";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { setTenantContext } from "@/lib/infra/tenant";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";

/**
 * POST /api/orders/csv-import/preview
 *
 * Phase 1 of preview-and-confirm CSV import (issue 006). Parses the CSV
 * and classifies each row by trackingId collision into 4 buckets:
 * new, reactivable, skippedActive, skippedCancelled. Stores the parsed
 * data server-side keyed by `previewId` so the confirm step can run
 * without re-uploading.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.ORDER,
      Action.IMPORT,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);

    const body = await request.json();
    const validated = csvImportRequestSchema.parse(body);

    const result = await previewCsvImport(validated, {
      companyId: tenantCtx.companyId,
    });
    if (result.kind === "error") {
      return NextResponse.json(result.body, { status: result.status });
    }
    return NextResponse.json({ data: result.preview });
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
    console.error("[CSV Import Preview] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
