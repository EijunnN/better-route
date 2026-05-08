import { type NextRequest, NextResponse } from "next/server";
import { isVroomAvailable } from "@/lib/optimization/vroom-client";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { EntityType, Action } from "@/lib/auth/authorization";
import { handleError } from "@/lib/routing/route-helpers";

// GET - List available optimization engines.
// VROOM is the only supported solver after PyVRP was removed (see ADR / CONTEXT.md
// invariants). The previous IOptimizer / VroomAdapter / factory indirection was
// deleted as a hypothetical seam; this route now reports the static VROOM
// capabilities + a runtime availability probe.
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.OPTIMIZATION_CONFIG,
      Action.READ,
    );
    if (authResult instanceof NextResponse) return authResult;

    const available = await isVroomAvailable();

    return NextResponse.json({
      data: {
        optimizers: [
          {
            type: "VROOM" as const,
            name: "VROOM",
            displayName: "Optimización Rápida",
            description: "VROOM solver",
            available,
            capabilities: {
              supportsTimeWindows: true,
              supportsSkills: true,
              supportsMultiDimensionalCapacity: true,
              supportsPriorities: true,
              supportsBalancing: true,
              maxOrders: 10000,
              maxVehicles: 500,
              speed: "fast" as const,
              quality: "good" as const,
            },
          },
        ],
        recommended: "VROOM" as const,
      },
    });
  } catch (error) {
    return handleError(error, "fetching optimization engines");
  }
}
