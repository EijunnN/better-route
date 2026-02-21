import { and, desc, type SQL, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { alerts } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/infra/tenant";

import { extractTenantContext } from "@/lib/routing/route-helpers";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { EntityType, Action } from "@/lib/auth/authorization";

// GET - List alerts with filters
export async function GET(request: NextRequest) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Missing tenant context" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);

  try {
    const authResult = await requireRoutePermission(request, EntityType.ALERT, Action.READ);
    if (authResult instanceof NextResponse) return authResult;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // ACTIVE, ACKNOWLEDGED, RESOLVED, DISMISSED
    const severity = searchParams.get("severity"); // CRITICAL, WARNING, INFO
    const type = searchParams.get("type"); // Any alert type
    const entityType = searchParams.get("entityType"); // DRIVER, VEHICLE, ORDER, ROUTE, JOB
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Build conditions
    const conditions: SQL<unknown>[] = [];

    if (status) {
      conditions.push(sql`${alerts.status} = ${status}`);
    } else {
      // By default, show only non-dismissed alerts
      conditions.push(sql`${alerts.status} != 'DISMISSED'`);
    }

    if (severity) {
      conditions.push(sql`${alerts.severity} = ${severity}`);
    }

    if (type) {
      conditions.push(sql`${alerts.type} = ${type}`);
    }

    if (entityType) {
      conditions.push(sql`${alerts.entityType} = ${entityType}`);
    }

    const whereClause =
      conditions.length > 0
        ? and(withTenantFilter(alerts, [], tenantCtx.companyId), ...conditions)
        : withTenantFilter(alerts, [], tenantCtx.companyId);

    // Get alerts with filters
    const alertsData = await db.query.alerts.findMany({
      where: whereClause,
      with: {
        rule: true,
        acknowledgedByUser: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [desc(alerts.createdAt)],
      limit,
      offset,
    });

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(alerts)
      .where(whereClause);

    const totalCount = countResult[0]?.count || 0;

    return NextResponse.json({
      data: alertsData,
      meta: {
        total: totalCount,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error("Error fetching alerts:", error);
    return NextResponse.json(
      { error: "Failed to fetch alerts" },
      { status: 500 },
    );
  }
}

// POST - Create manual alert (for testing or manual triggers)
export async function POST(request: NextRequest) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Missing tenant context" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);

  try {
    const authResult = await requireRoutePermission(request, EntityType.ALERT, Action.CREATE);
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json();
    const {
      type,
      severity,
      entityType,
      entityId,
      title,
      description,
      metadata,
    } = body;

    if (!type || !severity || !entityType || !entityId || !title) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: type, severity, entityType, entityId, title",
        },
        { status: 400 },
      );
    }

    const [newAlert] = await db
      .insert(alerts)
      .values({
        companyId: tenantCtx.companyId,
        type,
        severity,
        entityType,
        entityId,
        title,
        description,
        metadata: metadata || null,
        status: "ACTIVE",
      })
      .returning();

    return NextResponse.json({ data: newAlert }, { status: 201 });
  } catch (error) {
    console.error("Error creating alert:", error);
    return NextResponse.json(
      { error: "Failed to create alert" },
      { status: 500 },
    );
  }
}
