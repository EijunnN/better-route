import { and, eq, or } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, timeWindowPresets } from "@/db/schema";
import { requireTenantContext, setTenantContext } from "@/lib/infra/tenant";
import {
  getEffectiveStrictness,
  isStrictnessOverridden,
  validateTimeWindowStrictness,
} from "@/lib/optimization/time-window-strictness";

import { extractTenantContext } from "@/lib/routing/route-helpers";

/**
 * Validate orders against time window constraints
 * POST /api/orders/validate
 *
 * This endpoint checks which orders can be assigned based on their
 * time window strictness configuration. For HARD mode orders, it
 * identifies which ones cannot be assigned due to constraint violations.
 *
 * Request body (optional):
 * {
 *   "arrivalTime": "14:30",  // Expected arrival time (HH:MM format)
 *   "simulationDate": "2024-01-15"  // Date for simulation (ISO format)
 * }
 */
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

    const body = await request.json().catch(() => ({}));
    const { arrivalTime } = body;

    // Get all pending orders with their time window presets
    const context = requireTenantContext();
    const ordersData = await db
      .select({
        id: orders.id,
        trackingId: orders.trackingId,
        customerName: orders.customerName,
        address: orders.address,
        status: orders.status,
        timeWindowPresetId: orders.timeWindowPresetId,
        strictness: orders.strictness,
        promisedDate: orders.promisedDate,
        // Preset details
        presetId: timeWindowPresets.id,
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
          eq(orders.companyId, context.companyId),
          eq(orders.active, true),
          or(eq(orders.status, "PENDING"), eq(orders.status, "ASSIGNED")),
        ),
      );

    // Analyze each order
    const assignableOrders: Array<Record<string, unknown>> = [];
    const unassignableOrders: Array<Record<string, unknown>> = [];
    const softModeOrders: Array<Record<string, unknown>> = [];
    const warnings: Array<Record<string, unknown>> = [];

    for (const order of ordersData) {
      const effectiveStrictness = getEffectiveStrictness(
        order.strictness,
        order.presetStrictness || "HARD",
      );
      const isOverridden = isStrictnessOverridden(
        order.strictness,
        order.presetStrictness || "HARD",
      );

      // Order info for response
      const orderInfo = {
        id: order.id,
        trackingId: order.trackingId,
        customerName: order.customerName,
        address: order.address,
        status: order.status,
        strictness: effectiveStrictness,
        isStrictnessOverridden: isOverridden,
        presetName: order.presetName,
        presetType: order.presetType,
        timeWindow: {
          type: order.presetType,
          startTime: order.presetStartTime,
          endTime: order.presetEndTime,
          exactTime: order.presetExactTime,
          toleranceMinutes: order.presetToleranceMinutes,
        },
      };

      // If no time window preset, order is always assignable
      if (!order.timeWindowPresetId) {
        assignableOrders.push({
          ...orderInfo,
          reason: "No time window constraint",
        });
        continue;
      }

      // If arrival time provided, validate against it
      if (arrivalTime) {
        const [hours, minutes] = arrivalTime.split(":").map(Number);
        const arrivalMinutes = hours * 60 + minutes;

        let windowStart: number | null = null;
        let windowEnd: number | null = null;

        if (order.presetType === "EXACT") {
          windowStart = order.presetExactTime
            ? parseTimeToMinutes(order.presetExactTime)
            : null;
        } else {
          windowStart = order.presetStartTime
            ? parseTimeToMinutes(order.presetStartTime)
            : null;
          windowEnd = order.presetEndTime
            ? parseTimeToMinutes(order.presetEndTime)
            : null;
        }

        const validationResult = validateTimeWindowStrictness(
          effectiveStrictness,
          arrivalMinutes,
          windowStart,
          windowEnd,
          order.presetToleranceMinutes,
        );

        if (validationResult.reason === "HARD_CONSTRAINT_VIOLATION") {
          unassignableOrders.push({
            ...orderInfo,
            reason: "Hard time window constraint violation",
            details: validationResult.warning,
            arrivalTime,
          });
        } else if (validationResult.penalty) {
          softModeOrders.push({
            ...orderInfo,
            penalty: validationResult.penalty,
            warning: validationResult.warning,
            arrivalTime,
          });
        } else {
          assignableOrders.push({
            ...orderInfo,
            reason: "Within time window",
          });
        }
      } else {
        // No arrival time provided, just categorize by strictness
        if (effectiveStrictness === "HARD") {
          assignableOrders.push({
            ...orderInfo,
            reason: "Hard constraint (will be validated on assignment)",
          });
        } else {
          softModeOrders.push({
            ...orderInfo,
            reason: "Soft constraint (violations allowed with penalty)",
          });
        }
      }

      // Warn about orders without time window presets
      if (!order.timeWindowPresetId) {
        warnings.push({
          orderId: order.id,
          trackingId: order.trackingId,
          warning: "Order has no time window preset assigned",
        });
      }
    }

    const result = {
      summary: {
        total: ordersData.length,
        assignable: assignableOrders.length,
        unassignable: unassignableOrders.length,
        softMode: softModeOrders.length,
        hardConstraint: assignableOrders.filter((o) => o.strictness === "HARD")
          .length,
      },
      violations: unassignableOrders,
      softModeOrders,
      assignableOrders,
      warnings,
    };

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to validate orders",
      },
      { status: 500 },
    );
  }
}

// Helper to parse time string to minutes
function parseTimeToMinutes(timeString: string): number {
  const [hours, minutes] = timeString.split(":").map(Number);
  return hours * 60 + minutes;
}

// GET - Get validation summary (no simulation)
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

    const context = requireTenantContext();

    // Get summary of orders by strictness
    const summary = await db
      .select({
        presetStrictness: timeWindowPresets.strictness,
        orderStrictness: orders.strictness,
        count: orders.id,
      })
      .from(orders)
      .leftJoin(
        timeWindowPresets,
        eq(orders.timeWindowPresetId, timeWindowPresets.id),
      )
      .where(
        and(
          eq(orders.companyId, context.companyId),
          eq(orders.active, true),
          eq(orders.status, "PENDING"),
        ),
      );

    let hardCount = 0;
    let softCount = 0;
    let overriddenCount = 0;

    for (const row of summary) {
      const effective = row.orderStrictness || row.presetStrictness || "HARD";
      if (effective === "HARD") hardCount++;
      else softCount++;

      if (row.orderStrictness !== null) {
        overriddenCount++;
      }
    }

    const noPresetCount = await db
      .select({ count: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.companyId, context.companyId),
          eq(orders.active, true),
          eq(orders.status, "PENDING"),
          eq(orders.timeWindowPresetId, null as unknown as string),
        ),
      );

    return NextResponse.json({
      summary: {
        totalPending: summary.length,
        hardConstraint: hardCount,
        softConstraint: softCount,
        strictnessOverridden: overriddenCount,
        noTimeWindowPreset: noPresetCount.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to get validation summary",
      },
      { status: 500 },
    );
  }
}
