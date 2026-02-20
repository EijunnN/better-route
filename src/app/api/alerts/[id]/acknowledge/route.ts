import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { alerts } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/infra/tenant";

import { extractTenantContext } from "@/lib/routing/route-helpers";

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

    // Wrap read + validate + update in a transaction with optimistic locking
    let updatedAlert: typeof alerts.$inferSelect;
    try {
      updatedAlert = await db.transaction(async (tx) => {
        // Fetch alert inside transaction for fresh state
        const [existingAlert] = await tx
          .select()
          .from(alerts)
          .where(
            and(
              eq(alerts.id, id),
              eq(alerts.companyId, tenantCtx.companyId),
            ),
          )
          .limit(1);

        if (!existingAlert) {
          throw new Error("NOT_FOUND");
        }

        if (existingAlert.status === "ACKNOWLEDGED") {
          throw new Error("ALREADY_ACKNOWLEDGED");
        }

        if (existingAlert.status === "DISMISSED") {
          throw new Error("ALREADY_DISMISSED");
        }

        // Update with optimistic lock: ensure status is still ACTIVE
        const now = new Date();
        const [updated] = await tx
          .update(alerts)
          .set({
            status: "ACKNOWLEDGED",
            acknowledgedBy: tenantCtx.userId,
            acknowledgedAt: now,
            updatedAt: now,
            // Merge metadata inside transaction using freshly-read data
            metadata: {
              ...((existingAlert.metadata as Record<string, unknown>) || {}),
              acknowledgmentNote: note,
            },
          })
          .where(
            and(
              eq(alerts.id, id),
              eq(alerts.status, existingAlert.status),
            ),
          )
          .returning();

        if (!updated) {
          throw new Error("CONFLICT");
        }

        return updated;
      });
    } catch (txError) {
      if (txError instanceof Error) {
        if (txError.message === "NOT_FOUND") {
          return NextResponse.json(
            { error: "Alert not found" },
            { status: 404 },
          );
        }
        if (txError.message === "ALREADY_ACKNOWLEDGED") {
          return NextResponse.json(
            { error: "Alert already acknowledged" },
            { status: 400 },
          );
        }
        if (txError.message === "ALREADY_DISMISSED") {
          return NextResponse.json(
            { error: "Cannot acknowledge a dismissed alert" },
            { status: 400 },
          );
        }
        if (txError.message === "CONFLICT") {
          return NextResponse.json(
            {
              error:
                "Record was modified by another operation. Please refresh and try again.",
            },
            { status: 409 },
          );
        }
      }
      throw txError;
    }

    return NextResponse.json({ data: updatedAlert });
  } catch (error) {
    console.error("Error acknowledging alert:", error);
    return NextResponse.json(
      { error: "Failed to acknowledge alert" },
      { status: 500 },
    );
  }
}
