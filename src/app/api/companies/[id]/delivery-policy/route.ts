import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { companyDeliveryPolicy } from "@/db/schema";
import { Action, EntityType } from "@/lib/auth/authorization";
import {
  checkPermissionOrError,
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

function canUpdateCompany(
  user: { role: string; companyId: string | null },
  companyId: string,
): boolean {
  if (user.role === "ADMIN_SISTEMA") return true;
  return user.companyId === companyId;
}

/**
 * GET — return the delivery-policy row for this company.
 * If no row exists yet (legacy company predating the autoseed), we
 * lazily insert one with defaults and return it. That keeps the
 * client contract simple: a GET always succeeds with a populated
 * policy object.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await setupAuthContext(request);
    if (!authResult.authenticated || !authResult.user) {
      return unauthorizedResponse();
    }

    const permError = await checkPermissionOrError(
      authResult.user,
      EntityType.COMPANY,
      Action.READ,
    );
    if (permError) return permError;

    const { id: companyId } = await params;

    if (!canAccessCompany(authResult.user, companyId)) {
      return unauthorizedResponse();
    }

    let policy = await db.query.companyDeliveryPolicy.findFirst({
      where: eq(companyDeliveryPolicy.companyId, companyId),
    });

    if (!policy) {
      const [inserted] = await db
        .insert(companyDeliveryPolicy)
        .values({ companyId })
        .returning();
      policy = inserted;
    }

    return NextResponse.json({ data: policy });
  } catch (error) {
    return handleError(error, "fetching delivery policy");
  }
}

/**
 * PUT — partial-update of the policy row. Any field omitted from the
 * body is left unchanged. The route is idempotent: it upserts so
 * legacy companies get their row created on first PUT instead of
 * 404-ing.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await setupAuthContext(request);
    if (!authResult.authenticated || !authResult.user) {
      return unauthorizedResponse();
    }

    const permError = await checkPermissionOrError(
      authResult.user,
      EntityType.COMPANY,
      Action.UPDATE,
    );
    if (permError) return permError;

    const { id: companyId } = await params;

    if (!canUpdateCompany(authResult.user, companyId)) {
      return unauthorizedResponse();
    }

    const body = await request.json();

    // Whitelist the editable columns — never trust the request body
    // to set companyId, createdAt, etc.
    const editable = [
      "labelPending",
      "labelInProgress",
      "labelCompleted",
      "labelFailed",
      "labelCancelled",
      "colorPending",
      "colorInProgress",
      "colorCompleted",
      "colorFailed",
      "colorCancelled",
      "completedRequiresPhoto",
      "completedRequiresSignature",
      "completedRequiresNotes",
      "failedRequiresPhoto",
      "failedRequiresNotes",
      "failureReasons",
    ] as const;

    const patch: Record<string, unknown> = {};
    for (const key of editable) {
      if (key in body) patch[key] = body[key];
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "No editable fields in request body" },
        { status: 400 },
      );
    }

    if (patch.failureReasons !== undefined) {
      if (
        !Array.isArray(patch.failureReasons) ||
        !patch.failureReasons.every((r) => typeof r === "string")
      ) {
        return NextResponse.json(
          { error: "failureReasons must be an array of strings" },
          { status: 400 },
        );
      }
    }

    const [updated] = await db
      .insert(companyDeliveryPolicy)
      .values({ companyId, ...patch })
      .onConflictDoUpdate({
        target: companyDeliveryPolicy.companyId,
        set: { ...patch, updatedAt: new Date() },
      })
      .returning();

    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleError(error, "updating delivery policy");
  }
}

export { PUT as PATCH };
