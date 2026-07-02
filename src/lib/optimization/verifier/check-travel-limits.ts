import type { VerifierFn, Violation } from "./types";

/**
 * Enforce per-route config limits:
 * - maxDistanceKm → HARD if totalDistance exceeds
 */
export const checkTravelLimits: VerifierFn = ({ config, plan }) => {
  const violations: Violation[] = [];

  for (const route of plan.routes) {
    if (config.maxDistanceKm && route.totalDistance > 0) {
      const distanceKm = route.totalDistance / 1000;
      if (distanceKm > config.maxDistanceKm + 0.5) {
        violations.push({
          code: "MAX_DISTANCE_EXCEEDED",
          severity: "HARD",
          vehicleId: route.vehicleId,
          vehicleIdentifier: route.vehicleIdentifier,
          expected: `<= ${config.maxDistanceKm} km`,
          actual: `${distanceKm.toFixed(2)} km`,
          message: `Route distance exceeds maxDistanceKm`,
        });
      }
    }
  }

  return violations;
};
