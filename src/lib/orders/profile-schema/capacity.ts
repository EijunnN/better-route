/**
 * Build solver capacity vectors from a ProfileSchema.
 *
 * The solver (VROOM) takes a fixed-size delivery vector per order and a
 * matching capacity vector per vehicle. Each slot corresponds to one
 * dimension in `schema.activeDimensions`, in that exact order.
 */

import type { ORDER_TYPES } from "@/db/schema";
import type { ProfileSchema } from "./types";

export interface OrderCapacityInput {
  weightRequired?: number | null;
  volumeRequired?: number | null;
  orderValue?: number | null;
  unitsRequired?: number | null;
  orderType?: keyof typeof ORDER_TYPES | null;
  priority?: number | null;
}

export interface VehicleCapacityInput {
  weightCapacity?: number | null;
  volumeCapacity?: number | null;
  maxValueCapacity?: number | null;
  maxUnitsCapacity?: number | null;
}

export interface CapacityVector {
  /** Numbers the solver consumes, ordered by schema.activeDimensions. */
  values: number[];
  /** Names for logging/debugging. */
  dimensions: string[];
}

const ORDER_DEFAULTS: Record<string, number> = {
  WEIGHT: 0,
  VOLUME: 0,
  VALUE: 0,
  UNITS: 1, // every order counts as at least one unit
};

const VEHICLE_DEFAULTS: Record<string, number> = {
  WEIGHT: 10_000,
  VOLUME: 100,
  VALUE: 10_000_000,
  UNITS: 50,
};

function round(n: number | null | undefined, fallback: number): number {
  const v = n ?? fallback;
  return Math.round(Number.isFinite(v) ? v : fallback);
}

export function buildOrderCapacityVector(
  order: OrderCapacityInput,
  schema: ProfileSchema,
): CapacityVector {
  const values: number[] = [];
  const dimensions: string[] = [];
  for (const dim of schema.activeDimensions) {
    const def = ORDER_DEFAULTS[dim] ?? 0;
    switch (dim) {
      case "WEIGHT":
        values.push(round(order.weightRequired, def));
        break;
      case "VOLUME":
        values.push(round(order.volumeRequired, def));
        break;
      case "VALUE":
        values.push(round(order.orderValue, def));
        break;
      case "UNITS":
        values.push(round(order.unitsRequired, def));
        break;
    }
    dimensions.push(dim);
  }
  return { values, dimensions };
}

export function buildVehicleCapacityVector(
  vehicle: VehicleCapacityInput,
  schema: ProfileSchema,
): CapacityVector {
  const values: number[] = [];
  const dimensions: string[] = [];
  for (const dim of schema.activeDimensions) {
    const def = VEHICLE_DEFAULTS[dim];
    switch (dim) {
      case "WEIGHT":
        values.push(round(vehicle.weightCapacity, def));
        break;
      case "VOLUME":
        values.push(round(vehicle.volumeCapacity, def));
        break;
      case "VALUE":
        values.push(round(vehicle.maxValueCapacity, def));
        break;
      case "UNITS":
        values.push(round(vehicle.maxUnitsCapacity, def));
        break;
    }
    dimensions.push(dim);
  }
  return { values, dimensions };
}

/**
 * Resolve the priority score for an order — uses the schema's priorityMapping
 * when orderType is enabled, otherwise falls back to order.priority.
 */
export function resolveOrderPriority(
  order: OrderCapacityInput,
  schema: ProfileSchema,
): number | undefined {
  if (schema.requireOrderType && order.orderType) {
    const mapped = schema.priorityMapping[order.orderType];
    if (typeof mapped === "number") return mapped;
  }
  if (typeof order.priority === "number") return order.priority;
  return undefined;
}
