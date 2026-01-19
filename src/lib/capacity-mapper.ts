/**
 * Capacity Mapper - Dynamic mapping of order/vehicle capacities for VROOM optimization
 *
 * This module bridges the company-specific optimization profiles with VROOM's
 * multi-dimensional capacity arrays. Each company can configure which dimensions
 * (weight, volume, value, units) are relevant for their optimization.
 */

import type { CAPACITY_DIMENSIONS, ORDER_TYPES } from "@/db/schema";

// Types for company optimization profile
export interface CompanyOptimizationProfile {
  id: string;
  companyId: string;
  enableOrderValue: boolean;
  enableOrderType: boolean;
  enableWeight: boolean;
  enableVolume: boolean;
  enableUnits: boolean;
  activeDimensions: (keyof typeof CAPACITY_DIMENSIONS)[];
  priorityMapping: Record<keyof typeof ORDER_TYPES, number>;
  defaultTimeWindows?: string[];
}

// Order data for capacity mapping
export interface OrderCapacityData {
  weightRequired?: number | null;
  volumeRequired?: number | null;
  orderValue?: number | null;
  unitsRequired?: number | null;
  orderType?: keyof typeof ORDER_TYPES | null;
  priority?: number | null;
}

// Vehicle data for capacity mapping
export interface VehicleCapacityData {
  weightCapacity?: number | null;
  volumeCapacity?: number | null;
  maxValueCapacity?: number | null;
  maxUnitsCapacity?: number | null;
}

// Result of capacity mapping
export interface CapacityMappingResult {
  // Array of capacity values for VROOM delivery/capacity arrays
  capacityArray: number[];
  // Names of dimensions in order (for debugging/logging)
  dimensionNames: string[];
  // Calculated priority for VROOM (0-100)
  priority?: number;
}

/**
 * Default profile when no company profile is configured
 * Uses traditional weight + volume dimensions
 */
export const DEFAULT_PROFILE: CompanyOptimizationProfile = {
  id: "default",
  companyId: "default",
  enableOrderValue: false,
  enableOrderType: false,
  enableWeight: true,
  enableVolume: true,
  enableUnits: false,
  activeDimensions: ["WEIGHT", "VOLUME"],
  priorityMapping: {
    NEW: 50,
    RESCHEDULED: 80,
    URGENT: 100,
  },
};

/**
 * Parse profile from database format (JSON strings) to typed format
 */
export function parseProfile(
  dbProfile: {
    id: string;
    companyId: string;
    enableOrderValue: boolean;
    enableOrderType: boolean;
    enableWeight: boolean;
    enableVolume: boolean;
    enableUnits: boolean;
    activeDimensions: string;
    priorityMapping: string;
    defaultTimeWindows?: string | null;
  } | null,
): CompanyOptimizationProfile {
  if (!dbProfile) {
    return DEFAULT_PROFILE;
  }

  let activeDimensions: (keyof typeof CAPACITY_DIMENSIONS)[];
  let priorityMapping: Record<keyof typeof ORDER_TYPES, number>;

  try {
    activeDimensions = JSON.parse(dbProfile.activeDimensions);
  } catch {
    activeDimensions = ["WEIGHT", "VOLUME"];
  }

  try {
    priorityMapping = JSON.parse(dbProfile.priorityMapping);
  } catch {
    priorityMapping = { NEW: 50, RESCHEDULED: 80, URGENT: 100 };
  }

  return {
    id: dbProfile.id,
    companyId: dbProfile.companyId,
    enableOrderValue: dbProfile.enableOrderValue,
    enableOrderType: dbProfile.enableOrderType,
    enableWeight: dbProfile.enableWeight,
    enableVolume: dbProfile.enableVolume,
    enableUnits: dbProfile.enableUnits,
    activeDimensions,
    priorityMapping,
    defaultTimeWindows: dbProfile.defaultTimeWindows
      ? JSON.parse(dbProfile.defaultTimeWindows)
      : undefined,
  };
}

/**
 * Map order capacity data to VROOM delivery array based on company profile
 *
 * VROOM uses arrays for multi-dimensional capacities. The order of dimensions
 * must match between orders (delivery) and vehicles (capacity).
 *
 * @example
 * // Company A: uses weight + volume
 * mapOrderCapacities(order, profileA) // Returns [500, 10] for weight=500g, volume=10L
 *
 * // Company B: uses value only
 * mapOrderCapacities(order, profileB) // Returns [150000] for value=1500.00 (in cents)
 */
export function mapOrderCapacities(
  order: OrderCapacityData,
  profile: CompanyOptimizationProfile,
): CapacityMappingResult {
  const capacityArray: number[] = [];
  const dimensionNames: string[] = [];

  for (const dimension of profile.activeDimensions) {
    switch (dimension) {
      case "WEIGHT":
        capacityArray.push(Math.round(order.weightRequired ?? 0));
        dimensionNames.push("WEIGHT");
        break;
      case "VOLUME":
        capacityArray.push(Math.round(order.volumeRequired ?? 0));
        dimensionNames.push("VOLUME");
        break;
      case "VALUE":
        capacityArray.push(Math.round(order.orderValue ?? 0));
        dimensionNames.push("VALUE");
        break;
      case "UNITS":
        capacityArray.push(Math.round(order.unitsRequired ?? 1)); // Default 1 unit
        dimensionNames.push("UNITS");
        break;
    }
  }

  // Calculate priority based on order type if enabled
  let priority: number | undefined;
  if (profile.enableOrderType && order.orderType) {
    priority = profile.priorityMapping[order.orderType] ?? order.priority ?? 50;
  } else if (order.priority !== undefined && order.priority !== null) {
    priority = order.priority;
  }

  return {
    capacityArray,
    dimensionNames,
    priority,
  };
}

