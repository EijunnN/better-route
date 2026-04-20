// Optimization result types
export interface OptimizationStop {
  orderId: string;
  trackingId: string;
  sequence: number;
  address: string;
  latitude: string;
  longitude: string;
  estimatedArrival?: string;
  waitingTimeMinutes?: number; // Minutes the driver waits before time window opens
  timeWindow?: {
    start: string;
    end: string;
  };
  // For grouped stops (multiple orders at same location)
  groupedOrderIds?: string[];
  groupedTrackingIds?: string[];
}

export interface OptimizationRoute {
  routeId: string;
  vehicleId: string;
  vehiclePlate: string;
  driverId?: string;
  driverName?: string;
  driverOrigin?: {
    latitude: string;
    longitude: string;
    address?: string;
  };
  // Zone this route was computed within. Undefined means the no-zones path
  // ran (or the "unzoned" bucket in the zone-aware path) — in both cases
  // the stop is not linked to any zone and should not get a zoneId at save.
  zoneId?: string;
  stops: OptimizationStop[];
  totalDistance: number;
  totalDuration: number; // Total time (travel + service + waiting)
  totalServiceTime: number; // Time spent at stops (service)
  totalTravelTime: number; // Time spent traveling between stops
  totalWeight: number;
  totalVolume: number;
  utilizationPercentage: number;
  timeWindowViolations: number;
  geometry?: string; // Encoded polyline from VROOM/OSRM
  assignmentQuality?: {
    score: number;
    warnings: string[];
    errors: string[];
  };
}

/**
 * Output of the constraint verifier — attached to every completed job so the
 * UI and consumers can see which constraints the solver respected vs. violated.
 * Keep this shape stable; it's persisted in optimizationJobs.result (jsonb).
 */
export interface OptimizationVerification {
  optimizer: string;
  summary: {
    hard: number;
    soft: number;
    info: number;
    byCode: Record<string, number>;
  };
  totals: {
    ordersInput: number;
    ordersAssigned: number;
    ordersUnassigned: number;
    routes: number;
  };
  violations: Array<{
    code: string;
    severity: "HARD" | "SOFT" | "INFO";
    message: string;
    vehicleId?: string;
    vehicleIdentifier?: string;
    orderId?: string;
    trackingId?: string;
    stopSequence?: number;
    expected?: string | number;
    actual?: string | number;
  }>;
}

export interface OptimizationResult {
  routes: OptimizationRoute[];
  unassignedOrders: Array<{
    orderId: string;
    trackingId: string;
    reason: string;
    latitude?: string;
    longitude?: string;
    address?: string;
  }>;
  driversWithoutRoutes?: Array<{
    id: string;
    name: string;
    originLatitude?: string;
    originLongitude?: string;
  }>;
  vehiclesWithoutRoutes?: Array<{
    id: string;
    plate: string;
    originLatitude?: string;
    originLongitude?: string;
  }>;
  metrics: {
    totalDistance: number;
    totalDuration: number;
    totalRoutes: number;
    totalStops: number;
    utilizationRate: number;
    timeWindowComplianceRate: number;
  };
  assignmentMetrics?: {
    totalAssignments: number;
    assignmentsWithWarnings: number;
    assignmentsWithErrors: number;
    averageScore: number;
    skillCoverage: number;
    licenseCompliance: number;
    fleetAlignment: number;
    workloadBalance: number;
  };
  warnings?: string[];
  summary: {
    optimizedAt: string;
    objective: string;
    processingTimeMs: number;
    engineUsed?: string;
  };
  depot?: {
    latitude: number;
    longitude: number;
  };
  verification?: OptimizationVerification;
}

export interface OptimizationInput {
  configurationId: string;
  companyId: string;
  vehicleIds: string[];
  driverIds: string[];
}

// Global state for partial optimization results during cancellation
declare global {
  // eslint-disable-next-line no-var
  var __partialOptimizationResult: OptimizationResult | undefined;
}
