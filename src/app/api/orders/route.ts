import { and, desc, eq, like, or } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, timeWindowPresets } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { logCreate } from "@/lib/audit";
import { requireTenantContext, setTenantContext } from "@/lib/tenant";
import { orderQuerySchema, orderSchema } from "@/lib/validations/order";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

// GET - List with filtering and pagination
export async function GET(request: NextRequest) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const { searchParams } = new URL(request.url);
    const query = orderQuerySchema.parse(Object.fromEntries(searchParams));

    const conditions = [];

    if (query.status) {
      conditions.push(eq(orders.status, query.status));
    }

    if (query.timeWindowPresetId) {
      conditions.push(eq(orders.timeWindowPresetId, query.timeWindowPresetId));
    }

    if (query.active !== undefined) {
      conditions.push(eq(orders.active, query.active));
    }

    if (query.search) {
      const searchCondition = or(
        like(orders.trackingId, `%${query.search}%`),
        like(orders.customerName || "", `%${query.search}%`),
      );
      if (searchCondition) conditions.push(searchCondition);
    }

    const whereClause = withTenantFilter(orders, conditions);

    // Join with time window presets to get strictness info
    const data = await db
      .select({
        id: orders.id,
        trackingId: orders.trackingId,
        customerName: orders.customerName,
        customerPhone: orders.customerPhone,
        customerEmail: orders.customerEmail,
        address: orders.address,
        latitude: orders.latitude,
        longitude: orders.longitude,
        timeWindowPresetId: orders.timeWindowPresetId,
        strictness: orders.strictness,
        promisedDate: orders.promisedDate,
        weightRequired: orders.weightRequired,
        volumeRequired: orders.volumeRequired,
        requiredSkills: orders.requiredSkills,
        notes: orders.notes,
        status: orders.status,
        active: orders.active,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
        // Include preset strictness for comparison
        presetStrictness: timeWindowPresets.strictness,
        presetName: timeWindowPresets.name,
      })
      .from(orders)
      .leftJoin(
        timeWindowPresets,
        eq(orders.timeWindowPresetId, timeWindowPresets.id),
      )
      .where(whereClause)
      .orderBy(desc(orders.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    const totalResult = await db
      .select({ count: orders.id })
      .from(orders)
      .where(whereClause);

    // Enrich data with effective strictness
    const enrichedData = data.map((order) => ({
      ...order,
      effectiveStrictness: order.strictness || order.presetStrictness || "HARD",
      isStrictnessOverridden:
        order.strictness !== null &&
        order.strictness !== order.presetStrictness,
    }));

    return NextResponse.json({
      data: enrichedData,
      meta: { total: totalResult.length },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch orders",
      },
      { status: 400 },
    );
  }
}

// POST - Create
export async function POST(request: NextRequest) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const body = await request.json();
    const validatedData = orderSchema.parse(body);

    // Check for uniqueness of tracking ID within the company
    const context = requireTenantContext();
    const existing = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.companyId, context.companyId),
          eq(orders.trackingId, validatedData.trackingId),
          eq(orders.active, true),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "An order with this tracking ID already exists" },
        { status: 409 },
      );
    }

    // Validate time window preset exists if provided
    if (validatedData.timeWindowPresetId) {
      const preset = await db
        .select()
        .from(timeWindowPresets)
        .where(
          and(
            eq(timeWindowPresets.id, validatedData.timeWindowPresetId),
            eq(timeWindowPresets.companyId, context.companyId),
            eq(timeWindowPresets.active, true),
          ),
        )
        .limit(1);

      if (preset.length === 0) {
        return NextResponse.json(
          { error: "Time window preset not found or inactive" },
          { status: 404 },
        );
      }
    }

    const [newRecord] = await db
      .insert(orders)
      .values({
        ...validatedData,
        companyId: tenantCtx.companyId,
        // Convert empty string to null for optional fields
        timeWindowPresetId: validatedData.timeWindowPresetId || null,
        customerEmail: validatedData.customerEmail || null,
        customerPhone: validatedData.customerPhone || null,
      })
      .returning();

    await logCreate("order", newRecord.id, newRecord);

    return NextResponse.json(newRecord, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: (error as { errors?: unknown }).errors,
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create order",
      },
      { status: 500 },
    );
  }
}
