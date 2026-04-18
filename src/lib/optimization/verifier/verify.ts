import type { VerifierInput, VerifierReport, Violation } from "./types";
import { checkIntegrity } from "./check-integrity";
import { checkTimeWindows } from "./check-time-windows";
import { checkSkills } from "./check-skills";
import { checkCapacity } from "./check-capacity";
import { checkPriority } from "./check-priority";
import { checkTravelLimits } from "./check-travel-limits";
import { checkUnassigned } from "./check-unassigned";

const ALL_CHECKS = [
  checkIntegrity,
  checkTimeWindows,
  checkSkills,
  checkCapacity,
  checkPriority,
  checkTravelLimits,
  checkUnassigned,
];

/**
 * Run every verifier over the given input and produce a report.
 * Pure function — no I/O, no throws.
 */
export function verify(input: VerifierInput): VerifierReport {
  const violations: Violation[] = [];
  for (const fn of ALL_CHECKS) {
    violations.push(...fn(input));
  }

  const summary = {
    hard: 0,
    soft: 0,
    info: 0,
    byCode: {} as Record<string, number>,
  };
  for (const v of violations) {
    if (v.severity === "HARD") summary.hard++;
    else if (v.severity === "SOFT") summary.soft++;
    else summary.info++;
    summary.byCode[v.code] = (summary.byCode[v.code] ?? 0) + 1;
  }

  const assignedCount = input.result.routes.reduce(
    (acc, r) => acc + r.stops.length,
    0,
  );

  return {
    optimizer: input.result.optimizer,
    violations,
    summary,
    totals: {
      ordersInput: input.orders.length,
      ordersAssigned: assignedCount,
      ordersUnassigned: input.result.unassigned.length,
      routes: input.result.routes.length,
    },
  };
}
