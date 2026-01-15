import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { requireTenantContext, setTenantContext } from "@/lib/tenant";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

// Schema for batch order creation
const batchOrderSchema = z.object({
  orders: z.array(
    z.object({
      trackingId: z.string().min(1).max(50),
      address: z.string().min(1),
      latitude: z.string().regex(/^-?\d+\.?\d*$/),
      longitude: z.string().regex(/^-?\d+\.?\d*$/),
      customerName: z.string().max(255).optional(),
      customerPhone: z.string().max(50).optional(),
      customerEmail: z.string().email().optional(),
      notes: z.string().optional(),
      weightRequired: z.number().int().positive().optional(),
      volumeRequired: z.number().int().positive().optional(),
      timeWindowPresetId: z.string().uuid().optional(),
    })
  ).min(1).max(2000), // Max 2000 orders per batch
  skipDuplicates: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 }
      );
    }

    setTenantContext(tenantCtx);
    const context = requireTenantContext();

    const body = await request.json();
    const validated = batchOrderSchema.parse(body);

    // Get existing tracking IDs to check for duplicates
    const trackingIds = validated.orders.map((o) => o.trackingId);
    const existingOrders = await db
      .select({ trackingId: orders.trackingId })
      .from(orders)
      .where(
        and(
          eq(orders.companyId, context.companyId),
          eq(orders.active, true),
          inArray(orders.trackingId, trackingIds)
        )
      );

    const existingTrackingIds = new Set(existingOrders.map((o) => o.trackingId));

    // Filter out duplicates if skipDuplicates is true
    const ordersToCreate = validated.skipDuplicates
      ? validated.orders.filter((o) => !existingTrackingIds.has(o.trackingId))
      : validated.orders;

    if (ordersToCreate.length === 0) {
      return NextResponse.json({
        success: true,
        created: 0,
        skipped: validated.orders.length,
        duplicates: Array.from(existingTrackingIds),
        message: "All orders already exist",
      });
    }

    // Validate coordinates
    const invalidOrders: string[] = [];
    const validOrders = ordersToCreate.filter((order) => {
      const lat = parseFloat(order.latitude);
      const lng = parseFloat(order.longitude);

      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        invalidOrders.push(order.trackingId);
        return false;
      }
      if (lat === 0 && lng === 0) {
        invalidOrders.push(order.trackingId);
        return false;
      }
      return true;
    });

    if (validOrders.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No valid orders to create",
        invalidOrders,
      }, { status: 400 });
    }

    // Batch insert all orders
    const insertData = validOrders.map((order) => ({
      companyId: context.companyId,
      trackingId: order.trackingId,
      address: order.address,
      latitude: order.latitude,
      longitude: order.longitude,
      customerName: order.customerName || null,
      customerPhone: order.customerPhone || null,
      customerEmail: order.customerEmail || null,
      notes: order.notes || null,
      weightRequired: order.weightRequired || null,
      volumeRequired: order.volumeRequired || null,
      timeWindowPresetId: order.timeWindowPresetId || null,
      status: "PENDING" as const,
      active: true,
    }));

    const createdOrders = await db.insert(orders).values(insertData).returning({ id: orders.id });

    return NextResponse.json({
      success: true,
      created: createdOrders.length,
      skipped: existingTrackingIds.size,
      invalid: invalidOrders.length,
      duplicates: validated.skipDuplicates ? Array.from(existingTrackingIds).slice(0, 10) : [],
      invalidOrders: invalidOrders.slice(0, 10),
      message: `${createdOrders.length} orders created successfully`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    console.error("Batch order creation error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create orders",
      },
      { status: 500 }
    );
  }
}
