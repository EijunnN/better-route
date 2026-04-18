import type { VerifierFn, Violation } from "./types";
import { orderById, vehicleById } from "./utils";

/**
 * Every order assigned to a vehicle must have all required skills covered
 * by the vehicle's skill set.
 */
export const checkSkills: VerifierFn = ({ orders, vehicles, result }) => {
  const violations: Violation[] = [];
  const orderMap = orderById(orders);
  const vehicleMap = vehicleById(vehicles);

  for (const route of result.routes) {
    const vehicle = vehicleMap.get(route.vehicleId);
    const vehicleSkills = new Set(vehicle?.skills ?? []);

    for (const stop of route.stops) {
      const order = orderMap.get(stop.orderId);
      const required = order?.skillsRequired ?? [];
      for (const skill of required) {
        if (!vehicleSkills.has(skill)) {
          violations.push({
            code: "SKILL_MISSING",
            severity: "HARD",
            vehicleId: route.vehicleId,
            vehicleIdentifier: route.vehicleIdentifier,
            orderId: stop.orderId,
            trackingId: stop.trackingId,
            stopSequence: stop.sequence,
            expected: `vehicle to have skill ${skill}`,
            actual: `vehicle skills: ${[...vehicleSkills].join(",") || "(none)"}`,
            message: `Order requires skill "${skill}" that vehicle does not provide`,
          });
        }
      }
    }
  }

  return violations;
};
