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
 * surface them alongside the solver-level constraints. Errors carry a typed
 * `DriverAssignmentErrorCode` (SEMANTICS A15) — classification is a total
 * switch over that code, never string parsing.
 */

import type {
  DriverAssignmentError,
  DriverAssignmentErrorCode,
} from "@/lib/routing/assignment-errors";
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
    errors: DriverAssignmentError[];
  };
}

function violationCodeFor(code: DriverAssignmentErrorCode): Violation["code"] {
  switch (code) {
    case "LICENSE_EXPIRED":
    case "LICENSE_EXPIRY_MISSING":
    case "LICENSE_CATEGORY_MISMATCH":
      return "DRIVER_LICENSE_MISMATCH";
    case "MISSING_SKILLS":
      return "DRIVER_SKILL_MISSING";
    case "DRIVER_UNAVAILABLE":
      return "DRIVER_UNAVAILABLE";
    case "DRIVER_NOT_FOUND":
    case "VEHICLE_NOT_FOUND":
      return "DRIVER_ASSIGNMENT_ERROR";
  }
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
      violations.push({
        code: violationCodeFor(err.code),
        severity: "HARD",
        vehicleId: route.vehicleId,
        vehicleIdentifier: route.vehicleIdentifier,
        orderId: route.driverId,
        trackingId: route.driverName,
        message: err.message,
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
