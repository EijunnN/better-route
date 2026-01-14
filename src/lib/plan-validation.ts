import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { USER_ROLES, users } from "@/db/schema";
import type {
  OptimizationResult,
  OptimizationRoute,
} from "./optimization-runner";

/**
 * Validation severity levels
 */
export enum ValidationSeverity {
  ERROR = "ERROR", // Blocking - prevents confirmation
  WARNING = "WARNING", // Non-blocking - can override
  INFO = "INFO", // Informational only
}

/**
 * Validation issue for plan confirmation
 */
export interface ValidationIssue {
  severity: ValidationSeverity;
  category: string;
  message: string;
  routeId?: string;
  vehicleId?: string;
  driverId?: string;
  orderId?: string;
  resolution?: string;
}

/**
 * Result of plan validation
 */
export interface PlanValidationResult {
  isValid: boolean;
  canConfirm: boolean;
  issues: ValidationIssue[];
  summary: {
    totalRoutes: number;
    routesWithDrivers: number;
    routesWithoutDrivers: number;
    unassignedOrders: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
  metrics: {
    driverAssignmentCoverage: number; // 0-100
    timeWindowCompliance: number; // 0-100
    averageAssignmentQuality: number; // 0-100
  };
}

/**
 * Configuration for plan validation
 */
export interface PlanValidationConfig {
  requireAllDriversAssigned: boolean;
  requireMinimumAssignmentQuality: number; // 0-100
  requireMinimumTimeWindowCompliance: number; // 0-100
  allowUnassignedOrdersOverride: boolean;
  checkLicenseExpiry: boolean;
  licenseExpiryWarningDays: number;
  checkSkillExpiry: boolean;
  skillExpiryWarningDays: number;
}

/**
 * Default validation configuration
 */
export const DEFAULT_VALIDATION_CONFIG: PlanValidationConfig = {
  requireAllDriversAssigned: true,
  requireMinimumAssignmentQuality: 50,
  requireMinimumTimeWindowCompliance: 80,
  allowUnassignedOrdersOverride: false,
  checkLicenseExpiry: true,
  licenseExpiryWarningDays: 30,
  checkSkillExpiry: true,
  skillExpiryWarningDays: 30,
};

/**
 * Validates a complete optimization plan before confirmation
 *
 * @param companyId - The company ID for tenant isolation
 * @param result - The optimization result to validate
 * @param config - Optional validation configuration
 * @returns Validation result with issues and metrics
 */
export async function validatePlanForConfirmation(
  companyId: string,
  result: OptimizationResult,
  config: PlanValidationConfig = DEFAULT_VALIDATION_CONFIG,
): Promise<PlanValidationResult> {
  const issues: ValidationIssue[] = [];
  const routes = result.routes || [];
  const unassignedOrders = result.unassignedOrders || [];

  // Initialize summary
  const summary = {
    totalRoutes: routes.length,
    routesWithDrivers: 0,
    routesWithoutDrivers: 0,
    unassignedOrders: unassignedOrders.length,
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
  };

  // Check 1: All routes must have drivers assigned
  const routesWithoutDrivers = routes.filter(
    (r) => !r.driverId || r.driverId === "",
  );
  summary.routesWithoutDrivers = routesWithoutDrivers.length;
  summary.routesWithDrivers = routes.length - routesWithoutDrivers.length;

  for (const route of routesWithoutDrivers) {
    issues.push({
      severity: ValidationSeverity.ERROR,
      category: "driver_assignment",
      message: `Route ${route.routeId} has no driver assigned`,
      routeId: route.routeId,
      vehicleId: route.vehicleId,
      resolution: "Assign a driver to this route before confirming",
    });
  }

  // Check 2: Unassigned orders
  if (unassignedOrders.length > 0 && !config.allowUnassignedOrdersOverride) {
    issues.push({
      severity: ValidationSeverity.ERROR,
      category: "unassigned_orders",
      message: `${unassignedOrders.length} order(s) could not be assigned to any route`,
      resolution: unassignedOrders
        .map((o) => o.reason || "Review capacity constraints")
        .join("; "),
    });
  } else if (unassignedOrders.length > 0) {
    issues.push({
      severity: ValidationSeverity.WARNING,
      category: "unassigned_orders",
      message: `${unassignedOrders.length} order(s) will remain unassigned`,
      resolution: "These orders will need to be handled separately",
    });
  }

  // Check 3: Driver assignment quality and errors
  let totalQualityScore = 0;
  let qualityCount = 0;

  for (const route of routes) {
    if (!route.assignmentQuality) continue;

    const { score, errors, warnings } = route.assignmentQuality;
    totalQualityScore += score;
    qualityCount++;

    // Check for assignment errors
    if (errors && errors.length > 0) {
      for (const error of errors) {
        issues.push({
          severity: ValidationSeverity.ERROR,
          category: "assignment_error",
          message: error,
          routeId: route.routeId,
          vehicleId: route.vehicleId,
          driverId: route.driverId,
          resolution: "Reassign the driver or resolve the constraint issue",
        });
      }
    }

    // Check for assignment warnings
    if (warnings && warnings.length > 0) {
      for (const warning of warnings) {
        issues.push({
          severity: ValidationSeverity.WARNING,
          category: "assignment_warning",
          message: warning,
          routeId: route.routeId,
          vehicleId: route.vehicleId,
          driverId: route.driverId,
          resolution:
            "Consider reassigning to a more suitable driver if available",
        });
      }
    }

    // Check minimum quality score
    if (score < config.requireMinimumAssignmentQuality) {
      issues.push({
        severity: ValidationSeverity.WARNING,
        category: "assignment_quality",
        message: `Route ${route.routeId} has low assignment quality score (${score}/100)`,
        routeId: route.routeId,
        vehicleId: route.vehicleId,
        driverId: route.driverId,
        resolution: "Consider manual reassignment for better driver match",
      });
    }
  }

  // Check 4: Time window compliance
  const timeWindowCompliance = result.metrics?.timeWindowComplianceRate || 0;
  if (timeWindowCompliance < config.requireMinimumTimeWindowCompliance * 100) {
    issues.push({
      severity: ValidationSeverity.WARNING,
      category: "time_window_compliance",
      message: `Time window compliance is ${timeWindowCompliance.toFixed(1)}%, below recommended ${config.requireMinimumTimeWindowCompliance * 100}%`,
      resolution: "Consider adjusting time window settings or penalty factor",
    });
  }

  // Check 5: Routes with time window violations
  let _routesWithViolations = 0;
  for (const route of routes) {
    if (route.timeWindowViolations && route.timeWindowViolations > 0) {
      _routesWithViolations++;
      issues.push({
        severity: ValidationSeverity.WARNING,
        category: "time_window_violation",
        message: `Route ${route.routeId} has ${route.timeWindowViolations} time window violation(s)`,
        routeId: route.routeId,
        vehicleId: route.vehicleId,
        driverId: route.driverId,
        resolution: "Review promised times or adjust route sequence",
      });
    }
  }

  // Check 6: Driver license and skill validation (if configured)
  if (config.checkLicenseExpiry || config.checkSkillExpiry) {
    const driverValidationIssues = await validateDriverLicensesAndSkills(
      companyId,
      routes,
      config,
    );
    issues.push(...driverValidationIssues);
  }

  // Calculate summary counts
  summary.errorCount = issues.filter(
    (i) => i.severity === ValidationSeverity.ERROR,
  ).length;
  summary.warningCount = issues.filter(
    (i) => i.severity === ValidationSeverity.WARNING,
  ).length;
  summary.infoCount = issues.filter(
    (i) => i.severity === ValidationSeverity.INFO,
  ).length;

  // Calculate metrics
  const metrics = {
    driverAssignmentCoverage:
      summary.totalRoutes > 0
        ? (summary.routesWithDrivers / summary.totalRoutes) * 100
        : 0,
    timeWindowCompliance,
    averageAssignmentQuality:
      qualityCount > 0 ? totalQualityScore / qualityCount : 0,
  };

  // Determine if plan can be confirmed
  const hasBlockingErrors = issues.some(
    (i) => i.severity === ValidationSeverity.ERROR,
  );
  const isValid = !hasBlockingErrors;
  const canConfirm = isValid;

  return {
    isValid,
    canConfirm,
    issues,
    summary,
    metrics,
  };
}

/**
 * Validates driver licenses and skills for expiry
 */
async function validateDriverLicensesAndSkills(
  companyId: string,
  routes: OptimizationRoute[],
  config: PlanValidationConfig,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const driverIds = routes
    .map((r) => r.driverId)
    .filter((id): id is string => !!id && id !== "");

  if (driverIds.length === 0) return issues;

  // Fetch drivers (users with CONDUCTOR role) with their license info
  const driversData = await db
    .select({
      id: users.id,
      name: users.name,
      licenseExpiry: users.licenseExpiry,
      status: users.driverStatus,
    })
    .from(users)
    .where(
      and(
        eq(users.companyId, companyId),
        inArray(users.id, driverIds),
        eq(users.role, USER_ROLES.CONDUCTOR),
      ),
    );

  const now = new Date();
  const licenseWarningDate = new Date();
  licenseWarningDate.setDate(
    licenseWarningDate.getDate() + config.licenseExpiryWarningDays,
  );

  for (const driver of driversData) {
    if (config.checkLicenseExpiry && driver.licenseExpiry) {
      const expiryDate = new Date(driver.licenseExpiry);

      if (expiryDate < now) {
        // License expired - this is a blocking error
        const affectedRoutes = routes.filter((r) => r.driverId === driver.id);
        for (const route of affectedRoutes) {
          issues.push({
            severity: ValidationSeverity.ERROR,
            category: "license_expiry",
            message: `Driver ${driver.name} has an expired license (${expiryDate.toISOString().split("T")[0]})`,
            driverId: driver.id,
            routeId: route.routeId,
            vehicleId: route.vehicleId,
            resolution: "Assign a different driver with valid license",
          });
        }
      } else if (expiryDate < licenseWarningDate) {
        // License expiring soon - warning
        const daysUntilExpiry = Math.ceil(
          (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
        const affectedRoutes = routes.filter((r) => r.driverId === driver.id);
        for (const route of affectedRoutes) {
          issues.push({
            severity: ValidationSeverity.WARNING,
            category: "license_expiry",
            message: `Driver ${driver.name} license expires in ${daysUntilExpiry} day(s)`,
            driverId: driver.id,
            routeId: route.routeId,
            vehicleId: route.vehicleId,
            resolution: "Ensure license renewal before route execution",
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Get a summary of validation issues by category
 */
export function getIssuesByCategory(
  issues: ValidationIssue[],
): Record<string, ValidationIssue[]> {
  const byCategory: Record<string, ValidationIssue[]> = {};

  for (const issue of issues) {
    if (!byCategory[issue.category]) {
      byCategory[issue.category] = [];
    }
    byCategory[issue.category].push(issue);
  }

  return byCategory;
}

/**
 * Get validation issues by severity
 */
export function getIssuesBySeverity(issues: ValidationIssue[]): {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  info: ValidationIssue[];
} {
  return {
    errors: issues.filter((i) => i.severity === ValidationSeverity.ERROR),
    warnings: issues.filter((i) => i.severity === ValidationSeverity.WARNING),
    info: issues.filter((i) => i.severity === ValidationSeverity.INFO),
  };
}

/**
 * Check if a plan can be confirmed (has no blocking errors)
 */
export function canConfirmPlan(
  validationResult: PlanValidationResult,
): boolean {
  return validationResult.canConfirm;
}

/**
 * Get human-readable validation summary
 */
export function getValidationSummaryText(result: PlanValidationResult): string {
  const parts: string[] = [];

  if (result.summary.routesWithoutDrivers > 0) {
    parts.push(
      `${result.summary.routesWithoutDrivers} route(s) missing driver assignment`,
    );
  }

  if (result.summary.unassignedOrders > 0) {
    parts.push(`${result.summary.unassignedOrders} unassigned order(s)`);
  }

  if (result.summary.errorCount > 0) {
    parts.push(`${result.summary.errorCount} error(s) that must be resolved`);
  }

  if (result.summary.warningCount > 0) {
    parts.push(`${result.summary.warningCount} warning(s) to review`);
  }

  if (parts.length === 0) {
    return "Plan is ready for confirmation";
  }

  return parts.join(", ");
}
