import { and, desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { auditLogs, optimizationJobs } from "@/db/schema";
import { setTenantContext } from "@/lib/infra/tenant";

import { extractTenantContext } from "@/lib/routing/route-helpers";

import { safeParseJson } from "@/lib/utils/safe-json";
/**
 * GET - Get assignment history for a route
 * Returns audit log entries for driver assignment changes
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ routeId: string }> },
) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const { routeId } = await params;

    // Verify the job/route exists and belongs to the company
    const job = await db.query.optimizationJobs.findFirst({
      where: and(
        eq(optimizationJobs.id, routeId),
        eq(optimizationJobs.companyId, tenantCtx.companyId),
      ),
    });

    if (!job) {
      return NextResponse.json(
        { error: "Route/job not found" },
        { status: 404 },
      );
    }

    // Get assignment history from audit logs
    const history = await db.query.auditLogs.findMany({
      where: and(
        eq(auditLogs.companyId, tenantCtx.companyId),
        eq(auditLogs.entityType, "DRIVER_ASSIGNMENT"),
        eq(auditLogs.entityId, routeId),
      ),
      orderBy: [desc(auditLogs.createdAt)],
    });

    // Parse and format history entries
    const formattedHistory = history.map((log) => {
      let changes = null;
      if (log.changes) {
        try {
          changes = safeParseJson(log.changes);
        } catch {
          // If changes is not valid JSON, keep as-is
          changes = log.changes;
        }
      }

      return {
        id: log.id,
        action: log.action,
        changes,
        createdAt: log.createdAt.toISOString(),
        userId: log.userId,
      };
    });

    // Group by action type for summary
    const summary = {
      total: formattedHistory.length,
      byAction: formattedHistory.reduce(
        (acc, entry) => {
          acc[entry.action] = (acc[entry.action] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };

    return NextResponse.json({
      data: {
        routeId,
        history: formattedHistory,
        summary,
      },
      meta: {
        retrievedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error getting assignment history:", error);
    return NextResponse.json(
      { error: "Error getting assignment history" },
      { status: 500 },
    );
  }
}
