import {
  type CSVValidationError,
  ERROR_TYPES,
} from "./types";

/**
 * Create a validation error with proper categorization
 */
export function createValidationError(
  row: number,
  field: string,
  message: string,
  severity: "critical" | "warning" | "info" = "critical",
  errorType: string = ERROR_TYPES.VALIDATION,
  value?: unknown,
): CSVValidationError {
  return { row, field, message, severity, errorType, value };
}

/**
 * Calculate error summary statistics
 */
export function calculateErrorSummary(errors: CSVValidationError[]) {
  const byField: Record<string, number> = {};
  const bySeverity: Record<string, number> = {
    critical: 0,
    warning: 0,
    info: 0,
  };
  const byErrorType: Record<string, number> = {};

  for (const error of errors) {
    byField[error.field] = (byField[error.field] || 0) + 1;
    bySeverity[error.severity] = (bySeverity[error.severity] || 0) + 1;
    byErrorType[error.errorType] = (byErrorType[error.errorType] || 0) + 1;
  }

  return { byField, bySeverity, byErrorType };
}
