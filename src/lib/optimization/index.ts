/**
 * Optimization Module - Unified exports for route optimization
 */

// Interface and types
export type {
  IOptimizer,
  OptimizerCapabilities,
  OptimizerConfig,
  OptimizerOrder,
  OptimizerVehicle,
  OptimizerDepot,
  OptimizedStop,
  OptimizedRoute,
  UnassignedOrder,
  OptimizationMetrics,
  OptimizationResult,
  OptimizerType,
  OptimizerInfo,
} from "./optimizer-interface";

// Adapters
export { VroomAdapter, vroomAdapter } from "./vroom-adapter";
export { PyVRPAdapter, pyvrpAdapter } from "./pyvrp-adapter";

// Factory
export {
  getOptimizer,
  selectOptimizer,
  getAvailableOptimizers,
  createOptimizer,
  optimize,
} from "./optimizer-factory";
