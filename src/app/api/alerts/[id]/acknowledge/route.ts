import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { alerts } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/tenant";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

// POST - Acknowledge alert
export async function POST(
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

  if (!tenantCtx.userId) {
    return NextResponse.json(
      { error: "Missing user context" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);

  try {
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

    if (existingAlert.status === "ACKNOWLEDGED") {
      return NextResponse.json(
        { error: "Alert already acknowledged" },
        { status: 400 },
      );
    }

    if (existingAlert.status === "DISMISSED") {
      return NextResponse.json(
        { error: "Cannot acknowledge a dismissed alert" },
        { status: 400 },
      );
    }

    // Update the alert
    const [updatedAlert] = await db
      .update(alerts)
      .set({
        status: "ACKNOWLEDGED",
        acknowledgedBy: tenantCtx.userId,
        acknowledgedAt: new Date(),
        updatedAt: new Date(),
        // Store note in metadata
        metadata: {
          ...(existingAlert.metadata || {}),
          acknowledgmentNote: note,
        },
      })
      .where(eq(alerts.id, id))
      .returning();

    return NextResponse.json({ data: updatedAlert });
  } catch (error) {
    console.error("Error acknowledging alert:", error);
    return NextResponse.json(
      { error: "Failed to acknowledge alert" },
      { status: 500 },
    );
  }
}
