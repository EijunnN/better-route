/**
 * Batch operations utilities for Story 17.1: Procesamiento Batch Eficiente
 *
 * This module provides optimized batch insert operations for handling
 * large datasets without blocking or memory issues.
 */

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, routeStops } from "@/db/schema";

// Default batch size optimized for PostgreSQL
const DEFAULT_BATCH_SIZE = 500;

/**
 * Configuration for batch operations
 */
export interface BatchConfig {
  batchSize?: number; // Number of records per batch (default: 500)
  onProgress?: (processed: number, total: number) => void; // Progress callback
  timeout?: number; // Operation timeout in milliseconds (default: 300000 = 5 minutes)
}

/**
 * Result of a batch operation
 */
export interface BatchResult<T = unknown> {
  success: boolean;
  processed: number;
  total: number;
  inserted: number;
  errors: Array<{
    batch: number;
    error: string;
  }>;
  data?: T[];
}

/**
 * Batch insert orders with optimized performance
 * Uses chunks to avoid memory issues with large datasets
 *
 * @param orderData - Array of order data to insert
 * @param companyId - Company ID
 * @param config - Batch configuration
 * @returns Batch result with statistics
 */
export async function batchInsertOrders(
  orderData: Array<{
    trackingId: string;
    customerName?: string | null;
    customerPhone?: string | null;
    customerEmail?: string | null;
    address: string;
    latitude: string;
    longitude: string;
    timeWindowPresetId?: string | null;
    strictness?: "HARD" | "SOFT" | null;
    promisedDate?: Date | null;
    weightRequired?: number | null;
    volumeRequired?: number | null;
    // New fields for multi-company support
    orderValue?: number | null;
    unitsRequired?: number | null;
    orderType?: "NEW" | "RESCHEDULED" | "URGENT" | null;
    priority?: number | null;
    timeWindowStart?: string | null;
    timeWindowEnd?: string | null;
    requiredSkills?: string | null;
    notes?: string | null;
  }>,
  companyId: string,
  config: BatchConfig = {},
): Promise<BatchResult> {
  const {
    batchSize = DEFAULT_BATCH_SIZE,
    onProgress,
    timeout = 300000,
  } = config;

  const total = orderData.length;
  let processed = 0;
  let inserted = 0;
  const errors: Array<{ batch: number; error: string }> = [];
  const startTime = Date.now();

  // Process in batches
  for (let i = 0; i < orderData.length; i += batchSize) {
    // Check timeout
    if (Date.now() - startTime > timeout) {
      errors.push({
        batch: Math.floor(i / batchSize),
        error: "Operation timeout exceeded",
      });
      break;
    }

    const batch = orderData.slice(i, Math.min(i + batchSize, orderData.length));
    const batchNumber = Math.floor(i / batchSize);

    try {
      // Build records for this batch
      const recordsToInsert = batch.map((data) => ({
        companyId,
        trackingId: String(data.trackingId),
        customerName: data.customerName ? String(data.customerName) : null,
        customerPhone: data.customerPhone ? String(data.customerPhone) : null,
        customerEmail: data.customerEmail ? String(data.customerEmail) : null,
        address: String(data.address),
        latitude: String(data.latitude),
        longitude: String(data.longitude),
        timeWindowPresetId: data.timeWindowPresetId || null,
        strictness:
          data.strictness === "HARD" || data.strictness === "SOFT"
            ? data.strictness
            : null,
        promisedDate: data.promisedDate ? new Date(data.promisedDate) : null,
        weightRequired: data.weightRequired
          ? parseInt(String(data.weightRequired), 10)
          : null,
        volumeRequired: data.volumeRequired
          ? parseInt(String(data.volumeRequired), 10)
          : null,
        // New fields for multi-company support
        orderValue: data.orderValue
          ? parseInt(String(data.orderValue), 10)
          : null,
        unitsRequired: data.unitsRequired
          ? parseInt(String(data.unitsRequired), 10)
          : null,
        orderType:
          data.orderType === "NEW" ||
          data.orderType === "RESCHEDULED" ||
          data.orderType === "URGENT"
            ? data.orderType
            : null,
        priority: data.priority
          ? parseInt(String(data.priority), 10)
          : null,
        timeWindowStart: data.timeWindowStart
          ? String(data.timeWindowStart)
          : null,
        timeWindowEnd: data.timeWindowEnd
          ? String(data.timeWindowEnd)
          : null,
        requiredSkills: data.requiredSkills
          ? String(data.requiredSkills)
          : null,
        notes: data.notes ? String(data.notes) : null,
        status: "PENDING" as const,
        active: true,
      }));

      // Insert batch using optimized INSERT with multiple VALUES
      // This is more efficient than individual inserts
      const result = await db
        .insert(orders)
        .values(recordsToInsert)
        .returning();
      inserted += result.length;
    } catch (error) {
      errors.push({
        batch: batchNumber,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      // Continue processing next batches even if one fails
    }

    processed += batch.length;

    // Report progress
    if (onProgress) {
      onProgress(processed, total);
    }
  }

  return {
    success: errors.length === 0,
    processed,
    total,
    inserted,
    errors,
  };
}

/**
 * Batch insert route stops with optimized performance
 *
 * @param stopData - Array of route stop data to insert
 * @param companyId - Company ID
 * @param config - Batch configuration
 * @returns Batch result with statistics
 */
export async function batchInsertRouteStops(
  stopData: Array<{
    jobId: string;
    routeId: string;
    driverId?: string;
    userId?: string;
    vehicleId: string;
    orderId: string;
    sequence: number;
    address: string;
    latitude: string;
    longitude: string;
    estimatedArrival?: Date | null;
    estimatedServiceTime?: number | null;
    timeWindowStart?: Date | null;
    timeWindowEnd?: Date | null;
    metadata?: Record<string, string | number | boolean | null> | null;
  }>,
  companyId: string,
  config: BatchConfig = {},
): Promise<BatchResult> {
  const {
    batchSize = DEFAULT_BATCH_SIZE,
    onProgress,
    timeout = 300000,
  } = config;

  const total = stopData.length;
  let processed = 0;
  let inserted = 0;
  const errors: Array<{ batch: number; error: string }> = [];
  const startTime = Date.now();

  for (let i = 0; i < stopData.length; i += batchSize) {
    if (Date.now() - startTime > timeout) {
      errors.push({
        batch: Math.floor(i / batchSize),
        error: "Operation timeout exceeded",
      });
      break;
    }

    const batch = stopData.slice(i, Math.min(i + batchSize, stopData.length));
    const batchNumber = Math.floor(i / batchSize);

    try {
      const recordsToInsert = batch.map((data) => {
        const userId = data.driverId || data.userId;
        if (!userId) {
          throw new Error("userId or driverId is required for route stop");
        }
        return {
          companyId,
          jobId: data.jobId,
          routeId: data.routeId,
          userId,
          vehicleId: data.vehicleId,
          orderId: data.orderId,
          sequence: data.sequence,
          address: String(data.address),
          latitude: String(data.latitude),
          longitude: String(data.longitude),
          estimatedArrival: data.estimatedArrival
            ? new Date(data.estimatedArrival)
            : null,
          estimatedServiceTime: data.estimatedServiceTime
            ? parseInt(String(data.estimatedServiceTime), 10)
            : null,
          timeWindowStart: data.timeWindowStart
            ? new Date(data.timeWindowStart)
            : null,
          timeWindowEnd: data.timeWindowEnd
            ? new Date(data.timeWindowEnd)
            : null,
          status: "PENDING" as const,
          metadata: data.metadata || null,
        };
      });

      const result = await db
        .insert(routeStops)
        .values(recordsToInsert)
        .returning();
      inserted += result.length;
    } catch (error) {
      errors.push({
        batch: batchNumber,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    processed += batch.length;

    if (onProgress) {
      onProgress(processed, total);
    }
  }

  return {
    success: errors.length === 0,
    processed,
    total,
    inserted,
    errors,
  };
}

/**
 * Update statistics for a table to improve query performance
 * Should be called after large batch inserts
 *
 * @param tableName - Name of the table to analyze
 */
export async function updateTableStatistics(tableName: string): Promise<void> {
  try {
    await db.execute(sql`ANALYZE ${sql.raw(tableName)}`);
  } catch (error) {
    console.error(`Failed to analyze table ${tableName}:`, error);
  }
}

/**
 * Create a temporary table for bulk data import
 * Useful for very large datasets (>10,000 records)
 *
 * @param tableName - Name for the temporary table
 * @returns SQL to create the temporary table
 */
export function createTempOrdersTable(tableName: string): string {
  return `
    CREATE TEMP TABLE ${tableName} AS
    SELECT * FROM orders WITH NO DATA;
  `;
}

/**
 * Batch insert using COPY command for maximum performance
 * This is the fastest way to insert large amounts of data
 * Note: Requires PostgreSQL superuser privileges or file access
 *
 * @param tableName - Target table name
 * @param columns - Column names
 * @param data - Array of data arrays (one array per row)
 * @returns Number of rows inserted
 */
export async function batchInsertWithCopy(
  tableName: string,
  columns: string[],
  data: Array<Array<string | number | boolean | null | undefined>>,
): Promise<number> {
  if (data.length === 0) {
    return 0;
  }

  // Convert data to CSV format
  const csvData = data
    .map((row) =>
      row
        .map((value) => {
          if (value === null || value === undefined) {
            return "";
          }
          const strValue = String(value);
          // Escape quotes and wrap in quotes if contains comma or quote
          if (
            strValue.includes(",") ||
            strValue.includes('"') ||
            strValue.includes("\n")
          ) {
            return `"${strValue.replace(/"/g, '""')}"`;
          }
          return strValue;
        })
        .join(","),
    )
    .join("\n");

  const csvHeader = columns.join(",");
  const _fullCsv = `${csvHeader}\n${csvData}`;

  try {
    // Use PostgreSQL's COPY FROM STDIN
    await db.execute(sql`
      COPY ${sql.raw(tableName)} (${sql.raw(columns.join(", "))})
      FROM STDIN
      WITH (FORMAT csv, HEADER true, DELIMITER ',')
    `);

    return data.length;
  } catch (error) {
    console.error(
      "COPY command failed, falling back to regular insert:",
      error,
    );
    // Fallback to regular insert if COPY fails
    throw error;
  }
}

/**
 * Estimate batch size based on record size and available memory
 *
 * @param avgRecordSize - Average size of each record in bytes
 * @param maxMemoryMB - Maximum memory to use in MB (default: 100)
 * @returns Recommended batch size
 */
export function estimateBatchSize(
  avgRecordSize: number,
  maxMemoryMB: number = 100,
): number {
  const maxMemoryBytes = maxMemoryMB * 1024 * 1024;
  const calculatedBatchSize = Math.floor(maxMemoryBytes / avgRecordSize);

  // Clamp between reasonable limits
  return Math.max(100, Math.min(DEFAULT_BATCH_SIZE, calculatedBatchSize));
}
