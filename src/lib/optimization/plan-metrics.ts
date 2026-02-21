import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { optimizationJobs, planMetrics } from "@/db/schema";
import type { OptimizationResult } from "./optimization-runner";
import type { PlanValidationResult } from "./plan-validation";

/**
 * Plan metrics data structure
 */
export interface PlanMetricsData {
  companyId: string;
  jobId: string;
  configurationId: string;
  // Route summary metrics
  totalRoutes: number;
  totalStops: number;
  totalDistance: number;
  totalDuration: number;
  // Capacity utilization metrics
  averageUtilizationRate: number;
  maxUtilizationRate: number;
  minUtilizationRate: number;
  // Time window metrics
  timeWindowComplianceRate: number;
  totalTimeWindowViolations: number;
  // Driver assignment metrics
  driverAssignmentCoverage: number;
  averageAssignmentQuality: number;
  assignmentsWithWarnings: number;
  assignmentsWithErrors: number;
  // Assignment detail metrics
  skillCoverage: number;
  licenseCompliance: number;
  fleetAlignment: number;
  workloadBalance: number;
  // Unassigned orders
  unassignedOrders: number;
  // Metadata
  objective?: string;
  processingTimeMs: number;
}

/**
 * Metrics comparison data
 */
export interface MetricsComparison {
  comparedToJobId?: string;
  distanceChangePercent?: number;
  durationChangePercent?: number;
  complianceChangePercent?: number;
}

/**
 * Complete plan metrics with comparison data
 */
export interface PlanMetricsWithComparison extends PlanMetricsData {
  id: string;
  createdAt: Date;
  comparedToJobId?: string;
  distanceChangePercent?: number;
  durationChangePercent?: number;
  complianceChangePercent?: number;
}

/**
 * Historical metrics for trends
 */
export interface HistoricalMetrics {
  jobId: string;
  createdAt: Date;
  totalRoutes: number;
  totalStops: number;
  totalDistance: number;
  totalDuration: number;
  averageUtilizationRate: number;
  timeWindowComplianceRate: number;
}

/**
 * Calculate plan metrics from optimization result and validation
 */
export function calculatePlanMetrics(
  companyId: string,
  jobId: string,
  configurationId: string,
  result: OptimizationResult,
  validationResult: PlanValidationResult,
): PlanMetricsData {
  const routes = result.routes || [];
  const metrics = result.metrics || {};
  const assignmentMetrics = result.assignmentMetrics;
  const validationMetrics = validationResult.metrics || {};
  const summary = validationResult.summary || {};

  // Calculate utilization rates
  const utilizationRates = routes
    .map((r) => r.utilizationPercentage || 0)
    .filter((rate) => rate > 0);

  const averageUtilizationRate =
    utilizationRates.length > 0
      ? Math.round(
          utilizationRates.reduce((sum, r) => sum + r, 0) /
            utilizationRates.length,
        )
      : 0;

  const maxUtilizationRate =
    utilizationRates.length > 0 ? Math.max(...utilizationRates) : 0;

  const minUtilizationRate =
    utilizationRates.length > 0 ? Math.min(...utilizationRates) : 0;

  // Count assignments with warnings and errors
  let assignmentsWithWarnings = 0;
  let assignmentsWithErrors = 0;

  for (const route of routes) {
    if (route.assignmentQuality) {
      if (
        route.assignmentQuality.warnings &&
        route.assignmentQuality.warnings.length > 0
      ) {
        assignmentsWithWarnings++;
      }
      if (
        route.assignmentQuality.errors &&
        route.assignmentQuality.errors.length > 0
      ) {
        assignmentsWithErrors++;
      }
    }
  }

  return {
    companyId,
    jobId,
    configurationId,
    totalRoutes: metrics.totalRoutes || routes.length,
    totalStops:
      metrics.totalStops ||
      routes.reduce((sum, r) => sum + (r.stops?.length || 0), 0),
    totalDistance:
      metrics.totalDistance ||
      routes.reduce((sum, r) => sum + (r.totalDistance || 0), 0),
    totalDuration:
      metrics.totalDuration ||
      routes.reduce((sum, r) => sum + (r.totalDuration || 0), 0),
    averageUtilizationRate,
    maxUtilizationRate,
    minUtilizationRate,
    timeWindowComplianceRate: metrics.timeWindowComplianceRate ?? 100,
    totalTimeWindowViolations: routes.reduce(
      (sum, r) => sum + (r.timeWindowViolations || 0),
      0,
    ),
    driverAssignmentCoverage: Math.round(
      validationMetrics.driverAssignmentCoverage || 0,
    ),
    averageAssignmentQuality: Math.round(
      validationMetrics.averageAssignmentQuality || 0,
    ),
    assignmentsWithWarnings,
    assignmentsWithErrors,
    skillCoverage: assignmentMetrics?.skillCoverage ?? 100,
    licenseCompliance: assignmentMetrics?.licenseCompliance ?? 100,
    fleetAlignment: assignmentMetrics?.fleetAlignment ?? 100,
    workloadBalance: assignmentMetrics?.workloadBalance ?? 100,
    unassignedOrders:
      summary.unassignedOrders || result.unassignedOrders?.length || 0,
    objective: result.summary?.objective,
    processingTimeMs: result.summary?.processingTimeMs || 0,
  };
}

