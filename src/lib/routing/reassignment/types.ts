/**
 * Reassignment strategy options
 */
export type ReassignmentStrategy =
  | "SAME_FLEET" // Only consider drivers from same fleet
  | "ANY_FLEET" // Consider any available driver
  | "BALANCED_WORKLOAD" // Distribute stops to minimize workload impact
  | "CONSOLIDATE"; // Assign all stops to single driver if possible

/**
 * Reassignment impact metrics
 */
export interface ReassignmentImpact {
  replacementDriverId: string;
  replacementDriverName: string;
  stopsCount: number;
  additionalDistance: {
    absolute: number; // meters
    percentage: number; // percentage increase over current route distance
  };
  additionalTime: {
    absolute: number; // seconds
    percentage: number; // percentage increase over current route time
    formatted: string; // human readable (e.g., "1h 30m")
  };
  compromisedWindows: {
    count: number; // count of time windows that may be missed
    percentage: number; // percentage of stops with compromised windows
  };
  capacityUtilization: {
    current: number; // percentage of current driver's capacity
    projected: number; // percentage after reassignment
    available: number; // remaining capacity percentage
  };
  skillsMatch: {
    percentage: number; // percentage of skills matched
    missing: string[]; // list of missing skill names
  };
  availabilityStatus: {
    isAvailable: boolean;
    currentStops: number;
    maxCapacity: number;
    canAbsorbStops: boolean;
  };
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Reassignment option
 */
export interface ReassignmentOption {
  optionId: string;
  replacementDriver: {
    id: string;
    name: string;
    fleetId: string | null;
    fleetName: string;
    priority: number; // 1 = same fleet, 2 = others
  };
  impact: ReassignmentImpact;
  strategy: ReassignmentStrategy;
  routeIds: string[];
}

/**
 * Affected route information for reassignment
 */
export interface AffectedRoute {
  routeId: string;
  vehicleId: string;
  vehiclePlate: string;
  stops: Array<{
    id: string;
    orderId: string;
    sequence: number;
    address: string;
    latitude: string;
    longitude: string;
    status: string;
    timeWindowStart: Date | null;
    timeWindowEnd: Date | null;
    estimatedArrival: Date | null;
  }>;
  totalStops: number;
  pendingStops: number;
  inProgressStops: number;
}

/**
 * Execute reassignment with transaction support and atomic operations
 *
 * Story 11.3: Ejecución y Registro de Reasignaciones
 * - Atomic execution with rollback in case of error
 * - Complete audit logging
 * - History record creation
 */
export interface ExecuteReassignmentResult {
  success: boolean;
  reassignedStops: number;
  reassignedRoutes: number;
  reassignmentHistoryId?: string;
  errors: string[];
  warnings?: string[];
}

export interface ReassignmentOperation {
  routeId: string;
  vehicleId: string;
  toDriverId: string;
  toDriverName: string;
  stopIds: string[];
  stopIdsBeforeUpdate: Array<{ id: string; driverId: string; status: string }>;
}

/**
 * Get reassignment history for a company
 */
export interface ReassignmentHistoryEntry {
  id: string;
  absentDriverId: string;
  absentDriverName: string;
  replacementDrivers: Array<{
    id: string;
    name: string;
    stopsAssigned: number;
  }>;
  routeIds: string[];
  reason: string;
  createdAt: Date;
  createdBy: string;
}
