import { FLEX_TIME_WINDOW_TOLERANCE_SECONDS } from "../constants";
import { resolveTimeWindowEdges } from "../time-window-policy";
import type { VerifierFn, Violation } from "./types";
import {
  normalizeArrivalSeconds,
  orderById,
  secondsToHHMM,
  stopArrivalSeconds,
  vehicleById,
} from "./utils";

/**
 * For each stop with a defined order time-window, verify arrival is inside the window.
 * Severity follows the order's strictness (defaulting to HARD if unknown — the order
 * passed a time window, so we treat violations as real unless told otherwise).
 *
 * Also checks vehicle workday windows (HARD): every stop arrival must be inside the
 * vehicle's [timeWindowStart, timeWindowEnd] if those are set.
 */
export const checkTimeWindows: VerifierFn = ({
  orders,
  vehicles,
  config,
  plan,
}) => {
  const violations: Violation[] = [];
  const orderMap = orderById(orders);
  const vehicleMap = vehicleById(vehicles);
  // Same constant the solver used to widen the windows (SEMANTICS A1).
  const flex = config.flexibleTimeWindows
    ? FLEX_TIME_WINDOW_TOLERANCE_SECONDS
    : 0;

  for (const route of plan.routes) {
    const vehicle = vehicleMap.get(route.vehicleId);
    // Same predicate the solver used (resolveTimeWindowEdges, A7): a
    // malformed workday was never sent to VROOM, so there is nothing to
    // verify against.
    const vehicleWindow = resolveTimeWindowEdges(
      vehicle?.timeWindowStart,
      vehicle?.timeWindowEnd,
    );
    const vWindowStart = vehicleWindow ? vehicleWindow[0] : null;
    const vWindowEnd = vehicleWindow ? vehicleWindow[1] : null;

    for (const stop of route.stops) {
      const order = orderMap.get(stop.orderId);
      const arrival = normalizeArrivalSeconds(
        stopArrivalSeconds(stop) ?? undefined,
      );

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
      const waiting = stop.waitingTimeSeconds ?? 0;
      const serviceStart = arrival + waiting;

      // Shared policy with the solver (A7): a window with a single edge,
      // invalid format ("24:00", garbage) or start > end was DROPPED by
      // createVroomJob — VROOM never saw the constraint, so flagging a HARD
      // violation against it is a false positive. Surface it as INFO so the
      // data-quality problem is still visible.
      const orderWindow = resolveTimeWindowEdges(
        order?.timeWindowStart,
        order?.timeWindowEnd,
      );
      if (!orderWindow && (order?.timeWindowStart || order?.timeWindowEnd)) {
        violations.push({
          code: "TIME_WINDOW_MALFORMED",
          severity: "INFO",
          vehicleId: route.vehicleId,
          vehicleIdentifier: route.vehicleIdentifier,
          orderId: stop.orderId,
          trackingId: stop.trackingId,
          stopSequence: stop.sequence,
          actual: `${order?.timeWindowStart ?? "—"}..${order?.timeWindowEnd ?? "—"}`,
          message: `Order time window is malformed and was not applied by the solver`,
        });
      }
      // Widen by flex if the caller asked the solver to accept ±30 min.
      const orderStart = orderWindow ? orderWindow[0] - flex : null;
      const orderEnd = orderWindow ? orderWindow[1] + flex : null;

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
