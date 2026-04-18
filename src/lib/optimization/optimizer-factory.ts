/**
 * Optimizer Factory — pass-through over the single available engine (VROOM).
 *
 * PyVRP was removed: it cannot complete within operational budgets at our
 * workload scale (1000+ orders), so VROOM is the only viable solver. This
 * file stays as a thin shim so existing callers (`selectOptimizer`,
 * `getAvailableOptimizers`, `optimize`) don't break.
 */

import type {
  IOptimizer,
  OptimizerInfo,
  OptimizerConfig,
  OptimizerOrder,
  OptimizerVehicle,
  OptimizationResult,
} from "./optimizer-interface";
import { vroomAdapter } from "./vroom-adapter";

/**
 * Return the single available optimizer (VROOM). Kept async-shaped so existing
 * callers that `await` it don't need to change.
 */
export async function selectOptimizer(
  _orderCount?: number,
  _vehicleCount?: number,
  _preferredType?: unknown,
): Promise<IOptimizer> {
  return vroomAdapter;
}

/**
 * Expose the single optimizer in the same shape the UI/api route expects.
 */
export async function getAvailableOptimizers(): Promise<OptimizerInfo[]> {
  const available = await vroomAdapter.isAvailable();
  return [
    {
      type: "VROOM",
      name: vroomAdapter.name,
      displayName: vroomAdapter.displayName,
      description:
        "Rutas optimizadas en segundos. Ideal para planificación diaria y actualizaciones rápidas.",
      available,
      capabilities: vroomAdapter.getCapabilities(),
    },
  ];
}

/**
 * Unified optimization function — always VROOM.
 */
export async function optimize(
  orders: OptimizerOrder[],
  vehicles: OptimizerVehicle[],
  config: OptimizerConfig,
): Promise<OptimizationResult> {
  return vroomAdapter.optimize(orders, vehicles, config);
}

// Re-export the adapter for convenience.
export { vroomAdapter };
export type { IOptimizer, OptimizerInfo };
