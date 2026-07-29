import { createHash } from "node:crypto";

/**
 * Deterministic hash of an OptimizationJob's logical inputs. Same logical
 * inputs ⇒ same hash ⇒ a previously-COMPLETED job is reused as a cache
 * hit instead of re-running VROOM. Order-invariant on every array — the
 * cache must hit regardless of how the caller orders ids.
 *
 * Every entity that can change the plan participates as an (id, updatedAt)
 * pair, never as a bare id: editing an order's coordinates, a vehicle's
 * capacity or skills, a driver's schedule, or a zone polygon has to
 * invalidate the cache. Hashing only ids (the old behavior) kept returning
 * stale plans after the operator fixed the underlying data.
 *
 * Zones are hashed as the full set of the company's *active* zones rather
 * than a selected subset, because `createZoneBatches` partitions against all
 * of them — so deactivating or deleting one changes the plan even though no
 * id in the request changed.
 *
 * Lives in its own module (separate from `lifecycle.ts`) so unit tests
 * can exercise the real implementation without going through the preload
 * mock that stubs the lifecycle barrel.
 */
export interface HashableRef {
  id: string;
  updatedAt?: Date | string | null;
}

/** @deprecated Use {@link HashableRef} — kept so existing imports keep working. */
export type HashableOrderRef = HashableRef;

const iso = (d: Date | string | null | undefined): string | null =>
  d instanceof Date ? d.toISOString() : (d ?? null);

const stamped = (refs: HashableRef[]): string[] =>
  refs.map((r) => `${r.id}@${iso(r.updatedAt) ?? ""}`).sort();

export function calculateInputHash(
  configurationId: string,
  vehicles: HashableRef[],
  drivers: HashableRef[],
  pendingOrders: HashableRef[],
  stamps?: {
    configurationUpdatedAt?: Date | string | null;
    presetUpdatedAt?: Date | string | null;
    zones?: HashableRef[];
  },
): string {
  const data = JSON.stringify({
    configurationId,
    vehicles: stamped(vehicles),
    drivers: stamped(drivers),
    orders: stamped(pendingOrders),
    zones: stamps?.zones ? stamped(stamps.zones) : null,
    configurationUpdatedAt: iso(stamps?.configurationUpdatedAt),
    presetUpdatedAt: iso(stamps?.presetUpdatedAt),
  });
  return createHash("sha256").update(data).digest("hex");
}
