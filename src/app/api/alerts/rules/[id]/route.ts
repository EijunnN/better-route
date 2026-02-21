import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { alertRules } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/infra/tenant";

import { extractTenantContext } from "@/lib/routing/route-helpers";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { EntityType, Action } from "@/lib/auth/authorization";

// GET - Get alert rule details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Missing tenant context" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);

  try {
    const authResult = await requireRoutePermission(request, EntityType.ALERT_RULE, Action.READ);
    if (authResult instanceof NextResponse) return authResult;

    const { id } = await params;

    const rule = await db.query.alertRules.findFirst({
      where: and(
        withTenantFilter(alertRules, [], tenantCtx.companyId),
        eq(alertRules.id, id),
      ),
      with: {
        alerts: true,
      },
    });

    if (!rule) {
      return NextResponse.json(
        { error: "Alert rule not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: rule });
  } catch (error) {
    console.error("Error fetching alert rule:", error);
    return NextResponse.json(
      { error: "Failed to fetch alert rule" },
      { status: 500 },
    );
  }
}

// PUT - Update alert rule
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Missing tenant context" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);

  try {
    const authResult = await requireRoutePermission(request, EntityType.ALERT_RULE, Action.UPDATE);
    if (authResult instanceof NextResponse) return authResult;

    const { id } = await params;
    const body = await request.json();
    const { name, type, severity, threshold, metadata, enabled } = body;

    // First verify the rule exists and belongs to tenant
    const existingRule = await db.query.alertRules.findFirst({
      where: and(
        withTenantFilter(alertRules, [], tenantCtx.companyId),
        eq(alertRules.id, id),
      ),
    });

    if (!existingRule) {
      return NextResponse.json(
        { error: "Alert rule not found" },
        { status: 404 },
      );
    }

    // Prepare update values
    const updateValues: Partial<typeof alertRules.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateValues.name = name;
    if (type !== undefined) updateValues.type = type;
    if (severity !== undefined) updateValues.severity = severity;
    if (threshold !== undefined) updateValues.threshold = threshold;
    if (metadata !== undefined) updateValues.metadata = metadata;
    if (enabled !== undefined) updateValues.enabled = enabled;

    const [updatedRule] = await db
      .update(alertRules)
      .set(updateValues)
      .where(eq(alertRules.id, id))
      .returning();

    return NextResponse.json({ data: updatedRule });
  } catch (error) {
    console.error("Error updating alert rule:", error);
    return NextResponse.json(
      { error: "Failed to update alert rule" },
      { status: 500 },
    );
  }
}

// DELETE - Delete alert rule
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Missing tenant context" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);

  try {
    const authResult = await requireRoutePermission(request, EntityType.ALERT_RULE, Action.DELETE);
    if (authResult instanceof NextResponse) return authResult;

    const { id } = await params;

    // First verify the rule exists and belongs to tenant
    const existingRule = await db.query.alertRules.findFirst({
      where: and(
        withTenantFilter(alertRules, [], tenantCtx.companyId),
        eq(alertRules.id, id),
      ),
    });

    if (!existingRule) {
      return NextResponse.json(
        { error: "Alert rule not found" },
        { status: 404 },
      );
    }

    await db.delete(alertRules).where(eq(alertRules.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting alert rule:", error);
    return NextResponse.json(
      { error: "Failed to delete alert rule" },
      { status: 500 },
    );
  }
}
