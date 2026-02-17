import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  companyWorkflowStates,
  companyWorkflowTransitions,
} from "@/db/schema";
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

// GET - List all transitions for a company
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await setupAuthContext(request);
    if (!authResult.authenticated || !authResult.user) {
      return unauthorizedResponse();
    }

    const { id: companyId } = await params;

    if (!canAccessCompany(authResult.user, companyId)) {
      return unauthorizedResponse();
    }

    const transitions = await db.query.companyWorkflowTransitions.findMany({
      where: and(
        eq(companyWorkflowTransitions.companyId, companyId),
        eq(companyWorkflowTransitions.active, true),
      ),
      with: {
        fromState: {
          columns: { id: true, code: true, label: true },
        },
        toState: {
          columns: { id: true, code: true, label: true },
        },
      },
    });

    return NextResponse.json({ data: transitions });
  } catch (error) {
    return handleError(error, "fetching workflow transitions");
  }
}

// POST - Create transition { fromStateId, toStateId }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await setupAuthContext(request);
    if (!authResult.authenticated || !authResult.user) {
      return unauthorizedResponse();
    }

    const { id: companyId } = await params;

    if (!canAccessCompany(authResult.user, companyId)) {
      return unauthorizedResponse();
    }

    const body = await request.json();
    const { fromStateId, toStateId } = body;

    if (!fromStateId || !toStateId) {
      return NextResponse.json(
        { error: "fromStateId and toStateId are required" },
        { status: 400 },
      );
    }

    // Validate both states belong to the same company
    const fromState = await db.query.companyWorkflowStates.findFirst({
      where: and(
        eq(companyWorkflowStates.id, fromStateId),
        eq(companyWorkflowStates.companyId, companyId),
        eq(companyWorkflowStates.active, true),
      ),
    });

    if (!fromState) {
      return NextResponse.json(
        { error: "fromState not found or does not belong to this company" },
        { status: 400 },
      );
    }

    const toState = await db.query.companyWorkflowStates.findFirst({
      where: and(
        eq(companyWorkflowStates.id, toStateId),
        eq(companyWorkflowStates.companyId, companyId),
        eq(companyWorkflowStates.active, true),
      ),
    });

    if (!toState) {
      return NextResponse.json(
        { error: "toState not found or does not belong to this company" },
        { status: 400 },
      );
    }

    const [newTransition] = await db
      .insert(companyWorkflowTransitions)
      .values({
        companyId,
        fromStateId,
        toStateId,
      })
      .returning();

    return NextResponse.json({ data: newTransition }, { status: 201 });
  } catch (error) {
    return handleError(error, "creating workflow transition");
  }
}

// DELETE - Delete transition by query params fromStateId + toStateId
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await setupAuthContext(request);
    if (!authResult.authenticated || !authResult.user) {
      return unauthorizedResponse();
    }

    const { id: companyId } = await params;

    if (!canAccessCompany(authResult.user, companyId)) {
      return unauthorizedResponse();
    }

    const { searchParams } = new URL(request.url);
    const fromStateId = searchParams.get("fromStateId");
    const toStateId = searchParams.get("toStateId");

    if (!fromStateId || !toStateId) {
      return NextResponse.json(
        { error: "fromStateId and toStateId query params are required" },
        { status: 400 },
      );
    }

    // Find and soft-delete the transition
    const existing = await db.query.companyWorkflowTransitions.findFirst({
      where: and(
        eq(companyWorkflowTransitions.companyId, companyId),
        eq(companyWorkflowTransitions.fromStateId, fromStateId),
        eq(companyWorkflowTransitions.toStateId, toStateId),
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
