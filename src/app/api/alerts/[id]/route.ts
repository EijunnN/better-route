import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { alertNotifications, alerts } from "@/db/schema";
import { verifyTenantAccess, withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/tenant";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

// GET - Get alert details
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
    const { id } = await params;

    const alert = await db.query.alerts.findFirst({
      where: and(withTenantFilter(alerts), eq(alerts.id, id)),
      with: {
        rule: true,
        acknowledgedByUser: true,
        notifications: {
          with: {
            recipient: {
              columns: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!alert) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    return NextResponse.json({ data: alert });
  } catch (error) {
    console.error("Error fetching alert:", error);
    return NextResponse.json(
      { error: "Failed to fetch alert" },
      { status: 500 },
    );
  }
}

// PATCH - Update alert (for generic updates)
export async function PATCH(
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
    const { id } = await params;
    const body = await request.json();
    const { status, resolvedAt } = body;

    // First get the alert to verify tenant access
    const existingAlert = await db.query.alerts.findFirst({
      where: and(withTenantFilter(alerts), eq(alerts.id, id)),
    });

    if (!existingAlert) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    // Prepare update values
    const updateValues: any = {
      updatedAt: new Date(),
    };

    if (status) {
      updateValues.status = status;
    }

    if (resolvedAt) {
      updateValues.resolvedAt = new Date(resolvedAt);
    } else if (status === "RESOLVED" && !existingAlert.resolvedAt) {
      updateValues.resolvedAt = new Date();
    }

    const [updatedAlert] = await db
      .update(alerts)
      .set(updateValues)
      .where(eq(alerts.id, id))
      .returning();

    return NextResponse.json({ data: updatedAlert });
  } catch (error) {
    console.error("Error updating alert:", error);
    return NextResponse.json(
      { error: "Failed to update alert" },
      { status: 500 },
    );
  }
}

// DELETE - Delete alert (typically not used, prefer to dismiss)
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
    const { id } = await params;

    // First verify the alert exists and belongs to tenant
    const existingAlert = await db.query.alerts.findFirst({
      where: and(withTenantFilter(alerts), eq(alerts.id, id)),
    });

    if (!existingAlert) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    await db.delete(alerts).where(eq(alerts.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting alert:", error);
    return NextResponse.json(
      { error: "Failed to delete alert" },
      { status: 500 },
    );
  }
}
