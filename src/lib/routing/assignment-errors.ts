/**
 * Structured driver-assignment errors (SEMANTICS A15).
 *
 * `validateDriverAssignment` / `calculateDriverScore` used to emit free-form
 * strings that the verifier re-classified by substring matching — a fragile
 * coupling that broke the moment a message was reworded. Every assignment
 * error now carries a typed code; the message is display-only.
 *
 * Runtime-dependency-free on purpose: consumed by the verifier
 * (`check-assignments`), the solved-plan Zod schemas, and the routing layer
 * without pulling the DB module in.
 */

export const DRIVER_ASSIGNMENT_ERROR_CODES = [
  "DRIVER_NOT_FOUND",
  "VEHICLE_NOT_FOUND",
  "LICENSE_EXPIRED",
  "LICENSE_EXPIRY_MISSING",
  "LICENSE_CATEGORY_MISMATCH",
  "MISSING_SKILLS",
  "DRIVER_UNAVAILABLE",
] as const;

export type DriverAssignmentErrorCode =
  (typeof DRIVER_ASSIGNMENT_ERROR_CODES)[number];

export interface DriverAssignmentError {
  code: DriverAssignmentErrorCode;
  /** Human-readable detail for UI/logs. Never used for classification. */
  message: string;
}
