import { z } from "zod";
import { VEHICLE_STATUS } from "./vehicle";

/**
 * Vehicle Status Transition Validation Module
 * Implements Story 3.2: Gestión del Estado Operativo de Vehículos
 */

// Status transition rules matrix
// Key: fromStatus, Value: array of allowed toStatus values
export const STATUS_TRANSITION_RULES: Record<string, string[]> = {
  AVAILABLE: ["IN_MAINTENANCE", "ASSIGNED", "INACTIVE"],
  IN_MAINTENANCE: ["AVAILABLE", "INACTIVE"],
  ASSIGNED: ["AVAILABLE", "IN_MAINTENANCE", "INACTIVE"],
  INACTIVE: ["AVAILABLE"],
};

// Precomputed Set versions for O(1) lookups
const STATUS_TRANSITION_SETS: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(STATUS_TRANSITION_RULES).map(([status, transitions]) => [
    status,
    new Set(transitions),
  ])
);

// Status transitions that require checking for active routes/assignments
export const REQUIRES_ACTIVE_ROUTE_CHECK: Set<string> = new Set([
  "ASSIGNED_TO_AVAILABLE",
  "ASSIGNED_TO_IN_MAINTENANCE",
  "ASSIGNED_TO_INACTIVE",
  "AVAILABLE_TO_INACTIVE",
  "IN_MAINTENANCE_TO_INACTIVE",
]);

// Status display names (in Spanish)
export const STATUS_DISPLAY_NAMES: Record<string, string> = {
  AVAILABLE: "Disponible",
  IN_MAINTENANCE: "En Mantenimiento",
  ASSIGNED: "Asignado",
  INACTIVE: "Inactivo",
};

/**
 * Validates if a status transition is allowed based on predefined rules
 */
export function validateStatusTransition(
  fromStatus: string,
  toStatus: string,
): { valid: boolean; reason?: string } {
  // Same status is not a transition
  if (fromStatus === toStatus) {
    return { valid: false, reason: "El estado es el mismo que el actual" };
  }

  const allowedTransitionsSet = STATUS_TRANSITION_SETS[fromStatus];

  if (!allowedTransitionsSet) {
    return { valid: false, reason: `Estado origen no válido: ${fromStatus}` };
  }

  if (!allowedTransitionsSet.has(toStatus)) {
    return {
      valid: false,
      reason: `Transición no permitida de ${STATUS_DISPLAY_NAMES[fromStatus] || fromStatus} a ${STATUS_DISPLAY_NAMES[toStatus] || toStatus}`,
    };
  }

  return { valid: true };
}

/**
 * Check if a transition requires validation of active routes
 * This is a placeholder - actual route checking would be implemented
 * when the routes/planifications module is created
 */
export function requiresActiveRouteCheck(
  fromStatus: string,
  toStatus: string,
): boolean {
  const transitionKey = `${fromStatus}_TO_${toStatus}`
    .toUpperCase()
    .replace(/\s+/g, "_");
  return REQUIRES_ACTIVE_ROUTE_CHECK.has(transitionKey);
}

/**
 * Generate transition key for validation
 */
export function getTransitionKey(fromStatus: string, toStatus: string): string {
  return `${fromStatus}_TO_${toStatus}`.toUpperCase().replace(/\s+/g, "_");
}

// Zod schemas for status transition operations

export const vehicleStatusTransitionSchema = z.object({
  newStatus: z.enum(VEHICLE_STATUS, {
    message: "Estado debe ser AVAILABLE, IN_MAINTENANCE, ASSIGNED o INACTIVE",
  }),
  reason: z.string().max(500, "Motivo demasiado largo").optional(),
  force: z.boolean().default(false).optional(),
});

export const vehicleStatusHistoryQuerySchema = z.object({
  vehicleId: z.string().uuid("ID de vehículo inválido"),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export const vehicleAvailabilityQuerySchema = z.object({
  startDate: z.string().datetime("Fecha de inicio inválida").optional(),
  endDate: z.string().datetime("Fecha de fin inválida").optional(),
  fleetId: z.string().uuid("ID de flota inválido").optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type VehicleStatusTransitionInput = z.infer<
  typeof vehicleStatusTransitionSchema
>;
export type VehicleStatusHistoryQuery = z.infer<
  typeof vehicleStatusHistoryQuerySchema
>;
export type VehicleAvailabilityQuery = z.infer<
  typeof vehicleAvailabilityQuerySchema
>;

/**
 * Status transition error response structure
 */
export interface StatusTransitionError {
  valid: boolean;
  reason: string;
  requiresReassignment?: boolean;
  activeRouteCount?: number;
  suggestedAlternativeStatuses?: string[];
}

/**
 * Status change result structure
 */
export interface StatusChangeResult {
  success: boolean;
  vehicleId: string;
  previousStatus: string;
  newStatus: string;
  message?: string;
  warning?: string;
}
