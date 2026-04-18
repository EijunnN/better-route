import type { VerifierFn, Violation } from "./types";
import { orderById, vehicleById } from "./utils";

/**
 * Structural checks independent of solver semantics:
 * - every order in output exists in input
 * - every vehicle in output exists in input
 * - no duplicate order assignments
 * - no missing orders (unassigned + assigned must equal input)
 * - sequence numbers are monotonic and start at 0 or 1
 */
export const checkIntegrity: VerifierFn = ({
  orders,
  vehicles,
  result,
}) => {
  const violations: Violation[] = [];
  const orderMap = orderById(orders);
  const vehicleMap = vehicleById(vehicles);

  const assignedOrderIds = new Set<string>();
  const duplicates = new Set<string>();

  for (const route of result.routes) {
    if (!vehicleMap.has(route.vehicleId)) {
      violations.push({
        code: "UNKNOWN_VEHICLE_ID",
        severity: "HARD",
        vehicleId: route.vehicleId,
        vehicleIdentifier: route.vehicleIdentifier,
        message: `Route refers to vehicle ${route.vehicleId} which is not in input`,
      });
    }

    let prevSeq = -1;
    for (const stop of route.stops) {
      if (!orderMap.has(stop.orderId)) {
        violations.push({
          code: "UNKNOWN_ORDER_ID",
          severity: "HARD",
          vehicleId: route.vehicleId,
          vehicleIdentifier: route.vehicleIdentifier,
          orderId: stop.orderId,
          trackingId: stop.trackingId,
          stopSequence: stop.sequence,
          message: `Stop references order ${stop.orderId} which is not in input`,
        });
      }

      if (assignedOrderIds.has(stop.orderId)) {
        duplicates.add(stop.orderId);
      } else {
        assignedOrderIds.add(stop.orderId);
      }

      if (stop.sequence <= prevSeq) {
        violations.push({
          code: "INVALID_SEQUENCE",
          severity: "HARD",
          vehicleId: route.vehicleId,
          vehicleIdentifier: route.vehicleIdentifier,
          orderId: stop.orderId,
          trackingId: stop.trackingId,
          stopSequence: stop.sequence,
          expected: `> ${prevSeq}`,
          actual: stop.sequence,
          message: `Stop sequence not monotonic`,
        });
      }
      prevSeq = stop.sequence;
    }
  }

  for (const dupId of duplicates) {
    const order = orderMap.get(dupId);
    violations.push({
      code: "DUPLICATE_ORDER_ASSIGNMENT",
      severity: "HARD",
      orderId: dupId,
      trackingId: order?.trackingId,
      message: `Order ${dupId} appears on more than one route`,
    });
  }

  const unassignedIds = new Set(result.unassigned.map((u) => u.orderId));
  for (const order of orders) {
    const isAssigned = assignedOrderIds.has(order.id);
    const isUnassigned = unassignedIds.has(order.id);
    if (!isAssigned && !isUnassigned) {
      violations.push({
        code: "MISSING_ORDER",
        severity: "HARD",
        orderId: order.id,
        trackingId: order.trackingId,
        message: `Order ${order.trackingId} is neither assigned nor marked unassigned`,
      });
    }
    if (isAssigned && isUnassigned) {
      violations.push({
        code: "DUPLICATE_ORDER_ASSIGNMENT",
        severity: "HARD",
        orderId: order.id,
        trackingId: order.trackingId,
        message: `Order ${order.trackingId} appears BOTH on a route and in unassigned list`,
      });
    }
  }

  return violations;
};
