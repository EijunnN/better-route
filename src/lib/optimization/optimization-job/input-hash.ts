import { createHash } from "node:crypto";

/**
 * Deterministic hash of an OptimizationJob's logical inputs. Same logical
 * inputs ⇒ same hash ⇒ a previously-COMPLETED job is reused as a cache
 * hit instead of re-running VROOM. Order-invariant on every array — the
 * cache must hit regardless of how the caller orders ids.
 *
 * Lives in its own module (separate from `lifecycle.ts`) so unit tests
 * can exercise the real implementation without going through the preload
 * mock that stubs the lifecycle barrel.
 */
export function calculateInputHash(
  configurationId: string,
  vehicleIds: string[],
  driverIds: string[],
  pendingOrderIds: string[],
): string {
  const data = JSON.stringify({
    configurationId,
    vehicleIds: [...vehicleIds].sort(),
    driverIds: [...driverIds].sort(),
    pendingOrderIds: [...pendingOrderIds].sort(),
  });
  return createHash("sha256").update(data).digest("hex");
}
