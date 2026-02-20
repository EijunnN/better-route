import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { companyFieldDefinitions, orders } from "@/db/schema";
import {
  type FieldDefinition,
  validateCustomFields,
  applyDefaults,
} from "@/lib/custom-fields/validation";
import { requireTenantContext, setTenantContext } from "@/lib/infra/tenant";

import { extractTenantContext } from "@/lib/routing/route-helpers";

// Schema for batch order creation
const batchOrderSchema = z.object({
  orders: z
    .array(
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
        // New fields for multi-company support
        orderValue: z.number().int().nonnegative().optional(),
        unitsRequired: z.number().int().positive().optional(),
        orderType: z.enum(["NEW", "RESCHEDULED", "URGENT"]).optional(),
        priority: z.number().int().min(0).max(100).optional(),
        // Time windows (format: HH:mm)
        timeWindowStart: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
        timeWindowEnd: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
        // Custom fields
        customFields: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(2000), // Max 2000 orders per batch
  skipDuplicates: z.boolean().default(true),
});

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
          inArray(orders.trackingId, trackingIds),
        ),
      );

    const existingTrackingIds = new Set(
      existingOrders.map((o) => o.trackingId),
    );

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
      return NextResponse.json(
        {
          error: "No valid orders to create",
          details: invalidOrders,
        },
        { status: 400 },
      );
    }

    // Validate custom fields if any order has them
    const hasCustomFields = validOrders.some(
      (o) => o.customFields && Object.keys(o.customFields).length > 0,
    );

    let fieldDefs: FieldDefinition[] = [];
    if (hasCustomFields) {
      const defs = await db
        .select({
          id: companyFieldDefinitions.id,
          code: companyFieldDefinitions.code,
          label: companyFieldDefinitions.label,
          fieldType: companyFieldDefinitions.fieldType,
          required: companyFieldDefinitions.required,
          options: companyFieldDefinitions.options,
          defaultValue: companyFieldDefinitions.defaultValue,
          validationRules: companyFieldDefinitions.validationRules,
        })
        .from(companyFieldDefinitions)
        .where(
          and(
            eq(companyFieldDefinitions.companyId, context.companyId),
            eq(companyFieldDefinitions.entity, "orders"),
            eq(companyFieldDefinitions.active, true),
          ),
        );

      fieldDefs = defs.map((d) => ({
        ...d,
        options: d.options as string[] | null,
        validationRules: d.validationRules as FieldDefinition["validationRules"],
      }));
    }

    // Apply defaults and validate custom fields
    if (fieldDefs.length > 0) {
      const customFieldErrors: Array<{ trackingId: string; errors: string[] }> = [];

      for (const order of validOrders) {
        if (order.customFields) {
          order.customFields = applyDefaults(
            fieldDefs,
            order.customFields as Record<string, unknown>,
          ) as Record<string, unknown>;
        }

        const errors = validateCustomFields(
          fieldDefs,
          (order.customFields || {}) as Record<string, unknown>,
        );

        if (errors.length > 0) {
          customFieldErrors.push({
            trackingId: order.trackingId,
            errors: errors.map((e) => `${e.label}: ${e.message}`),
          });
        }
      }

      if (customFieldErrors.length > 0) {
        return NextResponse.json(
          {
            error: "Custom field validation failed",
            details: customFieldErrors.slice(0, 10),
          },
          { status: 400 },
        );
      }
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
      // New fields for multi-company support
      orderValue: order.orderValue || null,
      unitsRequired: order.unitsRequired || null,
      orderType: order.orderType || null,
      priority: order.priority || null,
      // Time windows
      timeWindowStart: order.timeWindowStart || null,
      timeWindowEnd: order.timeWindowEnd || null,
      // Custom fields
      customFields: order.customFields || {},
      status: "PENDING" as const,
      active: true,
    }));

    const createdOrders = await db
      .insert(orders)
      .values(insertData)
      .returning({ id: orders.id });

    return NextResponse.json({
      success: true,
      created: createdOrders.length,
      skipped: existingTrackingIds.size,
      invalid: invalidOrders.length,
      duplicates: validated.skipDuplicates
        ? Array.from(existingTrackingIds).slice(0, 10)
        : [],
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
        { status: 400 },
      );
    }

    console.error("Batch order creation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