/**
 * Map vehicle capacity data to VROOM capacity array based on company profile
 *
 * The order of dimensions must match the order used in mapOrderCapacities
 *
 * @example
 * // Company A: uses weight + volume
 * mapVehicleCapacities(vehicle, profileA) // Returns [10000, 100] for maxWeight=10kg, maxVolume=100L
 */
export function mapVehicleCapacities(
  vehicle: VehicleCapacityData,
  profile: CompanyOptimizationProfile,
): CapacityMappingResult {
  const capacityArray: number[] = [];
  const dimensionNames: string[] = [];

  for (const dimension of profile.activeDimensions) {
    switch (dimension) {
      case "WEIGHT":
        capacityArray.push(Math.round(vehicle.weightCapacity ?? 10000));
        dimensionNames.push("WEIGHT");
        break;
      case "VOLUME":
        capacityArray.push(Math.round(vehicle.volumeCapacity ?? 100));
        dimensionNames.push("VOLUME");
        break;
      case "VALUE":
        capacityArray.push(Math.round(vehicle.maxValueCapacity ?? 10000000)); // Default 100k
        dimensionNames.push("VALUE");
        break;
      case "UNITS":
        capacityArray.push(Math.round(vehicle.maxUnitsCapacity ?? 50));
        dimensionNames.push("UNITS");
        break;
    }
  }

  return {
    capacityArray,
    dimensionNames,
  };
}

/**
 * Get dimension info for debugging and logging
 */
export function getDimensionInfo(profile: CompanyOptimizationProfile): string {
  return `Dimensions: ${profile.activeDimensions.join(", ")} | ` +
    `Value: ${profile.enableOrderValue ? "ON" : "OFF"} | ` +
    `Type: ${profile.enableOrderType ? "ON" : "OFF"}`;
}

/**
 * Validate that a profile is correctly configured
 */
export function validateProfile(
  profile: CompanyOptimizationProfile,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Must have at least one dimension
  if (profile.activeDimensions.length === 0) {
    errors.push("Al menos una dimensión de capacidad debe estar activa");
  }

  // Check consistency: if enableWeight, WEIGHT should be in activeDimensions
  if (
    profile.enableWeight &&
    !profile.activeDimensions.includes("WEIGHT")
  ) {
    errors.push("El peso está habilitado pero no está en las dimensiones activas");
  }

  if (
    profile.enableVolume &&
    !profile.activeDimensions.includes("VOLUME")
  ) {
    errors.push("El volumen está habilitado pero no está en las dimensiones activas");
  }

  if (
    profile.enableOrderValue &&
    !profile.activeDimensions.includes("VALUE")
  ) {
    errors.push("El valorizado está habilitado pero no está en las dimensiones activas");
  }

  if (
    profile.enableUnits &&
    !profile.activeDimensions.includes("UNITS")
  ) {
    errors.push("Las unidades están habilitadas pero no están en las dimensiones activas");
  }

  // Validate priority mapping
  const validTypes: (keyof typeof ORDER_TYPES)[] = ["NEW", "RESCHEDULED", "URGENT"];
  for (const type of validTypes) {
    const priority = profile.priorityMapping[type];
    if (priority !== undefined && (priority < 0 || priority > 100)) {
      errors.push(`Prioridad para ${type} debe estar entre 0 y 100`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create a profile configuration object for the database
 */
export function createProfileConfig(options: {
  enableWeight?: boolean;
  enableVolume?: boolean;
  enableValue?: boolean;
  enableUnits?: boolean;
  enableOrderType?: boolean;
  priorityNew?: number;
  priorityRescheduled?: number;
  priorityUrgent?: number;
}): {
  enableOrderValue: boolean;
  enableOrderType: boolean;
  enableWeight: boolean;
  enableVolume: boolean;
  enableUnits: boolean;
  activeDimensions: string;
  priorityMapping: string;
} {
  const {
    enableWeight = true,
    enableVolume = true,
    enableValue = false,
    enableUnits = false,
    enableOrderType = false,
    priorityNew = 50,
    priorityRescheduled = 80,
    priorityUrgent = 100,
  } = options;

  const activeDimensions: string[] = [];
  if (enableWeight) activeDimensions.push("WEIGHT");
  if (enableVolume) activeDimensions.push("VOLUME");
  if (enableValue) activeDimensions.push("VALUE");
  if (enableUnits) activeDimensions.push("UNITS");

  return {
    enableOrderValue: enableValue,
    enableOrderType,
    enableWeight,
    enableVolume,
    enableUnits,
    activeDimensions: JSON.stringify(activeDimensions),
    priorityMapping: JSON.stringify({
      NEW: priorityNew,
      RESCHEDULED: priorityRescheduled,
      URGENT: priorityUrgent,
    }),
  };
}

/**
 * Pre-defined profile templates for common company types
 */
export const PROFILE_TEMPLATES = {
  // Traditional logistics: weight + volume
  LOGISTICS: createProfileConfig({
    enableWeight: true,
    enableVolume: true,
  }),

  // High-value goods (phones, electronics): value-based constraints
  HIGH_VALUE: createProfileConfig({
    enableWeight: false,
    enableVolume: false,
    enableValue: true,
    enableOrderType: true,
  }),

  // Simple delivery (food, packages): unit-based
  SIMPLE: createProfileConfig({
    enableWeight: false,
    enableVolume: false,
    enableUnits: true,
  }),

  // Full featured: all dimensions
  FULL: createProfileConfig({
    enableWeight: true,
    enableVolume: true,
    enableValue: true,
    enableUnits: true,
    enableOrderType: true,
  }),
} as const;