/**
 * Find previous job for comparison
 */
export async function findPreviousJobForComparison(
  companyId: string,
  currentJobId: string,
  configurationId?: string,
): Promise<string | null> {
  // First, get the current job's createdAt timestamp
  const [currentJob] = await db
    .select({ createdAt: optimizationJobs.createdAt })
    .from(optimizationJobs)
    .where(eq(optimizationJobs.id, currentJobId))
    .limit(1);

  if (!currentJob?.createdAt) {
    return null;
  }

  // Then find the previous job created before this one
  const conditions = [
    eq(optimizationJobs.companyId, companyId),
    eq(optimizationJobs.status, "COMPLETED"),
    lt(optimizationJobs.createdAt, currentJob.createdAt),
  ];

  // Optionally filter by configurationId
  if (configurationId) {
    conditions.push(eq(optimizationJobs.configurationId, configurationId));
  }

  const [previousJob] = await db
    .select({ id: optimizationJobs.id })
    .from(optimizationJobs)
    .where(and(...conditions))
    .orderBy(desc(optimizationJobs.createdAt))
    .limit(1);

  return previousJob?.id || null;
}

/**
 * Calculate percentage change between two values
 */
function calculatePercentChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return newValue === 0 ? 0 : 100;
  return Math.round(((newValue - oldValue) / oldValue) * 100);
}

/**
 * Calculate comparison metrics against previous job
 */
export async function calculateComparisonMetrics(
  companyId: string,
  currentMetrics: PlanMetricsData,
  currentJobId: string,
): Promise<MetricsComparison> {
  // Find previous job for comparison
  const previousJobId = await findPreviousJobForComparison(
    companyId,
    currentJobId,
    currentMetrics.configurationId,
  );

  if (!previousJobId) {
    return {};
  }

  // Fetch previous metrics
  const [previousMetricsRecord] = await db
    .select()
    .from(planMetrics)
    .where(
      and(
        eq(planMetrics.companyId, companyId),
        eq(planMetrics.jobId, previousJobId),
      ),
    )
    .limit(1);

  if (!previousMetricsRecord) {
    return { comparedToJobId: previousJobId };
  }

  return {
    comparedToJobId: previousJobId,
    distanceChangePercent: calculatePercentChange(
      previousMetricsRecord.totalDistance,
      currentMetrics.totalDistance,
    ),
    durationChangePercent: calculatePercentChange(
      previousMetricsRecord.totalDuration,
      currentMetrics.totalDuration,
    ),
    complianceChangePercent: calculatePercentChange(
      previousMetricsRecord.timeWindowComplianceRate,
      currentMetrics.timeWindowComplianceRate,
    ),
  };
}

/**
 * Save plan metrics to database
 */
export async function savePlanMetrics(
  metrics: PlanMetricsData,
  comparison?: MetricsComparison,
): Promise<string> {
  const [inserted] = await db
    .insert(planMetrics)
    .values({
      companyId: metrics.companyId,
      jobId: metrics.jobId,
      configurationId: metrics.configurationId,
      totalRoutes: metrics.totalRoutes,
      totalStops: metrics.totalStops,
      totalDistance: metrics.totalDistance,
      totalDuration: metrics.totalDuration,
      averageUtilizationRate: metrics.averageUtilizationRate,
      maxUtilizationRate: metrics.maxUtilizationRate,
      minUtilizationRate: metrics.minUtilizationRate,
      timeWindowComplianceRate: metrics.timeWindowComplianceRate,
      totalTimeWindowViolations: metrics.totalTimeWindowViolations,
      driverAssignmentCoverage: metrics.driverAssignmentCoverage,
      averageAssignmentQuality: metrics.averageAssignmentQuality,
      assignmentsWithWarnings: metrics.assignmentsWithWarnings,
      assignmentsWithErrors: metrics.assignmentsWithErrors,
      skillCoverage: metrics.skillCoverage,
      licenseCompliance: metrics.licenseCompliance,
      fleetAlignment: metrics.fleetAlignment,
      workloadBalance: metrics.workloadBalance,
      unassignedOrders: metrics.unassignedOrders,
      objective: metrics.objective as
        | "DISTANCE"
        | "TIME"
        | "BALANCED"
        | undefined,
      processingTimeMs: metrics.processingTimeMs,
      comparedToJobId: comparison?.comparedToJobId,
      distanceChangePercent: comparison?.distanceChangePercent,
      durationChangePercent: comparison?.durationChangePercent,
      complianceChangePercent: comparison?.complianceChangePercent,
    })
    .returning();

  return inserted.id;
}

