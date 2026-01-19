/**
 * Optimizer Factory - Selects and manages optimization engines
 *
 * This factory provides a unified way to access optimization engines,
 * with automatic fallback and intelligent selection based on problem size.
 */

import type {
  IOptimizer,
  OptimizerType,
  OptimizerInfo,
  OptimizerConfig,
  OptimizerOrder,
  OptimizerVehicle,
  OptimizationResult,
} from "./optimizer-interface";
import { vroomAdapter, VroomAdapter } from "./vroom-adapter";
import { pyvrpAdapter, PyVRPAdapter } from "./pyvrp-adapter";

// Thresholds for automatic optimizer selection
const AUTO_SELECTION_THRESHOLDS = {
  // Use PyVRP for larger problems where quality matters more
  preferPyvrpAboveOrders: 500,
  // Always use VROOM below this for speed
  forceVroomBelowOrders: 50,
};

/**
 * Get an optimizer instance by type
 */
export function getOptimizer(type: OptimizerType): IOptimizer {
  switch (type) {
    case "VROOM":
      return vroomAdapter;
    case "PYVRP":
      return pyvrpAdapter;
    case "AUTO":
      // AUTO returns VROOM by default, actual selection happens in selectOptimizer
      return vroomAdapter;
    default:
      throw new Error(`Unknown optimizer type: ${type}`);
  }
}

/**
 * Select the best optimizer based on problem characteristics
 */
export async function selectOptimizer(
  orderCount: number,
  vehicleCount: number,
  preferredType?: OptimizerType,
): Promise<IOptimizer> {
  // If specific type requested, try to use it
  if (preferredType && preferredType !== "AUTO") {
    const optimizer = getOptimizer(preferredType);
    if (await optimizer.isAvailable()) {
      return optimizer;
    }
    console.warn(
      `Preferred optimizer ${preferredType} not available, falling back`,
    );
  }

  // Check availability
  const [vroomAvailable, pyvrpAvailable] = await Promise.all([
    vroomAdapter.isAvailable(),
    pyvrpAdapter.isAvailable(),
  ]);

  // If only one is available, use it
  if (vroomAvailable && !pyvrpAvailable) {
    return vroomAdapter;
  }
  if (!vroomAvailable && pyvrpAvailable) {
    return pyvrpAdapter;
  }
  if (!vroomAvailable && !pyvrpAvailable) {
    throw new Error("No optimization engine is available");
  }

  // Both available - select based on problem size
  if (orderCount < AUTO_SELECTION_THRESHOLDS.forceVroomBelowOrders) {
    // Small problems: always use VROOM for speed
    return vroomAdapter;
  }

  if (orderCount > AUTO_SELECTION_THRESHOLDS.preferPyvrpAboveOrders) {
    // Large problems: prefer PyVRP for quality (if user doesn't mind waiting)
    return pyvrpAdapter;
  }

  // Medium problems: use VROOM by default
  return vroomAdapter;
}

/**
 * Get information about all available optimizers
 */
export async function getAvailableOptimizers(): Promise<OptimizerInfo[]> {
  const optimizers: IOptimizer[] = [vroomAdapter, pyvrpAdapter];
  const results: OptimizerInfo[] = [];

  for (const optimizer of optimizers) {
    const available = await optimizer.isAvailable();
    results.push({
      type: optimizer.name as OptimizerType,
      name: optimizer.name,
      displayName: optimizer.displayName,
      description: getOptimizerDescription(optimizer.name as OptimizerType),
      available,
      capabilities: optimizer.getCapabilities(),
    });
  }

  return results;
}

/**
 * Get user-friendly description for optimizer
 */
function getOptimizerDescription(type: OptimizerType): string {
  switch (type) {
    case "VROOM":
      return "Rutas optimizadas en segundos. Ideal para planificación diaria y actualizaciones rápidas.";
    case "PYVRP":
      return "Máxima calidad de optimización. Ideal para planificación batch y problemas complejos.";
    case "AUTO":
      return "Selección automática del mejor optimizador según el tamaño del problema.";
    default:
      return "";
  }
}

/**
 * Unified optimization function with automatic optimizer selection
 */
export async function optimize(
  orders: OptimizerOrder[],
  vehicles: OptimizerVehicle[],
  config: OptimizerConfig,
  preferredType: OptimizerType = "AUTO",
): Promise<OptimizationResult> {
  const optimizer = await selectOptimizer(
    orders.length,
    vehicles.length,
    preferredType,
  );

  console.log(
    `[OptimizerFactory] Using ${optimizer.name} for ${orders.length} orders, ${vehicles.length} vehicles`,
  );

  return optimizer.optimize(orders, vehicles, config);
}

/**
 * Create a new optimizer instance (for testing or custom configuration)
 */
export function createOptimizer(
  type: OptimizerType,
  options?: Record<string, unknown>,
): IOptimizer {
  switch (type) {
    case "VROOM":
      return new VroomAdapter();
    case "PYVRP":
      return new PyVRPAdapter(options as { baseUrl?: string; apiKey?: string; timeoutMs?: number });
    default:
      throw new Error(`Cannot create optimizer of type: ${type}`);
  }
}

// Re-export types and adapters for convenience
export { vroomAdapter, pyvrpAdapter };
export type { IOptimizer, OptimizerType, OptimizerInfo };
