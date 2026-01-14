/**
 * Alert Engine - Evaluates conditions and creates alerts
 *
 * This module provides functions to evaluate alert rules and create alerts
 * based on various conditions in the system.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  alerts,
  optimizationJobs,
  USER_ROLES,
  users,
  vehicles,
} from "@/db/schema";

export interface AlertContext {
  companyId: string;
  userId?: string;
}

export interface AlertData {
  type: keyof typeof import("@/db/schema").ALERT_TYPE;
  severity: keyof typeof import("@/db/schema").ALERT_SEVERITY;
  entityType: string;
  entityId: string;
  title: string;
  description?: string;
  metadata?: Record<string, any>;
  ruleId?: string;
}

/**
 * Create a new alert
 */
export async function createAlert(context: AlertContext, data: AlertData) {
  const [alert] = await db
    .insert(alerts)
    .values({
      companyId: context.companyId,
      ruleId: data.ruleId || null,
      type: data.type,
      severity: data.severity,
      entityType: data.entityType,
      entityId: data.entityId,
      title: data.title,
      description: data.description || null,
      metadata: data.metadata || null,
      status: "ACTIVE",
    })
    .returning();

  return alert;
}

/**
 * Check if an alert already exists for the same entity and type
 */
async function hasActiveAlert(
  context: AlertContext,
  type: string,
  entityType: string,
  entityId: string,
): Promise<boolean> {
  const existing = await db.query.alerts.findFirst({
    where: and(
      eq(alerts.companyId, context.companyId),
      eq(alerts.type, type as any),
      eq(alerts.entityType, entityType),
      eq(alerts.entityId, entityId),
      eq(alerts.status, "ACTIVE"),
    ),
  });

  return !!existing;
}

/**
 * Evaluate and create alerts for expiring driver licenses
 */
