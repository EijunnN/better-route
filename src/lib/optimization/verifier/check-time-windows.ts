import type { VerifierFn, Violation } from "./types";
import { hhmmToSeconds, normalizeArrivalSeconds, orderById, secondsToHHMM, vehicleById } from "./utils";

/**
 * For each stop with a defined order time-window, verify arrival is inside the window.
 * Severity follows the order's strictness (defaulting to HARD if unknown — the order
 * passed a time window, so we treat violations as real unless told otherwise).
 *
 * Also checks vehicle workday windows (HARD): every stop arrival must be inside the
 * vehicle's [timeWindowStart, timeWindowEnd] if those are set.
 */
export const checkTimeWindows: VerifierFn = ({ orders, vehicles, result }) => {
  const violations: Violation[] = [];
  const orderMap = orderById(orders);
  const vehicleMap = vehicleById(vehicles);

  for (const route of result.routes) {
    const vehicle = vehicleMap.get(route.vehicleId);
    const vWindowStart = hhmmToSeconds(vehicle?.timeWindowStart);
    const vWindowEnd = hhmmToSeconds(vehicle?.timeWindowEnd);

    for (const stop of route.stops) {
      const order = orderMap.get(stop.orderId);
      const arrival = normalizeArrivalSeconds(stop.arrivalTime);

      if (arrival === null) {
        // Solver did not emit arrival time. Only report if the order had
        // a time window — you can't verify a constraint without the signal.
        if (order?.timeWindowStart || order?.timeWindowEnd) {
          violations.push({
            code: "TIME_WINDOW_MISSING_ON_OUTPUT",
            severity: "INFO",
            vehicleId: route.vehicleId,
            vehicleIdentifier: route.vehicleIdentifier,
            orderId: stop.orderId,
            trackingId: stop.trackingId,
            stopSequence: stop.sequence,
            message: `Order has time window but solver did not emit arrivalTime`,
          });
        }
        continue;
      }

      const orderStart = hhmmToSeconds(order?.timeWindowStart);
      const orderEnd = hhmmToSeconds(order?.timeWindowEnd);

      if (orderStart !== null && arrival < orderStart - 60) {
        violations.push({
          code: "TIME_WINDOW_VIOLATED",
          severity: "HARD",
          vehicleId: route.vehicleId,
          vehicleIdentifier: route.vehicleIdentifier,
          orderId: stop.orderId,
          trackingId: stop.trackingId,
          stopSequence: stop.sequence,
          expected: `>= ${order?.timeWindowStart}`,
          actual: secondsToHHMM(arrival),
          message: `Arrived before time window starts`,
        });
      }
      if (orderEnd !== null && arrival > orderEnd + 60) {
        violations.push({
          code: "TIME_WINDOW_VIOLATED",
          severity: "HARD",
          vehicleId: route.vehicleId,
          vehicleIdentifier: route.vehicleIdentifier,
          orderId: stop.orderId,
          trackingId: stop.trackingId,
          stopSequence: stop.sequence,
          expected: `<= ${order?.timeWindowEnd}`,
          actual: secondsToHHMM(arrival),
          message: `Arrived after time window ends`,
        });
      }

      if (vWindowStart !== null && arrival < vWindowStart - 60) {
        violations.push({
          code: "VEHICLE_WORKDAY_EXCEEDED",
          severity: "HARD",
          vehicleId: route.vehicleId,
          vehicleIdentifier: route.vehicleIdentifier,
          orderId: stop.orderId,
          trackingId: stop.trackingId,
          stopSequence: stop.sequence,
          expected: `>= ${vehicle?.timeWindowStart}`,
          actual: secondsToHHMM(arrival),
          message: `Stop arrival before vehicle workday starts`,
        });
      }
      if (vWindowEnd !== null && arrival > vWindowEnd + 60) {
        violations.push({
          code: "VEHICLE_WORKDAY_EXCEEDED",
          severity: "HARD",
          vehicleId: route.vehicleId,
          vehicleIdentifier: route.vehicleIdentifier,
          orderId: stop.orderId,
          trackingId: stop.trackingId,
          stopSequence: stop.sequence,
          expected: `<= ${vehicle?.timeWindowEnd}`,
          actual: secondsToHHMM(arrival),
          message: `Stop arrival after vehicle workday ends`,
        });
      }
    }
  }

  return violations;
};
