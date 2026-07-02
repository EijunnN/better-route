import { baseConfig, LIMA_POINTS, makeOrder, makeVehicle } from "../fixtures";
import type { Scenario } from "../types";

/**
 * Product-target scale: 1000 orders in one solve. This is the size the
 * product promises per plan — and exactly the regime where the old stack
 * silently degraded (OSRM --max-table-size 1000 rejected the matrix, the
 * 60s client timeout aborted the solve, and the greedy fallback shipped a
 * plan labeled VROOM). With those removed/fixed, this scenario asserts the
 * honest path: VROOM solves it or the run FAILS loudly.
 *
 * Coordinates are deterministically jittered around the Lima cluster so the
 * matrix has ~1000 unique locations (no grouping shortcut).
 */
const jitter = (i: number, salt: number): number =>
  ((((i + 1) * (salt + 7919)) % 1000) / 1000 - 0.5) * 0.02; // ±0.01° ≈ ±1.1 km

export const scenario: Scenario = {
  name: "29-1000-orders-target-scale",
  description:
    "1000 orders with unique coords, 25 vehicles — the promised plan size in one honest VROOM solve",
  orders: Array.from({ length: 1000 }, (_, i) => {
    const point = LIMA_POINTS[i % LIMA_POINTS.length];
    const hasWindow = i % 5 === 0; // 20% carry a time window
    return makeOrder(i, {
      latitude: point.lat + jitter(i, 13),
      longitude: point.lng + jitter(i, 31),
      weightRequired: 5 + (i % 25) * 2, // 5..53 kg
      volumeRequired: 1 + (i % 4),
      ...(hasWindow && {
        timeWindowStart: i % 10 < 5 ? "09:00" : "13:00",
        timeWindowEnd: i % 10 < 5 ? "13:00" : "18:00",
      }),
    });
  }),
  vehicles: Array.from({ length: 25 }, (_, i) =>
    makeVehicle(i + 1, {
      timeWindowStart: "07:00",
      timeWindowEnd: "19:00",
      maxWeight: 2000,
      maxVolume: 60,
      maxOrders: 50,
    }),
  ),
  config: baseConfig({ timeoutMs: 310000 }),
  expected: {
    maxHardViolations: 0,
    // Capacity × window interactions leave a tail out of the feasible
    // envelope at this density; cap it so a regression that strands whole
    // batches (or a matrix failure) still fails the run.
    maxUnassigned: 120,
    minRoutes: 15,
    maxRoutes: 25,
  },
};
