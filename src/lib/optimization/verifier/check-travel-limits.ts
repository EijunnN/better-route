import type { VerifierFn, Violation } from "./types";

/**
 * Enforce per-route config limits:
 * - maxDistanceKm  → HARD if totalDistance exceeds
 * - maxTravelTimeMinutes → HARD if totalTravelTime exceeds
 */
export const checkTravelLimits: VerifierFn = ({ config, result }) => {
  const violations: Violation[] = [];

  for (const route of result.routes) {
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

    if (config.maxTravelTimeMinutes && route.totalTravelTime > 0) {
      const travelMin = route.totalTravelTime / 60;
      if (travelMin > config.maxTravelTimeMinutes + 1) {
        violations.push({
          code: "MAX_TRAVEL_TIME_EXCEEDED",
          severity: "HARD",
          vehicleId: route.vehicleId,
          vehicleIdentifier: route.vehicleIdentifier,
          expected: `<= ${config.maxTravelTimeMinutes} min`,
          actual: `${travelMin.toFixed(1)} min`,
          message: `Route travel time exceeds maxTravelTimeMinutes`,
        });
      }
    }
  }

  return violations;
};
