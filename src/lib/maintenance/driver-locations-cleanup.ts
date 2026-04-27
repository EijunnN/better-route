import { and, lt } from "drizzle-orm";
import { db } from "@/db";
import { driverLocations } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";

/**
 * Retention bounds — refuse anything outside this range. The lower
 * bound protects against an operator typo that would silently shred
 * still-useful audit history; the upper bound stops a runaway value
 * from making the cleanup a no-op.
 */
export const MIN_RETENTION_DAYS = 7;
export const MAX_RETENTION_DAYS = 365;
export const DEFAULT_RETENTION_DAYS = 30;

export interface CleanupResult {
  companyId: string;
  deleted: number;
  cutoff: Date;
  retentionDays: number;
}

export class InvalidRetentionError extends Error {
  constructor(retentionDays: number) {
    super(
      `retentionDays must be between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS}, got ${retentionDays}`,
    );
    this.name = "InvalidRetentionError";
  }
}

export function validateRetentionDays(input: unknown): number {
  const value = typeof input === "number" ? input : Number.NaN;
  if (
    !Number.isFinite(value) ||
    value < MIN_RETENTION_DAYS ||
    value > MAX_RETENTION_DAYS
  ) {
    throw new InvalidRetentionError(value);
  }
  return Math.floor(value);
}

/**
 * Delete tracking history older than `retentionDays` for a single
 * tenant. The DELETE goes through `withTenantFilter` so an off-by-one
 * in a caller can never spill into another company's data.
 *
 * Used by:
 *   - POST /api/admin/driver-locations/cleanup (per-tenant call)
 *   - scripts/cleanup-driver-locations.ts (loops every company)
 *
 * `dryRun` returns the cutoff and a zero count — useful in CI before
 * encoding the cron, no rows are touched.
 */
export async function cleanupDriverLocations(input: {
  companyId: string;
  retentionDays?: number;
  dryRun?: boolean;
}): Promise<CleanupResult> {
  const retentionDays = validateRetentionDays(
    input.retentionDays ?? DEFAULT_RETENTION_DAYS,
  );
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  if (input.dryRun) {
    return { companyId: input.companyId, deleted: 0, cutoff, retentionDays };
  }

  const deleted = await db
    .delete(driverLocations)
    .where(
      and(
        withTenantFilter(driverLocations, [], input.companyId),
        lt(driverLocations.recordedAt, cutoff),
      ),
    )
    .returning({ id: driverLocations.id });

  return {
    companyId: input.companyId,
    deleted: deleted.length,
    cutoff,
    retentionDays,
  };
}
