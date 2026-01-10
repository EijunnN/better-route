import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationConfigurations } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/tenant";
import { logCreate } from "@/lib/audit";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";

const presetSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name too long"),
  objective: z.enum(["DISTANCE", "TIME", "BALANCED"]).default("BALANCED"),
  capacityEnabled: z.boolean().default(true),
  workWindowStart: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  workWindowEnd: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  serviceTimeMinutes: z.number().int().positive().default(10),
  timeWindowStrictness: z.enum(["HARD", "SOFT"]).default("SOFT"),
  penaltyFactor: z.number().int().min(1).max(20).default(3),
  maxRoutes: z.number().int().positive().optional(),
}).refine(
  (data) => {
    const [startHour, startMin] = data.workWindowStart.split(':').map(Number);
    const [endHour, endMin] = data.workWindowEnd.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    return endMinutes > startMinutes;
  },
  {
    message: "Work window end time must be after start time",
    path: ["workWindowEnd"],
  }
);

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

// GET - List presets
export async function GET(request: NextRequest) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json({ error: "Missing tenant context" }, { status: 401 });
  }

  setTenantContext(tenantCtx);

  try {
    const presets = await db
      .select({
        id: optimizationConfigurations.id,
        name: optimizationConfigurations.name,
        objective: optimizationConfigurations.objective,
        capacityEnabled: optimizationConfigurations.capacityEnabled,
        workWindowStart: optimizationConfigurations.workWindowStart,
        workWindowEnd: optimizationConfigurations.workWindowEnd,
        serviceTimeMinutes: optimizationConfigurations.serviceTimeMinutes,
        timeWindowStrictness: optimizationConfigurations.timeWindowStrictness,
        penaltyFactor: optimizationConfigurations.penaltyFactor,
        maxRoutes: optimizationConfigurations.maxRoutes,
        createdAt: optimizationConfigurations.createdAt,
      })
      .from(optimizationConfigurations)
      .where(
        and(
          withTenantFilter(optimizationConfigurations),
          eq(optimizationConfigurations.status, "DRAFT")
        )
      )
      .orderBy(desc(optimizationConfigurations.createdAt));

    return NextResponse.json({ data: presets });
  } catch (error) {
    console.error("Error fetching presets:", error);
    return NextResponse.json(
      { error: "Failed to fetch presets" },
      { status: 500 }
    );
  }
}

// POST - Create preset
export async function POST(request: NextRequest) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json({ error: "Missing tenant context" }, { status: 401 });
  }

  setTenantContext(tenantCtx);

  try {
    const body = await request.json();
    const data = presetSchema.parse(body);

    // Create preset
    const [preset] = await db
      .insert(optimizationConfigurations)
      .values({
        companyId: tenantCtx.companyId,
        name: `Preset: ${data.name}`,
        depotLatitude: "0",
        depotLongitude: "0",
        selectedVehicleIds: "[]",
        selectedDriverIds: "[]",
        objective: data.objective,
        capacityEnabled: data.capacityEnabled,
        workWindowStart: data.workWindowStart,
        workWindowEnd: data.workWindowEnd,
        serviceTimeMinutes: data.serviceTimeMinutes,
        timeWindowStrictness: data.timeWindowStrictness,
        penaltyFactor: data.penaltyFactor,
        maxRoutes: data.maxRoutes || null,
        status: "DRAFT",
        active: true,
      })
      .returning();

    // Log creation
    await logCreate("optimization_preset", preset.id, {
      name: data.name,
    });

    return NextResponse.json({ data: preset }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "name" in error) {
      return NextResponse.json(
        { error: "Validation error", details: error },
        { status: 400 }
      );
    }
    console.error("Error creating preset:", error);
    return NextResponse.json(
      { error: "Failed to create preset" },
      { status: 500 }
    );
  }
}
