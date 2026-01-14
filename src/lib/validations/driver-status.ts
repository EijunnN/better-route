import { z } from "zod";
import { DRIVER_STATUS, DRIVER_STATUS_TRANSITIONS } from "@/db/schema";

/**
 * Driver Status Transition Validation Module
 * Implements Story 4.3: Gestión del Estado Operativo de Conductores
 */

// Status display names (in Spanish)
export const STATUS_DISPLAY_NAMES: Record<keyof typeof DRIVER_STATUS, string> =
  {
    AVAILABLE: "Disponible",
    ASSIGNED: "Asignado",
    IN_ROUTE: "En Ruta",
    ON_PAUSE: "En Pausa",
    COMPLETED: "Completado",
    UNAVAILABLE: "No Disponible",
    ABSENT: "Ausente",
  };

// Status color classes for UI display
export const STATUS_COLOR_CLASSES: Record<keyof typeof DRIVER_STATUS, string> =
  {
    AVAILABLE:
      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    ASSIGNED: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    IN_ROUTE:
      "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    ON_PAUSE:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    COMPLETED: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
    UNAVAILABLE: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    ABSENT:
      "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  };

// Status transitions that require checking for active routes/assignments
export const REQUIRES_ACTIVE_ROUTE_CHECK: Set<string> = new Set([
  "ASSIGNED_TO_AVAILABLE",
  "ASSIGNED_TO_UNAVAILABLE",
  "IN_ROUTE_TO_AVAILABLE",
  "IN_ROUTE_TO_UNAVAILABLE",
  "ON_PAUSE_TO_AVAILABLE",
  "ON_PAUSE_TO_UNAVAILABLE",
]);

// Transitions that indicate a driver has completed their work
export const WORK_COMPLETION_TRANSITIONS: Set<string> = new Set([
  "IN_ROUTE_TO_COMPLETED",
  "ON_PAUSE_TO_COMPLETED",
]);

/**
 * Validates if a status transition is allowed based on predefined rules
 */
export function validateStatusTransition(
  fromStatus: keyof typeof DRIVER_STATUS,
  toStatus: keyof typeof DRIVER_STATUS,
): { valid: boolean; reason?: string } {
  // Same status is not a transition
  if (fromStatus === toStatus) {
    return { valid: false, reason: "El estado es el mismo que el actual" };
  }

  const allowedTransitions = DRIVER_STATUS_TRANSITIONS[fromStatus];

  if (!allowedTransitions) {
    return { valid: false, reason: `Estado origen no válido: ${fromStatus}` };
  }

  if (!allowedTransitions.includes(toStatus)) {
    return {
      valid: false,
      reason: `Transición no permitida de ${STATUS_DISPLAY_NAMES[fromStatus]} a ${STATUS_DISPLAY_NAMES[toStatus]}`,
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
  fromStatus: keyof typeof DRIVER_STATUS,
  toStatus: keyof typeof DRIVER_STATUS,
): boolean {
  const transitionKey = `${fromStatus}_TO_${toStatus}`;
  return REQUIRES_ACTIVE_ROUTE_CHECK.has(transitionKey);
}

/**
 * Check if a transition indicates work completion
 */
export function isWorkCompletionTransition(
  fromStatus: keyof typeof DRIVER_STATUS,
  toStatus: keyof typeof DRIVER_STATUS,
): boolean {
  const transitionKey = `${fromStatus}_TO_${toStatus}`;
  return WORK_COMPLETION_TRANSITIONS.has(transitionKey);
}

/**
 * Get allowed transitions for a given status
 */
export function getAllowedTransitions(
  fromStatus: keyof typeof DRIVER_STATUS,
): (keyof typeof DRIVER_STATUS)[] {
  return DRIVER_STATUS_TRANSITIONS[fromStatus] || [];
}

// Zod schemas for status transition operations

export const driverStatusTransitionSchema = z.object({
  newStatus: z.enum(DRIVER_STATUS, {
    message:
      "Estado debe ser AVAILABLE, ASSIGNED, IN_ROUTE, ON_PAUSE, COMPLETED, UNAVAILABLE o ABSENT",
  }),
  reason: z.string().max(500, "Motivo demasiado largo").optional(),
  context: z.string().max(1000, "Contexto demasiado largo").optional(),
  force: z.boolean().default(false).optional(),
});

export const driverStatusHistoryQuerySchema = z.object({
  driverId: z.string().uuid("ID de conductor inválido"),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export const driverStatusByFleetQuerySchema = z.object({
  fleetId: z.string().uuid("ID de flota inválido"),
});

export type DriverStatusTransitionInput = z.infer<
  typeof driverStatusTransitionSchema
>;
export type DriverStatusHistoryQuery = z.infer<
  typeof driverStatusHistoryQuerySchema
>;
export type DriverStatusByFleetQuery = z.infer<
  typeof driverStatusByFleetQuerySchema
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
  driverId: string;
  previousStatus: string;
  newStatus: string;
  message?: string;
  warning?: string;
}
