import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { companyWorkflowTransitions } from "@/db/schema";
import { handleError } from "@/lib/routing/route-helpers";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { EntityType, Action } from "@/lib/auth/permissions";

function assertSameTenant(
  user: { role: string; companyId: string | null },
  companyId: string,
): NextResponse | null {
  if (user.role === "ADMIN_SISTEMA") return null;
  if (user.companyId !== companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

// DELETE - Delete a specific workflow transition by ID
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; transitionId: string }> },
) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.COMPANY,
      Action.UPDATE,
    );
    if (authResult instanceof NextResponse) return authResult;

    const { id: companyId, transitionId } = await params;
    const tenantError = assertSameTenant(authResult, companyId);
    if (tenantError) return tenantError;

    const existing = await db.query.companyWorkflowTransitions.findFirst({
      where: and(
        eq(companyWorkflowTransitions.id, transitionId),
        eq(companyWorkflowTransitions.companyId, companyId),
        eq(companyWorkflowTransitions.active, true),
      ),
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Transition not found" },
        { status: 404 },
      );
    }

    await db
      .update(companyWorkflowTransitions)
      .set({ active: false })
      .where(eq(companyWorkflowTransitions.id, existing.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, "deleting workflow transition");
  }
}
