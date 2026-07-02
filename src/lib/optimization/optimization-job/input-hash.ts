import { createHash } from "node:crypto";

/**
 * Deterministic hash of an OptimizationJob's logical inputs. Same logical
 * inputs ⇒ same hash ⇒ a previously-COMPLETED job is reused as a cache
 * hit instead of re-running VROOM. Order-invariant on every array — the
 * cache must hit regardless of how the caller orders ids.
 *
 * Orders participate as (id, updatedAt) pairs and the configuration/preset
 * as updatedAt stamps: editing coordinates, time windows, weights or preset
 * knobs invalidates the cache. Hashing only ids (the old behavior) kept
 * returning stale plans after the operator fixed order data.
 *
 * Lives in its own module (separate from `lifecycle.ts`) so unit tests
 * can exercise the real implementation without going through the preload
 * mock that stubs the lifecycle barrel.
 */
export interface HashableOrderRef {
  id: string;
  updatedAt?: Date | string | null;
}

export function calculateInputHash(
  configurationId: string,
  vehicleIds: string[],
  driverIds: string[],
  pendingOrders: HashableOrderRef[],
  stamps?: {
    configurationUpdatedAt?: Date | string | null;
    presetUpdatedAt?: Date | string | null;
  },
): string {
  const iso = (d: Date | string | null | undefined): string | null =>
    d instanceof Date ? d.toISOString() : (d ?? null);

  const data = JSON.stringify({
    configurationId,
    vehicleIds: [...vehicleIds].sort(),
    driverIds: [...driverIds].sort(),
    orders: pendingOrders
      .map((o) => `${o.id}@${iso(o.updatedAt) ?? ""}`)
      .sort(),
    configurationUpdatedAt: iso(stamps?.configurationUpdatedAt),
    presetUpdatedAt: iso(stamps?.presetUpdatedAt),
  });
  return createHash("sha256").update(data).digest("hex");
}
