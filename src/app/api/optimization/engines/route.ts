import { type NextRequest, NextResponse } from "next/server";
import { getAvailableOptimizers } from "@/lib/optimization";

// GET - List available optimization engines
export async function GET(_request: NextRequest) {
  try {
    const optimizers = await getAvailableOptimizers();

    return NextResponse.json({
      data: {
        optimizers: optimizers.map((opt) => ({
          type: opt.type,
          name: opt.name,
          displayName: opt.displayName,
          description: opt.description,
          available: opt.available,
          capabilities: {
            supportsTimeWindows: opt.capabilities.supportsTimeWindows,
            supportsSkills: opt.capabilities.supportsSkills,
            supportsMultiDimensionalCapacity: opt.capabilities.supportsMultiDimensionalCapacity,
            supportsPriorities: opt.capabilities.supportsPriorities,
            supportsBalancing: opt.capabilities.supportsBalancing,
            maxOrders: opt.capabilities.maxOrders,
            maxVehicles: opt.capabilities.maxVehicles,
            speed: opt.capabilities.typicalSpeed,
            quality: opt.capabilities.qualityLevel,
          },
        })),
        recommended: optimizers.find((o) => o.available)?.type || "VROOM",
      },
    });
  } catch (error) {
    console.error("Error fetching optimization engines:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch engines" },
      { status: 500 },
    );
  }
}
