import type { VerifierFn, Violation } from "./types";
import { hhmmToSeconds, normalizeArrivalSeconds, orderById, secondsToHHMM, vehicleById } from "./utils";

/**
 * When config.flexibleTimeWindows is true, VROOM widens order time windows
 * by ±30 min before solving. The verifier must match that or it will report
 * false-positive HARD violations for stops the solver correctly placed
 * inside the extended window.
 *
 * Kept in sync with vroom-optimizer.ts (timeWindowTolerance).
 */
const FLEX_TOLERANCE_SEC = 30 * 60;

/**
 * For each stop with a defined order time-window, verify arrival is inside the window.
 * Severity follows the order's strictness (defaulting to HARD if unknown — the order
 * passed a time window, so we treat violations as real unless told otherwise).
 *
 * Also checks vehicle workday windows (HARD): every stop arrival must be inside the
 * vehicle's [timeWindowStart, timeWindowEnd] if those are set.
 */
export const checkTimeWindows: VerifierFn = ({ orders, vehicles, config, result }) => {
  const violations: Violation[] = [];
  const orderMap = orderById(orders);
  const vehicleMap = vehicleById(vehicles);
  const flex = config.flexibleTimeWindows ? FLEX_TOLERANCE_SEC : 0;

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

      // VROOM semantics: `arrival` is when the vehicle reaches the location.
      // If the vehicle arrives before the time window opens, it WAITS
      // (waitingTime) until the window starts. The actual service begins at
      // `arrival + waitingTime`. We validate against the service-start time,
      // not the raw arrival — otherwise every "arrive early, wait, serve on
      // time" plan falsely reports a violation.
      const waiting = stop.waitingTime ?? 0;
      const serviceStart = arrival + waiting;

      const orderStartRaw = hhmmToSeconds(order?.timeWindowStart);
      const orderEndRaw = hhmmToSeconds(order?.timeWindowEnd);
      // Widen by flex if the caller asked the solver to accept ±30 min.
      const orderStart = orderStartRaw !== null ? orderStartRaw - flex : null;
      const orderEnd = orderEndRaw !== null ? orderEndRaw + flex : null;

      if (orderStart !== null && serviceStart < orderStart - 60) {
        violations.push({
          code: "TIME_WINDOW_VIOLATED",
          severity: "HARD",
          vehicleId: route.vehicleId,
          vehicleIdentifier: route.vehicleIdentifier,
          orderId: stop.orderId,
          trackingId: stop.trackingId,
          stopSequence: stop.sequence,
          expected: `>= ${order?.timeWindowStart}`,
          actual: secondsToHHMM(serviceStart),
          message: `Service started before time window opens`,
        });
      }
      if (orderEnd !== null && serviceStart > orderEnd + 60) {
        violations.push({
          code: "TIME_WINDOW_VIOLATED",
          severity: "HARD",
          vehicleId: route.vehicleId,
          vehicleIdentifier: route.vehicleIdentifier,
          orderId: stop.orderId,
          trackingId: stop.trackingId,
          stopSequence: stop.sequence,
          expected: `<= ${order?.timeWindowEnd}`,
          actual: secondsToHHMM(serviceStart),
          message: `Service started after time window ends`,
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
