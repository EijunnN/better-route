import type { VerifierFn, Violation } from "./types";

/**
 * Any unassigned order is an INFO-level signal. If the scenario expected 0 unassigned
 * orders, the harness can promote these to HARD via its expected invariants.
 */
export const checkUnassigned: VerifierFn = ({ result }) => {
  const violations: Violation[] = [];
  for (const un of result.unassigned) {
    violations.push({
      code: "UNASSIGNED_ORDER",
      severity: "INFO",
      orderId: un.orderId,
      trackingId: un.trackingId,
      message: `Order unassigned — reason reported by solver: ${un.reason}`,
    });
  }
  return violations;
};
