import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { companyFieldDefinitions, orders, timeWindowPresets } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { type FieldDefinition, validateCustomFields } from "@/lib/custom-fields/validation";
import { logDelete, logUpdate } from "@/lib/infra/audit";
import { requireTenantContext, setTenantContext } from "@/lib/infra/tenant";
import { updateOrderSchema } from "@/lib/validations/order";

import { extractTenantContext } from "@/lib/routing/route-helpers";

// GET - Single order by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

    const { id } = await params;

    const result = await db
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
        customFields: orders.customFields,
        status: orders.status,
        active: orders.active,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
        // Include preset details
        presetStrictness: timeWindowPresets.strictness,
        presetName: timeWindowPresets.name,
        presetType: timeWindowPresets.type,
        presetStartTime: timeWindowPresets.startTime,
        presetEndTime: timeWindowPresets.endTime,
        presetExactTime: timeWindowPresets.exactTime,
        presetToleranceMinutes: timeWindowPresets.toleranceMinutes,
      })
      .from(orders)
      .leftJoin(
        timeWindowPresets,
        eq(orders.timeWindowPresetId, timeWindowPresets.id),
      )
      .where(
        and(
          eq(orders.id, id),
          withTenantFilter(orders, [], tenantCtx.companyId),
        ),
      )
      .limit(1);

    if (result.length === 0) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = result[0];

    // Enrich with effective strictness
    const enrichedOrder = {
      ...order,
      effectiveStrictness: order.strictness || order.presetStrictness || "HARD",
      isStrictnessOverridden:
        order.strictness !== null &&
        order.strictness !== order.presetStrictness,
    };

    return NextResponse.json(enrichedOrder);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch order",
      },
      { status: 400 },
    );
  }
}

// PATCH - Update order
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

    const { id } = await params;
    const body = await request.json();
    const validatedData = updateOrderSchema.parse(body);

    // Check if order exists and belongs to tenant
    const context = requireTenantContext();
    const existing = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.companyId, context.companyId)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // If updating tracking ID, check for uniqueness
    if (
      validatedData.trackingId &&
      validatedData.trackingId !== existing[0].trackingId
    ) {
      const duplicate = await db
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

      if (duplicate.length > 0) {
        return NextResponse.json(
          { error: "An order with this tracking ID already exists" },
          { status: 409 },
        );
      }
    }

    // Validate time window preset if provided
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

    // Validate custom fields against definitions if provided
    if (validatedData.customFields && Object.keys(validatedData.customFields).length > 0) {
      const definitions = await db
        .select()
        .from(companyFieldDefinitions)
        .where(
          and(
            eq(companyFieldDefinitions.companyId, context.companyId),
            eq(companyFieldDefinitions.entity, "orders"),
            eq(companyFieldDefinitions.active, true),
          ),
        );

      if (definitions.length > 0) {
        const errors = validateCustomFields(definitions as FieldDefinition[], validatedData.customFields);
        if (errors.length > 0) {
          return NextResponse.json(
            { error: "Custom field validation failed", details: errors },
            { status: 400 },
          );
        }
      }
    }

    // Merge custom fields: preserve data from deactivated field definitions
    // while updating values for current active fields
    const updatePayload = { ...validatedData, updatedAt: new Date() };
    if (validatedData.customFields) {
      const existingCustomFields =
        (existing[0].customFields as Record<string, unknown>) || {};
      updatePayload.customFields = {
        ...existingCustomFields,
        ...validatedData.customFields,
      };
    }

    const [updatedRecord] = await db
      .update(orders)
      .set(updatePayload)
      .where(eq(orders.id, id))
      .returning();

    // Log update (non-blocking)
    after(async () => {
      await logUpdate("order", id, {
        previous: existing[0],
        new: updatedRecord,
      });
    });

    return NextResponse.json(updatedRecord);
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
    console.error("[Order PATCH] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// DELETE - Soft delete order
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

    const { id } = await params;

    // Check if order exists and belongs to tenant
    const context = requireTenantContext();
    const existing = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.companyId, context.companyId)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Soft delete by setting active to false
    const [deletedRecord] = await db
      .update(orders)
      .set({
        active: false,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, id))
      .returning();

    // Log deletion (non-blocking)
    after(async () => {
      await logDelete("order", id, existing[0]);
    });

    return NextResponse.json(deletedRecord);
  } catch (error) {
    console.error("[Order DELETE] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
