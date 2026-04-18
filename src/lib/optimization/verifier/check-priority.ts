import type { VerifierFn, Violation } from "./types";
import { orderById } from "./utils";

/**
 * Priority / orderType weak check:
 * URGENT orders should never be left unassigned when an equivalent vehicle exists.
 * This is a SOFT check because sometimes geometry / capacity truly prevents it.
 */
export const checkPriority: VerifierFn = ({ orders, result }) => {
  const violations: Violation[] = [];
  const orderMap = orderById(orders);

  for (const un of result.unassigned) {
    const order = orderMap.get(un.orderId);
    if (!order) continue;
    if (order.orderType === "URGENT") {
      violations.push({
        code: "PRIORITY_INVERSION",
        severity: "SOFT",
        orderId: un.orderId,
        trackingId: un.trackingId,
        message: `URGENT order was left unassigned (reason: ${un.reason})`,
      });
    }
    if ((order.priority ?? 0) >= 90) {
      violations.push({
        code: "PRIORITY_INVERSION",
        severity: "SOFT",
        orderId: un.orderId,
        trackingId: un.trackingId,
        expected: `priority=${order.priority} assigned`,
        actual: "unassigned",
        message: `High-priority order (${order.priority}) unassigned (reason: ${un.reason})`,
      });
    }
  }

  return violations;
};
