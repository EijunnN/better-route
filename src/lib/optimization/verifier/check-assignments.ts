/**
 * Driver-assignment verifier.
 *
 * The routing verifier operates on solver-adapter shapes (OptimizerOrder /
 * OptimizerVehicle). Driver assignment, however, happens at the runner level:
 * `assignDriversToRoutes` + `validateDriverAssignment` attach
 * { score, warnings[], errors[] } to each runner-shape route.
 *
 * This check reads that `assignmentQuality` — plus a ROUTE_WITHOUT_DRIVER
 * sentinel — and converts it into Violations so the UI panel and CI gate
 * surface them alongside the solver-level constraints.
 */

import type { Violation } from "./types";

export interface AssignmentRouteInput {
  vehicleId: string;
  vehicleIdentifier: string;
  driverId?: string;
  driverName?: string;
  stopCount: number;
  assignmentQuality?: {
    score: number;
    warnings: string[];
    errors: string[];
  };
}

/**
 * Map a free-form assignment-error string to a specific ViolationCode + severity.
 * The strings come from `validateDriverAssignment` in lib/routing/driver-assignment.ts
 * — keep this in sync with the messages emitted there.
 */
function classifyAssignmentError(message: string): {
  code: Violation["code"];
  severity: Violation["severity"];
} {
  const lower = message.toLowerCase();
  if (lower.includes("licens")) {
    return { code: "DRIVER_LICENSE_MISMATCH", severity: "HARD" };
  }
  if (lower.includes("skill") || lower.includes("habilidad")) {
    return { code: "DRIVER_SKILL_MISSING", severity: "HARD" };
  }
  if (
    lower.includes("unavailable") ||
    lower.includes("absent") ||
    lower.includes("no disponible")
  ) {
    return { code: "DRIVER_UNAVAILABLE", severity: "HARD" };
  }
  return { code: "DRIVER_ASSIGNMENT_ERROR", severity: "HARD" };
}

/**
 * Run the assignment-level checks against a list of runner routes.
 * Pure function — no DB, no throws.
 */
export function checkDriverAssignments(
  routes: AssignmentRouteInput[],
): Violation[] {
  const violations: Violation[] = [];

  for (const route of routes) {
    // A route with stops but no driver is the worst case: the plan is
    // executable only if someone is manually assigned before confirmation.
    if (route.stopCount > 0 && !route.driverId) {
      violations.push({
        code: "ROUTE_WITHOUT_DRIVER",
        severity: "HARD",
        vehicleId: route.vehicleId,
        vehicleIdentifier: route.vehicleIdentifier,
        message: `Ruta con ${route.stopCount} parada${
          route.stopCount === 1 ? "" : "s"
        } no tiene conductor asignado`,
      });
      continue;
    }

    const quality = route.assignmentQuality;
    if (!quality) continue;

    for (const err of quality.errors) {
      const { code, severity } = classifyAssignmentError(err);
      violations.push({
        code,
        severity,
        vehicleId: route.vehicleId,
        vehicleIdentifier: route.vehicleIdentifier,
        orderId: route.driverId,
        trackingId: route.driverName,
        message: err,
      });
    }
    for (const warn of quality.warnings) {
      violations.push({
        code: "DRIVER_ASSIGNMENT_WARNING",
        severity: "SOFT",
        vehicleId: route.vehicleId,
        vehicleIdentifier: route.vehicleIdentifier,
        orderId: route.driverId,
        trackingId: route.driverName,
        message: warn,
      });
    }
  }

  return violations;
}
