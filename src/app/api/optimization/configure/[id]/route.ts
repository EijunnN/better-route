import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationConfigurations, optimizationJobs, orders } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { logDelete, logUpdate } from "@/lib/infra/audit";
import { setTenantContext } from "@/lib/infra/tenant";
import type { OptimizationResult } from "@/lib/optimization/optimization-runner";
import { optimizationConfigUpdateSchema } from "@/lib/validations/optimization-config";

import { extractTenantContext } from "@/lib/routing/route-helpers";

import { safeParseJson } from "@/lib/utils/safe-json";
// GET - Get single optimization configuration
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Missing tenant context" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);
  const { id } = await params;

  try {
    const [config] = await db
      .select()
      .from(optimizationConfigurations)
      .where(
        and(
          eq(optimizationConfigurations.id, id),
          withTenantFilter(optimizationConfigurations, [], tenantCtx.companyId),
        ),
      )
      .limit(1);

    if (!config) {
      return NextResponse.json(
        { error: "Configuration not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: config });
  } catch (error) {
    console.error("Error fetching optimization configuration:", error);
    return NextResponse.json(
      { error: "Failed to fetch configuration" },
      { status: 500 },
    );
  }
}

// PATCH - Update optimization configuration
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Missing tenant context" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);
  const { id } = await params;

  try {
    const body = await request.json();
    const data = optimizationConfigUpdateSchema.parse(body);

    // Check if configuration exists
    const [existing] = await db
      .select()
      .from(optimizationConfigurations)
      .where(
        and(
          eq(optimizationConfigurations.id, id),
          withTenantFilter(optimizationConfigurations, [], tenantCtx.companyId),
        ),
      )
      .limit(1);

    if (!existing) {
      return NextResponse.json(
        { error: "Configuration not found" },
        { status: 404 },
      );
    }

    // Don't allow updates to configurations that are already being processed
    if (existing.status === "OPTIMIZING") {
      return NextResponse.json(
        {
          error:
            "Cannot modify configuration while optimization is in progress",
        },
        { status: 400 },
      );
    }

    // Separate selectedVehicleIds/selectedDriverIds and parse if strings
    const { selectedVehicleIds, selectedDriverIds, ...restData } = data;

    // Update configuration
    const [updated] = await db
      .update(optimizationConfigurations)
      .set({
        ...restData,
        ...(selectedVehicleIds !== undefined && {
          selectedVehicleIds: typeof selectedVehicleIds === "string"
            ? safeParseJson<string[]>(selectedVehicleIds)
            : selectedVehicleIds,
        }),
        ...(selectedDriverIds !== undefined && {
          selectedDriverIds: typeof selectedDriverIds === "string"
            ? safeParseJson<string[]>(selectedDriverIds)
            : selectedDriverIds,
        }),
        updatedAt: new Date(),
      })
      .where(eq(optimizationConfigurations.id, id))
      .returning();

    // Log update
    await logUpdate("optimization_configuration", id, {
      changes: data,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof Error && "name" in error) {
      return NextResponse.json(
        { error: "Validation error", details: error },
        { status: 400 },
      );
    }
    console.error("Error updating optimization configuration:", error);
    return NextResponse.json(
      { error: "Failed to update configuration" },
      { status: 500 },
    );
  }
}

// DELETE - Delete optimization configuration
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Missing tenant context" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);
  const { id } = await params;

  try {
    // Check if configuration exists
    const [existing] = await db
      .select()
      .from(optimizationConfigurations)
      .where(
        and(
          eq(optimizationConfigurations.id, id),
          withTenantFilter(optimizationConfigurations, [], tenantCtx.companyId),
        ),
      )
      .limit(1);

    if (!existing) {
      return NextResponse.json(
        { error: "Configuration not found" },
        { status: 404 },
      );
    }

    // Don't allow deletion of configurations that are being processed
    if (existing.status === "OPTIMIZING") {
      return NextResponse.json(
        {
          error:
            "Cannot delete configuration while optimization is in progress",
        },
        { status: 400 },
      );
    }

    // If plan was CONFIRMED, revert assigned orders back to PENDING
    let ordersReverted = 0;
    if (existing.status === "CONFIRMED") {
      // Find the completed job to get the result with order IDs
      const [job] = await db
        .select({ id: optimizationJobs.id, result: optimizationJobs.result })
        .from(optimizationJobs)
        .where(
          and(
            eq(optimizationJobs.configurationId, id),
            eq(optimizationJobs.status, "COMPLETED"),
          ),
        )
        .limit(1);

      if (job?.result) {
        try {
          const result = safeParseJson(job.result) as OptimizationResult;
          const assignedOrderIds: string[] = [];

          for (const route of result.routes || []) {
            for (const stop of route.stops) {
              if (stop.groupedOrderIds && stop.groupedOrderIds.length > 0) {
                assignedOrderIds.push(...stop.groupedOrderIds);
              } else {
                assignedOrderIds.push(stop.orderId);
              }
            }
          }

          if (assignedOrderIds.length > 0) {
            const updateResult = await db
              .update(orders)
              .set({ status: "PENDING", updatedAt: new Date() })
              .where(
                and(
                  inArray(orders.id, assignedOrderIds),
                  eq(orders.companyId, tenantCtx.companyId),
                  eq(orders.status, "ASSIGNED"),
                ),
              );
            ordersReverted = assignedOrderIds.length;
            console.log(
              `[Delete Plan] Reverted ${ordersReverted} orders from ASSIGNED to PENDING`,
            );
          }
        } catch {
          console.error("[Delete Plan] Failed to parse job result for order reversion");
        }
      }
    }

    // Delete configuration (cascades to jobs → route_stops → history, plan_metrics, etc.)
    await db
      .delete(optimizationConfigurations)
      .where(eq(optimizationConfigurations.id, id));

    // Log deletion
    await logDelete("optimization_configuration", id, {
      name: existing.name,
      ordersReverted,
    });

    return NextResponse.json({ success: true, ordersReverted });
  } catch (error) {
    console.error("Error deleting optimization configuration:", error);
    return NextResponse.json(
      { error: "Failed to delete configuration" },
      { status: 500 },
    );
  }
}
