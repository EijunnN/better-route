import { type NextRequest, NextResponse } from "next/server";
import { getAvailableOptimizers } from "@/lib/optimization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { EntityType, Action } from "@/lib/auth/authorization";
import { handleError } from "@/lib/routing/route-helpers";

// GET - List available optimization engines
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(request, EntityType.OPTIMIZATION_CONFIG, Action.READ);
    if (authResult instanceof NextResponse) return authResult;

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
    return handleError(error, "fetching optimization engines");
  }
}
