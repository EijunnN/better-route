import type { TIME_WINDOW_STRICTNESS } from "@/db/schema";
import type { TimeWindowValidationResult } from "./validations/order";

/**
 * Calculate penalty factor for SOFT mode time window violations
 * Default penalty factor is configurable (1x to 20x)
 */
export function calculateDelayPenalty(
  delayMinutes: number,
  penaltyFactor: number = 5,
): number {
  return delayMinutes * penaltyFactor;
}

/**
 * Check if an arrival time violates a time window constraint
 * @param arrivalTime - Expected arrival time in minutes from start of day
 * @param windowStart - Time window start in minutes from start of day
 * @param windowEnd - Time window end in minutes from start of day
 * @param toleranceMinutes - Tolerance for EXACT type windows
 * @returns true if the time window is violated
 */
export function violatesTimeWindow(
  arrivalTime: number,
  windowStart: number | null,
  windowEnd: number | null,
  toleranceMinutes: number | null = null,
): boolean {
  // For SHIFT and RANGE types
  if (windowStart !== null && windowEnd !== null) {
    return arrivalTime < windowStart || arrivalTime > windowEnd;
  }

  // For EXACT type with tolerance
  if (windowStart !== null && toleranceMinutes !== null) {
    const earlyViolation = arrivalTime < windowStart - toleranceMinutes;
    const lateViolation = arrivalTime > windowStart + toleranceMinutes;
    return earlyViolation || lateViolation;
  }

  return false;
}

/**
 * Validate time window strictness for an order assignment
 * @param strictness - HARD or SOFT mode
 * @param arrivalTime - Expected arrival time
 * @param windowStart - Time window start
 * @param windowEnd - Time window end
 * @param toleranceMinutes - Tolerance for EXACT type
 * @param penaltyFactor - Penalty factor for SOFT mode (default: 5)
 * @returns Validation result
 */
export function validateTimeWindowStrictness(
  strictness: keyof typeof TIME_WINDOW_STRICTNESS,
  arrivalTime: number,
  windowStart: number | null,
  windowEnd: number | null,
  toleranceMinutes: number | null = null,
  penaltyFactor: number = 5,
): TimeWindowValidationResult {
  const hasViolation = violatesTimeWindow(
    arrivalTime,
    windowStart,
    windowEnd,
    toleranceMinutes,
  );

  if (!hasViolation) {
    return {
      valid: true,
      canAssign: true,
    };
  }

  // HARD mode: reject violations
  if (strictness === "HARD") {
    return {
      valid: false,
      canAssign: false,
      reason: "HARD_CONSTRAINT_VIOLATION",
      warning: "Assignment violates hard time window constraint",
    };
  }

  // SOFT mode: allow with penalty
  if (windowStart !== null) {
    const delayMinutes = Math.max(0, arrivalTime - windowStart);
    const penalty = calculateDelayPenalty(delayMinutes, penaltyFactor);

    return {
      valid: true,
      canAssign: true,
      penalty,
      warning: `Time window violation: ${delayMinutes} minutes late (penalty: ${penalty})`,
    };
  }

  return {
    valid: true,
    canAssign: true,
    warning: "Time window constraint not clearly defined",
  };
}

/**
 * Calculate time in minutes from start of day (00:00)
 * @param timeString - Time in HH:MM format
 * @returns Minutes from start of day
 */
export function timeToMinutes(timeString: string): number {
  const [hours, minutes] = timeString.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Calculate compliance rate for a set of orders
 * @param totalOrders - Total number of orders
 * @param onTimeOrders - Number of orders delivered within time window
 * @returns Percentage of on-time deliveries
 */
export function calculateComplianceRate(
  totalOrders: number,
  onTimeOrders: number,
): number {
  if (totalOrders === 0) return 100;
  return Math.round((onTimeOrders / totalOrders) * 100);
}

/**
 * Get effective strictness for an order
 * Returns order's override strictness or falls back to preset strictness
 */
export function getEffectiveStrictness(
  orderStrictness: keyof typeof TIME_WINDOW_STRICTNESS | null | undefined,
  presetStrictness: keyof typeof TIME_WINDOW_STRICTNESS,
): keyof typeof TIME_WINDOW_STRICTNESS {
  return orderStrictness || presetStrictness;
}

/**
 * Check if strictness is overridden from preset
 */
export function isStrictnessOverridden(
  orderStrictness: keyof typeof TIME_WINDOW_STRICTNESS | null | undefined,
  presetStrictness: keyof typeof TIME_WINDOW_STRICTNESS,
): boolean {
  return orderStrictness !== null && orderStrictness !== presetStrictness;
}

/**
 * Format strictness for display
 */
export function formatStrictness(
  strictness: keyof typeof TIME_WINDOW_STRICTNESS,
): string {
  return strictness === "HARD"
    ? "Hard (reject violations)"
    : "Soft (minimize delays)";
}

/**
 * Get strictness color class for UI
 */
export function getStrictnessColorClass(
  strictness: keyof typeof TIME_WINDOW_STRICTNESS,
): string {
  return strictness === "HARD"
    ? "bg-destructive/10 text-destructive"
    : "bg-yellow-500/10 text-yellow-600";
}
