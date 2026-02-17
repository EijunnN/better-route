import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  companyWorkflowStates,
  companyWorkflowTransitions,
  routeStops,
  SYSTEM_STATES,
} from "@/db/schema";
import {
  handleError,
  setupAuthContext,
  unauthorizedResponse,
  notFoundResponse,
} from "@/lib/routing/route-helpers";

function canAccessCompany(
  user: { role: string; companyId: string | null },
  companyId: string,
): boolean {
  if (user.role === "ADMIN_SISTEMA") return true;
  return user.companyId === companyId;
}

// GET - Single state with transitions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stateId: string }> },
) {
  try {
    const authResult = await setupAuthContext(request);
    if (!authResult.authenticated || !authResult.user) {
      return unauthorizedResponse();
    }

    const { id: companyId, stateId } = await params;

    if (!canAccessCompany(authResult.user, companyId)) {
      return unauthorizedResponse();
    }

    const state = await db.query.companyWorkflowStates.findFirst({
      where: and(
        eq(companyWorkflowStates.id, stateId),
        eq(companyWorkflowStates.companyId, companyId),
        eq(companyWorkflowStates.active, true),
      ),
      with: {
        transitionsFrom: {
          where: eq(companyWorkflowTransitions.active, true),
          with: {
            toState: {
              columns: { id: true, code: true, label: true },
            },
          },
        },
      },
    });

    if (!state) {
      return notFoundResponse("Workflow state");
    }

    return NextResponse.json({ data: state });
  } catch (error) {
    return handleError(error, "fetching workflow state");
  }
}

// PUT - Update state fields
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stateId: string }> },
) {
  try {
    const authResult = await setupAuthContext(request);
    if (!authResult.authenticated || !authResult.user) {
      return unauthorizedResponse();
    }

    const { id: companyId, stateId } = await params;

    if (!canAccessCompany(authResult.user, companyId)) {
      return unauthorizedResponse();
    }

    // Check state exists and belongs to company
    const existing = await db.query.companyWorkflowStates.findFirst({
      where: and(
        eq(companyWorkflowStates.id, stateId),
        eq(companyWorkflowStates.companyId, companyId),
      ),
    });

    if (!existing) {
      return notFoundResponse("Workflow state");
    }

    const body = await request.json();

    // Validate systemState if provided
    if (body.systemState) {
      const validSystemStates = Object.keys(SYSTEM_STATES);
      if (!validSystemStates.includes(body.systemState)) {
        return NextResponse.json(
          {
            error: `Invalid systemState: ${body.systemState}`,
            validValues: validSystemStates,
          },
          { status: 400 },
        );
      }
    }

    const [updated] = await db
      .update(companyWorkflowStates)
      .set({
        ...(body.code !== undefined && { code: body.code }),
        ...(body.label !== undefined && { label: body.label }),
        ...(body.systemState !== undefined && { systemState: body.systemState }),
        ...(body.color !== undefined && { color: body.color }),
        ...(body.icon !== undefined && { icon: body.icon }),
        ...(body.position !== undefined && { position: body.position }),
        ...(body.requiresReason !== undefined && {
          requiresReason: body.requiresReason,
        }),
        ...(body.requiresPhoto !== undefined && {
          requiresPhoto: body.requiresPhoto,
        }),
        ...(body.requiresSignature !== undefined && {
          requiresSignature: body.requiresSignature,
        }),
        ...(body.requiresNotes !== undefined && {
          requiresNotes: body.requiresNotes,
        }),
        ...(body.reasonOptions !== undefined && {
          reasonOptions: body.reasonOptions,
        }),
        ...(body.isTerminal !== undefined && { isTerminal: body.isTerminal }),
        ...(body.isDefault !== undefined && { isDefault: body.isDefault }),
        updatedAt: new Date(),
      })
      .where(eq(companyWorkflowStates.id, stateId))
      .returning();

    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleError(error, "updating workflow state");
  }
}

// DELETE - Delete state (check no route_stops reference it first)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stateId: string }> },
) {
  try {
    const authResult = await setupAuthContext(request);
    if (!authResult.authenticated || !authResult.user) {
      return unauthorizedResponse();
    }

    const { id: companyId, stateId } = await params;

    if (!canAccessCompany(authResult.user, companyId)) {
      return unauthorizedResponse();
    }

    // Check state exists and belongs to company
    const existing = await db.query.companyWorkflowStates.findFirst({
      where: and(
        eq(companyWorkflowStates.id, stateId),
        eq(companyWorkflowStates.companyId, companyId),
      ),
    });

    if (!existing) {
      return notFoundResponse("Workflow state");
    }

    // Check no route_stops reference this state
    const referencingStops = await db.query.routeStops.findFirst({
      where: eq(routeStops.workflowStateId, stateId),
      columns: { id: true },
    });

    if (referencingStops) {
      return NextResponse.json(
        {
          error:
            "Cannot delete workflow state that is referenced by route stops",
        },
        { status: 400 },
      );
    }

    // Soft delete by setting active = false
    await db
      .update(companyWorkflowStates)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(companyWorkflowStates.id, stateId));

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, "deleting workflow state");
  }
}
