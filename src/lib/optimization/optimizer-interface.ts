/**
 * Optimizer Interface - Common contract for route optimization engines
 *
 * This interface allows swapping between different optimization backends
 * (VROOM, PyVRP, etc.) while maintaining a consistent API.
 */

import type { CompanyOptimizationProfile } from "../capacity-mapper";

// ============================================
// INPUT TYPES
// ============================================

export interface OptimizerOrder {
  id: string;
  trackingId: string;
  address: string;
  latitude: number;
  longitude: number;
  // Capacity requirements (dynamic based on profile)
  weightRequired: number;
  volumeRequired: number;
  orderValue?: number;
  unitsRequired?: number;
  // Prioritization
  orderType?: "NEW" | "RESCHEDULED" | "URGENT";
  priority?: number;
  // Time constraints
  timeWindowStart?: string;
  timeWindowEnd?: string;
  serviceTime?: number; // seconds
  // Skill requirements
  skillsRequired?: string[];
  // Zone assignment
  zoneId?: string;
}

export interface OptimizerVehicle {
  id: string;
  identifier: string; // plate or name
  // Capacity limits (dynamic based on profile)
  maxWeight: number;
  maxVolume: number;
  maxValueCapacity?: number;
  maxUnitsCapacity?: number;
  maxOrders?: number;
  // Location
  originLatitude?: number;
  originLongitude?: number;
  // Capabilities
  skills?: string[];
  speedFactor?: number;
}

export interface OptimizerDepot {
  latitude: number;
  longitude: number;
  address?: string;
  timeWindowStart?: string;
  timeWindowEnd?: string;
}

export interface OptimizerConfig {
  depot: OptimizerDepot;
  objective: "DISTANCE" | "TIME" | "BALANCED";
  profile?: CompanyOptimizationProfile;
  // Balancing
  balanceVisits?: boolean;
  // Constraints
  maxDistanceKm?: number;
  maxTravelTimeMinutes?: number;
  trafficFactor?: number; // 0-100
  // Route end mode
  routeEndMode?: "DRIVER_ORIGIN" | "SPECIFIC_DEPOT" | "OPEN_END";
  endDepot?: OptimizerDepot;
  // Optimization options
  openStart?: boolean;
  minimizeVehicles?: boolean;
  flexibleTimeWindows?: boolean;
  maxRoutes?: number;
  // Timeout
  timeoutMs?: number;
}

// ============================================
// OUTPUT TYPES
// ============================================

export interface OptimizedStop {
  orderId: string;
  trackingId: string;
  address: string;
  latitude: number;
  longitude: number;
  sequence: number;
  arrivalTime?: number;
  serviceTime?: number;
  waitingTime?: number;
}

export interface OptimizedRoute {
  vehicleId: string;
  vehicleIdentifier: string;
  stops: OptimizedStop[];
  totalDistance: number; // meters
  totalDuration: number; // seconds
  totalServiceTime: number; // seconds
  totalTravelTime: number; // seconds
  totalWeight: number;
  totalVolume: number;
  geometry?: string; // encoded polyline
}

export interface UnassignedOrder {
  orderId: string;
  trackingId: string;
  reason: string;
}

export interface OptimizationMetrics {
  totalDistance: number;
  totalDuration: number;
  totalRoutes: number;
  totalStops: number;
  computingTimeMs: number;
  balanceScore?: number;
}

export interface OptimizationResult {
  routes: OptimizedRoute[];
  unassigned: UnassignedOrder[];
  metrics: OptimizationMetrics;
  optimizer: string; // identifier of the optimizer used
}

// ============================================
// OPTIMIZER INTERFACE
// ============================================

export interface IOptimizer {
  /**
   * Unique identifier for this optimizer
   */
  readonly name: string;

  /**
   * Human-readable display name
   */
  readonly displayName: string;

  /**
   * Check if the optimizer is available and ready to use
   */
  isAvailable(): Promise<boolean>;

  /**
   * Run route optimization
   */
  optimize(
    orders: OptimizerOrder[],
    vehicles: OptimizerVehicle[],
    config: OptimizerConfig,
  ): Promise<OptimizationResult>;

  /**
   * Get estimated time for optimization (optional)
   */
  estimateTime?(orderCount: number, vehicleCount: number): number;

  /**
   * Get optimizer capabilities
   */
  getCapabilities(): OptimizerCapabilities;
}

export interface OptimizerCapabilities {
  supportsTimeWindows: boolean;
  supportsSkills: boolean;
  supportsMultiDimensionalCapacity: boolean;
  supportsPriorities: boolean;
  supportsBalancing: boolean;
  maxOrders: number; // -1 for unlimited
  maxVehicles: number; // -1 for unlimited
  typicalSpeed: "fast" | "medium" | "slow";
  qualityLevel: "good" | "excellent";
}

// ============================================
// OPTIMIZER TYPE ENUM
// ============================================

export type OptimizerType = "VROOM" | "PYVRP" | "AUTO";

export interface OptimizerInfo {
  type: OptimizerType;
  name: string;
  displayName: string;
  description: string;
  available: boolean;
  capabilities: OptimizerCapabilities;
}
