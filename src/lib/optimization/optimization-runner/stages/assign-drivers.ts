/**
 * Stage 4 — Assign drivers: promote each `RawSolvedRoute` to an
 * `AssignedSolvedRoute` by matching it with a driver.
 *
 * Two paths run in order:
 *   1. Vehicles with a pre-assigned driver (set on the vehicle record): use
 *      that driver directly with a perfect score, no scoring required.
 *   2. Vehicles without a pre-assigned driver: send to
 *      `assignDriversToRoutes` which scores candidate drivers and picks the
 *      best per route.
 *
 * Routes that fail to match a driver are dropped from the final plan and
 * their stops are emitted as `extraUnassigned` — the verifier flags this
 * case as a HARD violation. A route without a driver is never persisted.
 *
 * The only side effect is the call to `assignDriversToRoutes`, which itself
 * reads driver availability from the DB.
 */

import {
  assignDriversToRoutes,
  DEFAULT_ASSIGNMENT_CONFIG,
  type DriverAssignmentRequest,
  type DriverAssignmentResult,
} from "../../../routing/driver-assignment";
import type {
  AssignedSolvedRoute,
  RawSolvedRoute,
  UnassignedOrderRecord,
} from "../../solved-plan";

export interface AssignDriversArgs {
  rawRoutes: RawSolvedRoute[];
  selectedDrivers: Array<{ id: string; name: string }>;
  /** Vehicles considered for the run — used for pre-assigned driver lookup
   *  and for resolving the route's origin coordinates. */
  selectedVehicles: Array<{
    id: string;
    assignedDriverId?: string | null;
    originLatitude?: string | null;
    originLongitude?: string | null;
  }>;
  companyId: string;
  /**
   * Strategy preference: TIME ⇒ "AVAILABILITY", anything else ⇒ "BALANCED".
   */
  objective?: "DISTANCE" | "TIME" | "BALANCED" | string;
}

export interface AssignDriversResult {
  /** Routes that successfully matched a driver. */
  routes: AssignedSolvedRoute[];
  /** Stops from routes that did not match a driver, surfaced as unassigned. */
  extraUnassigned: UnassignedOrderRecord[];
}

export async function assignDrivers(
  args: AssignDriversArgs,
): Promise<AssignDriversResult> {
  const { rawRoutes, selectedDrivers, selectedVehicles, companyId } = args;

  const routeAssignments: DriverAssignmentRequest[] = [];
  const assignedDrivers = new Map<string, string>();

  const vehicleDriverMap = new Map<string, string>();
  for (const vehicle of selectedVehicles) {
    if (vehicle.assignedDriverId) {
      vehicleDriverMap.set(vehicle.id, vehicle.assignedDriverId);
    }
  }
  const driverDetailsMap = new Map(selectedDrivers.map((d) => [d.id, d]));
  const selectedDriverIds = new Set(selectedDrivers.map((d) => d.id));
  const vehiclesWithPreAssignedDrivers = new Set<string>();

  for (const rawRoute of rawRoutes) {
    const preAssignedDriverId = vehicleDriverMap.get(rawRoute.vehicleId);
    if (preAssignedDriverId && selectedDriverIds.has(preAssignedDriverId)) {
      vehiclesWithPreAssignedDrivers.add(rawRoute.vehicleId);
    } else {
      routeAssignments.push({
        companyId,
        vehicleId: rawRoute.vehicleId,
        routeStops: rawRoute.stops.map((s) => ({
          orderId: s.orderId,
          promisedDate: undefined,
        })),
        candidateDriverIds: selectedDrivers.map((d) => d.id),
        assignedDrivers,
      });
    }
  }

  const strategy = args.objective === "TIME" ? "AVAILABILITY" : "BALANCED";
  const driverAssignments =
    routeAssignments.length > 0
      ? await assignDriversToRoutes(routeAssignments, {
          ...DEFAULT_ASSIGNMENT_CONFIG,
          strategy,
        })
      : new Map<string, DriverAssignmentResult>();

  const vehicleById = new Map(selectedVehicles.map((v) => [v.id, v]));
  const routes: AssignedSolvedRoute[] = [];
  const extraUnassigned: UnassignedOrderRecord[] = [];

  for (const rawRoute of rawRoutes) {
    const preAssignedDriverId = vehicleDriverMap.get(rawRoute.vehicleId);
    let driverId: string | undefined;
    let driverName: string | undefined;
    let assignmentQuality: AssignedSolvedRoute["assignmentQuality"] | undefined;

    if (
      preAssignedDriverId &&
      vehiclesWithPreAssignedDrivers.has(rawRoute.vehicleId)
    ) {
      const driver = driverDetailsMap.get(preAssignedDriverId);
      if (driver) {
        driverId = driver.id;
        driverName = driver.name;
        assignmentQuality = { score: 100, warnings: [], errors: [] };
      }
    } else {
      const assignment = driverAssignments.get(rawRoute.vehicleId);
      if (assignment) {
        driverId = assignment.driverId;
        driverName = assignment.driverName;
        assignmentQuality = {
          score: assignment.score.score,
          warnings: assignment.score.warnings,
          errors: assignment.score.errors,
        };
      }
    }

    if (!driverId || !driverName || !assignmentQuality) {
      for (const stop of rawRoute.stops) {
        extraUnassigned.push({
          orderId: stop.orderId,
          trackingId: stop.trackingId,
          reason: `No se pudo asignar conductor al vehículo ${rawRoute.vehicleIdentifier}`,
          latitude: stop.latitude,
          longitude: stop.longitude,
          address: stop.address,
        });
      }
      continue;
    }

    const vehicle = vehicleById.get(rawRoute.vehicleId);
    const driverOrigin =
      vehicle?.originLatitude && vehicle?.originLongitude
        ? {
            latitude: parseFloat(vehicle.originLatitude),
            longitude: parseFloat(vehicle.originLongitude),
            address: undefined,
          }
        : undefined;

    routes.push({
      ...rawRoute,
      driverId,
      driverName,
      driverOrigin,
      assignmentQuality,
    });
  }

  return { routes, extraUnassigned };
}
