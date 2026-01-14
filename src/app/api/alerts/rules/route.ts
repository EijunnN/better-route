import { and, desc, eq, type SQL, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { alertRules } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/tenant";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

// GET - List alert rules
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
    const type = searchParams.get("type");
    const enabled = searchParams.get("enabled");
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Build conditions
    const conditions: SQL<unknown>[] = [];

    if (type) {
      conditions.push(sql`${alertRules.type} = ${type}`);
    }

    if (enabled !== null) {
      conditions.push(eq(alertRules.enabled, enabled === "true"));
    }

    const whereClause =
      conditions.length > 0
        ? and(withTenantFilter(alertRules), ...conditions)
        : withTenantFilter(alertRules);

    // Get rules with filters
    const rules = await db.query.alertRules.findMany({
      where: whereClause,
      orderBy: [desc(alertRules.createdAt)],
      limit,
      offset,
    });

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(alertRules)
      .where(whereClause);

    const totalCount = countResult[0]?.count || 0;

    return NextResponse.json({
      data: rules,
      meta: {
        total: totalCount,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error("Error fetching alert rules:", error);
    return NextResponse.json(
      { error: "Failed to fetch alert rules" },
      { status: 500 },
    );
  }
}

// POST - Create alert rule
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
    const { name, type, severity, threshold, metadata, enabled } = body;

    if (!name || !type || !severity) {
      return NextResponse.json(
        { error: "Missing required fields: name, type, severity" },
        { status: 400 },
      );
    }

    const [newRule] = await db
      .insert(alertRules)
      .values({
        companyId: tenantCtx.companyId,
        name,
        type,
        severity,
        threshold: threshold || null,
        metadata: metadata || null,
        enabled: enabled !== false,
      })
      .returning();

    return NextResponse.json({ data: newRule }, { status: 201 });
  } catch (error) {
    console.error("Error creating alert rule:", error);
    return NextResponse.json(
      { error: "Failed to create alert rule" },
      { status: 500 },
    );
  }
}
