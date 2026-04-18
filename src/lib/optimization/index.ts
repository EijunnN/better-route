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

// Adapters (VROOM only — PyVRP was removed as a strategic decision)
export { VroomAdapter, vroomAdapter } from "./vroom-adapter";

// Factory (thin pass-through over vroomAdapter)
export {
  selectOptimizer,
  getAvailableOptimizers,
  optimize,
} from "./optimizer-factory";
