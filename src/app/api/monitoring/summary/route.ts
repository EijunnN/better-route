import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationJobs, optimizationConfigurations, drivers, alerts, routeStops } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/tenant";
import { eq, and, desc, sql } from "drizzle-orm";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

// GET - Get monitoring summary for confirmed plans
export async function GET(request: NextRequest) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json({ error: "Missing tenant context" }, { status: 401 });
  }

  setTenantContext(tenantCtx);

  try {
    // Get the most recent confirmed optimization job for this company
    const confirmedJob = await db.query.optimizationJobs.findFirst({
      where: and(
        withTenantFilter(optimizationJobs),
        eq(optimizationJobs.status, "COMPLETED")
      ),
      with: {
        configuration: true,
      },
      orderBy: [desc(optimizationJobs.createdAt)],
    });

    // Get all driver statuses from the company (regardless of active plan)
    const allDrivers = await db.query.drivers.findMany({
      where: withTenantFilter(drivers),
      columns: {
        id: true,
        name: true,
        status: true,
        fleetId: true,
      },
    });

    // Count driver statuses
    const driversInRoute = allDrivers.filter((d) => d.status === "IN_ROUTE").length;
    const driversAvailable = allDrivers.filter((d) => d.status === "AVAILABLE").length;
    const driversOnPause = allDrivers.filter((d) => d.status === "ON_PAUSE").length;

    // Get active alerts count
    const activeAlertsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(alerts)
      .where(and(
        withTenantFilter(alerts),
        eq(alerts.status, "ACTIVE")
      ));
    const activeAlerts = activeAlertsResult[0]?.count || 0;

    if (!confirmedJob) {
      return NextResponse.json({
        data: {
          hasActivePlan: false,
          metrics: {
            totalDrivers: allDrivers.length,
            driversInRoute,
            driversAvailable,
            driversOnPause,
            completedStops: 0,
            totalStops: 0,
            completenessPercentage: 0,
            delayedStops: 0,
            activeAlerts: Number(activeAlerts),
          },
        },
      });
    }

    // Parse the result
    let parsedResult = null;
    if (confirmedJob.result) {
      try {
        parsedResult = JSON.parse(confirmedJob.result);
      } catch {
        parsedResult = null;
      }
    }

    // Try to get actual stops from database
    const dbStops = await db.query.routeStops.findMany({
      where: eq(routeStops.jobId, confirmedJob.id),
      columns: {
        status: true,
        completedAt: true,
        timeWindowEnd: true,
      },
    });

    let totalStops = 0;
    let completedStops = 0;
    let delayedStops = 0;
    let routesCount = 0;

    if (dbStops.length > 0) {
      // Use actual stop data from database
      totalStops = dbStops.length;
      completedStops = dbStops.filter(s => s.status === "COMPLETED").length;

      // Count delayed stops (completed after time window or failed/skipped)
      const now = new Date();
      delayedStops = dbStops.filter(s => {
        if (s.status === "FAILED" || s.status === "SKIPPED") return true;
        if (s.status === "COMPLETED" && s.completedAt && s.timeWindowEnd) {
          return s.completedAt > s.timeWindowEnd;
        }
        if ((s.status === "PENDING" || s.status === "IN_PROGRESS") && s.timeWindowEnd) {
          return now > s.timeWindowEnd;
        }
        return false;
      }).length;
    } else if (parsedResult?.routes) {
      // Fallback to parsed result if no stops in database yet
      routesCount = parsedResult.routes.length;
      totalStops = parsedResult.routes.reduce((sum: number, route: any) => sum + (route.stops?.length || 0), 0);
      // Mock data for when stops haven't been created yet
      completedStops = 0;
      delayedStops = 0;
    }

    const completenessPercentage = totalStops > 0 ? Math.round((completedStops / totalStops) * 100) : 0;

    return NextResponse.json({
      data: {
        hasActivePlan: true,
        jobId: confirmedJob.id,
        configurationId: confirmedJob.configurationId,
        configurationName: confirmedJob.configuration?.name,
        startedAt: confirmedJob.startedAt?.toISOString() || null,
        completedAt: confirmedJob.completedAt?.toISOString() || null,
        metrics: {
          totalDrivers: allDrivers.length,
          driversInRoute,
          driversAvailable,
          driversOnPause,
          completedStops,
          totalStops,
          completenessPercentage,
          delayedStops,
          activeAlerts: Number(activeAlerts),
        },
        result: parsedResult,
      },
    });
  } catch (error) {
    console.error("Error fetching monitoring summary:", error);
    return NextResponse.json(
      { error: "Failed to fetch monitoring summary" },
      { status: 500 }
    );
  }
}
