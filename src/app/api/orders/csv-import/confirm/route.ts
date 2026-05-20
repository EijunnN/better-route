import { type NextRequest, NextResponse } from "next/server";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { setTenantContext } from "@/lib/infra/tenant";
import { confirmCsvImport } from "@/lib/orders/import";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";

/**
 * POST /api/orders/csv-import/confirm
 *
 * Phase 2 of preview-and-confirm. Body:
 *   { previewId: string, reactivableSelections?: string[] }
 *
 * Applies the inserts (Nuevas) and reactivations (operator-selected
 * subset of Reactivables) from a previously stored preview. Returns
 * `{ inserted, reactivated, raceConditions }` — the last bucket
 * captures rows whose status changed between phases (issue 006 spec).
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

    const body = (await request.json().catch(() => null)) as {
      previewId?: unknown;
      reactivableSelections?: unknown;
    } | null;

    if (!body || typeof body.previewId !== "string" || !body.previewId) {
      return NextResponse.json(
        { error: "previewId is required" },
        { status: 400 },
      );
    }

    const reactivableSelections = Array.isArray(body.reactivableSelections)
      ? body.reactivableSelections.filter(
          (x): x is string => typeof x === "string",
        )
      : undefined;

    const result = await confirmCsvImport(
      { previewId: body.previewId, reactivableSelections },
      { companyId: tenantCtx.companyId },
    );
    if (result.kind === "error") {
      return NextResponse.json(result.body, { status: result.status });
    }
    return NextResponse.json({ data: result.body }, { status: result.status });
  } catch (error) {
    console.error("[CSV Import Confirm] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
