import { and, desc, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ORDER_STATUS, orders, vehicleSkills } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { requireTenantContext, setTenantContext } from "@/lib/infra/tenant";

import { extractTenantContext } from "@/lib/routing/route-helpers";

// GET - Get summary of pending orders with capacity and skill requirements
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

    // Get all pending orders
    const pendingOrders = await db
      .select({
        id: orders.id,
        trackingId: orders.trackingId,
        address: orders.address,
        weightRequired: orders.weightRequired,
        volumeRequired: orders.volumeRequired,
        requiredSkills: orders.requiredSkills,
      })
      .from(orders)
      .where(
        withTenantFilter(orders, [
          eq(orders.status, ORDER_STATUS.PENDING),
          eq(orders.active, true),
        ]),
      )
      .orderBy(desc(orders.createdAt));

    // Calculate aggregate statistics
    const totalOrders = pendingOrders.length;

    const ordersWithWeight = pendingOrders.filter(
      (o) => o.weightRequired !== null && o.weightRequired !== undefined,
    );
    const totalWeight = ordersWithWeight.reduce(
      (sum, o) => sum + (o.weightRequired || 0),
      0,
    );
    const maxWeight = ordersWithWeight.length
      ? Math.max(...ordersWithWeight.map((o) => o.weightRequired || 0))
      : 0;

    const ordersWithVolume = pendingOrders.filter(
      (o) => o.volumeRequired !== null && o.volumeRequired !== undefined,
    );
    const totalVolume = ordersWithVolume.reduce(
      (sum, o) => sum + (o.volumeRequired || 0),
      0,
    );
    const maxVolume = ordersWithVolume.length
      ? Math.max(...ordersWithVolume.map((o) => o.volumeRequired || 0))
      : 0;

    // Collect unique required skills
    const skillCodes = new Set<string>();
    pendingOrders.forEach((order) => {
      if (order.requiredSkills) {
        try {
          const skills =
            typeof order.requiredSkills === "string"
              ? JSON.parse(order.requiredSkills)
              : order.requiredSkills;
          if (Array.isArray(skills)) {
            for (const skill of skills) {
              skillCodes.add(skill);
            }
          }
        } catch {
          // Skip invalid JSON
        }
      }
    });

    // Fetch skill details for required skills
    let requiredSkillDetails: Array<{
      code: string;
      name: string;
      category: string | null;
      description: string | null;
    }> = [];
    if (skillCodes.size > 0) {
      requiredSkillDetails = await db
        .select({
          code: vehicleSkills.code,
          name: vehicleSkills.name,
          category: vehicleSkills.category,
          description: vehicleSkills.description,
        })
        .from(vehicleSkills)
        .where(
          and(
            eq(vehicleSkills.companyId, context.companyId),
            eq(vehicleSkills.active, true),
            sql`${vehicleSkills.code} = ANY(${Array.from(skillCodes)})`,
          ),
        );
    }

    return NextResponse.json({
      data: {
        totalOrders,
        totalWeight,
        maxWeight,
        totalVolume,
        maxVolume,
        ordersWithWeightRequirements: ordersWithWeight.length,
        ordersWithVolumeRequirements: ordersWithVolume.length,
        requiredSkills: requiredSkillDetails,
        orders: pendingOrders.slice(0, 100), // Return first 100 orders for preview
      },
    });
  } catch (error) {
    console.error("[Pending Summary] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
