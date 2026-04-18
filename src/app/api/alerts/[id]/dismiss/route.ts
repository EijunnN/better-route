import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { alerts } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/infra/tenant";

import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { EntityType, Action } from "@/lib/auth/authorization";

// POST - Dismiss alert
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRoutePermission(request, EntityType.ALERT, Action.DISMISS);
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);

    const { id } = await params;
    const body = await request.json();
    const { note } = body;

    // First get the alert to verify tenant access
    const existingAlert = await db.query.alerts.findFirst({
      where: and(
        withTenantFilter(alerts, [], tenantCtx.companyId),
        eq(alerts.id, id),
      ),
    });

    if (!existingAlert) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    if (existingAlert.status === "DISMISSED") {
      return NextResponse.json(
        { error: "Alert already dismissed" },
        { status: 400 },
      );
    }

    // Update the alert
    const [updatedAlert] = await db
      .update(alerts)
      .set({
        status: "DISMISSED",
        updatedAt: new Date(),
        // Store note in metadata
        metadata: {
          ...(existingAlert.metadata || {}),
          dismissalNote: note,
          dismissedBy: tenantCtx.userId,
          dismissedAt: new Date().toISOString(),
        },
      })
      .where(eq(alerts.id, id))
      .returning();

    return NextResponse.json({ data: updatedAlert });
  } catch (error) {
    console.error("Error dismissing alert:", error);
    return NextResponse.json(
      { error: "Failed to dismiss alert" },
      { status: 500 },
    );
  }
}