/**
 * Get plan metrics for a specific job
 */
export async function getPlanMetrics(
  companyId: string,
  jobId: string,
): Promise<PlanMetricsWithComparison | null> {
  const [metricsRecord] = await db
    .select()
    .from(planMetrics)
    .where(
      and(eq(planMetrics.companyId, companyId), eq(planMetrics.jobId, jobId)),
    )
    .limit(1);

  if (!metricsRecord) {
    return null;
  }

  return {
    id: metricsRecord.id,
    companyId: metricsRecord.companyId,
    jobId: metricsRecord.jobId,
    configurationId: metricsRecord.configurationId,
    totalRoutes: metricsRecord.totalRoutes,
    totalStops: metricsRecord.totalStops,
    totalDistance: metricsRecord.totalDistance,
    totalDuration: metricsRecord.totalDuration,
    averageUtilizationRate: metricsRecord.averageUtilizationRate,
    maxUtilizationRate: metricsRecord.maxUtilizationRate,
    minUtilizationRate: metricsRecord.minUtilizationRate,
    timeWindowComplianceRate: metricsRecord.timeWindowComplianceRate,
    totalTimeWindowViolations: metricsRecord.totalTimeWindowViolations,
    driverAssignmentCoverage: metricsRecord.driverAssignmentCoverage,
    averageAssignmentQuality: metricsRecord.averageAssignmentQuality,
    assignmentsWithWarnings: metricsRecord.assignmentsWithWarnings,
    assignmentsWithErrors: metricsRecord.assignmentsWithErrors,
    skillCoverage: metricsRecord.skillCoverage,
    licenseCompliance: metricsRecord.licenseCompliance,
    fleetAlignment: metricsRecord.fleetAlignment,
    workloadBalance: metricsRecord.workloadBalance,
    unassignedOrders: metricsRecord.unassignedOrders,
    objective: metricsRecord.objective || undefined,
    processingTimeMs: metricsRecord.processingTimeMs,
    createdAt: metricsRecord.createdAt,
    comparedToJobId: metricsRecord.comparedToJobId || undefined,
    distanceChangePercent: metricsRecord.distanceChangePercent || undefined,
    durationChangePercent: metricsRecord.durationChangePercent || undefined,
    complianceChangePercent: metricsRecord.complianceChangePercent || undefined,
  };
}

/**
 * Get historical metrics for a company
 */
export async function getHistoricalMetrics(
  companyId: string,
  limit: number = 10,
  offset: number = 0,
): Promise<HistoricalMetrics[]> {
  const records = await db
    .select({
      jobId: planMetrics.jobId,
      createdAt: planMetrics.createdAt,
      totalRoutes: planMetrics.totalRoutes,
      totalStops: planMetrics.totalStops,
      totalDistance: planMetrics.totalDistance,
      totalDuration: planMetrics.totalDuration,
      averageUtilizationRate: planMetrics.averageUtilizationRate,
      timeWindowComplianceRate: planMetrics.timeWindowComplianceRate,
    })
    .from(planMetrics)
    .where(eq(planMetrics.companyId, companyId))
    .orderBy(desc(planMetrics.createdAt))
    .limit(limit)
    .offset(offset);

  return records;
}

/**
 * Get metrics summary statistics for a company
 */
export async function getMetricsSummaryStats(companyId: string): Promise<{
  totalSessions: number;
  averageDistance: number;
  averageDuration: number;
  averageCompliance: number;
  averageUtilization: number;
}> {
  const records = await db
    .select({
      totalDistance: planMetrics.totalDistance,
      totalDuration: planMetrics.totalDuration,
      timeWindowComplianceRate: planMetrics.timeWindowComplianceRate,
      averageUtilizationRate: planMetrics.averageUtilizationRate,
    })
    .from(planMetrics)
    .where(eq(planMetrics.companyId, companyId));

  if (records.length === 0) {
    return {
      totalSessions: 0,
      averageDistance: 0,
      averageDuration: 0,
      averageCompliance: 0,
      averageUtilization: 0,
    };
  }

  return {
    totalSessions: records.length,
    averageDistance: Math.round(
      records.reduce((sum, r) => sum + r.totalDistance, 0) / records.length,
    ),
    averageDuration: Math.round(
      records.reduce((sum, r) => sum + r.totalDuration, 0) / records.length,
    ),
    averageCompliance: Math.round(
      records.reduce((sum, r) => sum + r.timeWindowComplianceRate, 0) /
        records.length,
    ),
    averageUtilization: Math.round(
      records.reduce((sum, r) => sum + r.averageUtilizationRate, 0) /
        records.length,
    ),
  };
}