export async function evaluateDriverLicenseAlerts(
  context: AlertContext,
  daysThreshold: number = 30,
) {
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);

  const expiringDrivers = await db.query.users.findMany({
    where: and(
      eq(users.companyId, context.companyId),
      eq(users.role, USER_ROLES.CONDUCTOR),
      eq(users.active, true),
      sql`${users.licenseExpiry} <= ${thresholdDate}`,
    ),
  });

  const createdAlerts: (typeof alerts.$inferSelect)[] = [];

  for (const driver of expiringDrivers) {
    // Skip if no license expiry date
    if (!driver.licenseExpiry) continue;

    const expiryDate = new Date(driver.licenseExpiry);
    const daysUntilExpiry = Math.ceil(
      (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    // Skip if alert already exists
    if (
      await hasActiveAlert(
        context,
        "DRIVER_LICENSE_EXPIRING",
        "DRIVER",
        driver.id,
      )
    ) {
      continue;
    }

    const isExpired = daysUntilExpiry <= 0;
    const alertType = isExpired
      ? "DRIVER_LICENSE_EXPIRED"
      : "DRIVER_LICENSE_EXPIRING";
    const severity = isExpired ? "CRITICAL" : "WARNING";

    const alert = await createAlert(context, {
      type: alertType as any,
      severity: severity as any,
      entityType: "DRIVER",
      entityId: driver.id,
      title: isExpired
        ? `Driver License Expired: ${driver.name}`
        : `Driver License Expiring Soon: ${driver.name}`,
      description: isExpired
        ? `Driver ${driver.name} has an expired license (${driver.licenseNumber}).`
        : `Driver ${driver.name}'s license expires in ${daysUntilExpiry} days.`,
      metadata: {
        driverName: driver.name,
        licenseNumber: driver.licenseNumber,
        expiryDate: driver.licenseExpiry,
        daysUntilExpiry,
      },
    });

    createdAlerts.push(alert);
  }

  return createdAlerts;
}

/**
 * Evaluate and create alerts for vehicle document expiry
 */
export async function evaluateVehicleDocumentAlerts(
  context: AlertContext,
  daysThreshold: number = 30,
) {
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);

  // Check insurance expiry
  const expiringInsurance = await db.query.vehicles.findMany({
    where: and(
      eq(vehicles.companyId, context.companyId),
      eq(vehicles.active, true),
      sql`${vehicles.insuranceExpiry} <= ${thresholdDate}`,
    ),
  });

  // Check inspection expiry
  const expiringInspection = await db.query.vehicles.findMany({
    where: and(
      eq(vehicles.companyId, context.companyId),
      eq(vehicles.active, true),
      sql`${vehicles.inspectionExpiry} <= ${thresholdDate}`,
    ),
  });

  const createdAlerts: (typeof alerts.$inferSelect)[] = [];

  for (const vehicle of expiringInsurance) {
    if (
      await hasActiveAlert(
        context,
        "VEHICLE_INSURANCE_EXPIRING",
        "VEHICLE",
        vehicle.id,
      )
    ) {
      continue;
    }

    const expiryDate = new Date(vehicle.insuranceExpiry!);
    const daysUntilExpiry = Math.ceil(
      (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    const isExpired = daysUntilExpiry <= 0;

    const alert = await createAlert(context, {
      type: "VEHICLE_INSURANCE_EXPIRING",
      severity: isExpired ? "CRITICAL" : ("WARNING" as any),
      entityType: "VEHICLE",
      entityId: vehicle.id,
      title: isExpired
        ? `Vehicle Insurance Expired: ${vehicle.plate}`
        : `Vehicle Insurance Expiring: ${vehicle.plate}`,
      description: isExpired
        ? `Vehicle ${vehicle.plate} (${vehicle.brand} ${vehicle.model}) has expired insurance.`
        : `Vehicle ${vehicle.plate} (${vehicle.brand} ${vehicle.model}) insurance expires in ${daysUntilExpiry} days.`,
      metadata: {
        plate: vehicle.plate,
        brand: vehicle.brand,
        model: vehicle.model,
        expiryDate: vehicle.insuranceExpiry,
        daysUntilExpiry,
      },
    });

    createdAlerts.push(alert);
  }

  for (const vehicle of expiringInspection) {
    if (
      await hasActiveAlert(
        context,
        "VEHICLE_INSPECTION_EXPIRING",
        "VEHICLE",
        vehicle.id,
      )
    ) {
      continue;
    }

    const expiryDate = new Date(vehicle.inspectionExpiry!);
    const daysUntilExpiry = Math.ceil(
      (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    const isExpired = daysUntilExpiry <= 0;

    const alert = await createAlert(context, {
      type: "VEHICLE_INSPECTION_EXPIRING",
      severity: isExpired ? "CRITICAL" : ("WARNING" as any),
      entityType: "VEHICLE",
      entityId: vehicle.id,
      title: isExpired
        ? `Vehicle Inspection Expired: ${vehicle.plate}`
        : `Vehicle Inspection Expiring: ${vehicle.plate}`,
      description: isExpired
        ? `Vehicle ${vehicle.plate} (${vehicle.brand} ${vehicle.model}) has expired inspection.`
        : `Vehicle ${vehicle.plate} (${vehicle.brand} ${vehicle.model}) inspection expires in ${daysUntilExpiry} days.`,
      metadata: {
        plate: vehicle.plate,
        brand: vehicle.brand,
        model: vehicle.model,
        expiryDate: vehicle.inspectionExpiry,
        daysUntilExpiry,
      },
    });

    createdAlerts.push(alert);
  }

  return createdAlerts;
}

/**
 * Evaluate and create alerts for absent drivers
 */
export async function evaluateDriverAbsentAlerts(context: AlertContext) {
  const absentDrivers = await db.query.users.findMany({
    where: and(
      eq(users.companyId, context.companyId),
      eq(users.role, USER_ROLES.CONDUCTOR),
      eq(users.driverStatus, "ABSENT"),
    ),
  });

  const createdAlerts: (typeof alerts.$inferSelect)[] = [];

  for (const driver of absentDrivers) {
    if (await hasActiveAlert(context, "DRIVER_ABSENT", "DRIVER", driver.id)) {
      continue;
    }

    const alert = await createAlert(context, {
      type: "DRIVER_ABSENT",
      severity: "CRITICAL",
      entityType: "DRIVER",
      entityId: driver.id,
      title: `Driver Marked as Absent: ${driver.name}`,
      description: `Driver ${driver.name} has been marked as absent. Route reassignment may be required.`,
      metadata: {
        driverName: driver.name,
        status: driver.driverStatus,
      },
    });

    createdAlerts.push(alert);
  }

  return createdAlerts;
}

/**
 * Evaluate and create alerts for failed optimization jobs
 */
export async function evaluateOptimizationFailedAlerts(context: AlertContext) {
  const failedJobs = await db.query.optimizationJobs.findMany({
    where: and(
      eq(optimizationJobs.companyId, context.companyId),
      eq(optimizationJobs.status, "FAILED"),
    ),
    orderBy: (jobs) => jobs.createdAt,
    limit: 10,
  });

  const createdAlerts: (typeof alerts.$inferSelect)[] = [];

  for (const job of failedJobs) {
    if (await hasActiveAlert(context, "OPTIMIZATION_FAILED", "JOB", job.id)) {
      continue;
    }

    const alert = await createAlert(context, {
      type: "OPTIMIZATION_FAILED",
      severity: "WARNING",
      entityType: "JOB",
      entityId: job.id,
      title: `Optimization Job Failed`,
      description: job.error
        ? `Optimization job failed: ${job.error}`
        : `Optimization job failed without error message.`,
      metadata: {
        jobId: job.id,
        configurationId: job.configurationId,
        error: job.error,
        startedAt: job.startedAt,
      },
    });

    createdAlerts.push(alert);
  }

  return createdAlerts;
}

/**
 * Run all alert evaluations for a tenant
 * This is typically called by a background job or cron task
 */
export async function runAllAlertEvaluations(context: AlertContext) {
  const results = {
    driverLicense: await evaluateDriverLicenseAlerts(context),
    vehicleDocuments: await evaluateVehicleDocumentAlerts(context),
    driverAbsent: await evaluateDriverAbsentAlerts(context),
    optimizationFailed: await evaluateOptimizationFailedAlerts(context),
  };

  const totalCreated =
    results.driverLicense.length +
    results.vehicleDocuments.length +
    results.driverAbsent.length +
    results.optimizationFailed.length;

  return {
    totalCreated,
    results,
  };
}

/**
 * Resolve alerts for a specific entity
 * Useful when an issue has been fixed and you want to clear related alerts
 */
export async function resolveAlertsForEntity(
  context: AlertContext,
  entityType: string,
  entityId: string,
) {
  const now = new Date();

  const updated = await db
    .update(alerts)
    .set({
      status: "RESOLVED",
      resolvedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(alerts.companyId, context.companyId),
        eq(alerts.entityType, entityType),
        eq(alerts.entityId, entityId),
        eq(alerts.status, "ACTIVE"),
      ),
    )
    .returning();

  return updated;
}
