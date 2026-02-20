import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { companyWorkflowTransitions } from "@/db/schema";
import {
  handleError,
  setupAuthContext,
  unauthorizedResponse,
} from "@/lib/routing/route-helpers";

function canAccessCompany(
  user: { role: string; companyId: string | null },
  companyId: string,
): boolean {
  if (user.role === "ADMIN_SISTEMA") return true;
  return user.companyId === companyId;
}

// DELETE - Delete a specific workflow transition by ID
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; transitionId: string }> },
) {
  try {
    const authResult = await setupAuthContext(request);
    if (!authResult.authenticated || !authResult.user) {
      return unauthorizedResponse();
    }

    const { id: companyId, transitionId } = await params;

    if (!canAccessCompany(authResult.user, companyId)) {
      return unauthorizedResponse();
    }

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
