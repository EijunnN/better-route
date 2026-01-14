import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { alertRules, alerts } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/tenant";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

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
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // ACTIVE, ACKNOWLEDGED, RESOLVED, DISMISSED
    const severity = searchParams.get("severity"); // CRITICAL, WARNING, INFO
    const type = searchParams.get("type"); // Any alert type
    const entityType = searchParams.get("entityType"); // DRIVER, VEHICLE, ORDER, ROUTE, JOB
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Build conditions
    const conditions: any[] = [];

    if (status) {
      conditions.push(eq(alerts.status, status as any));
    } else {
      // By default, show only non-dismissed alerts
      conditions.push(sql`${alerts.status} != 'DISMISSED'`);
    }

    if (severity) {
      conditions.push(eq(alerts.severity, severity as any));
    }

    if (type) {
      conditions.push(eq(alerts.type, type as any));
    }

    if (entityType) {
      conditions.push(eq(alerts.entityType, entityType));
    }

    const whereClause =
      conditions.length > 0
        ? and(withTenantFilter(alerts), ...conditions)
        : withTenantFilter(alerts);

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
