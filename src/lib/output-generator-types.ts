import type { OUTPUT_FORMAT } from "@/db/schema";

/**
 * Driver route output interface
 */
export interface DriverRouteOutput {
  driverId: string;
  driverName: string;
  driverIdentification: string | null;
  driverPhone: string | null;
  vehicleId: string;
  vehiclePlate: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  stops: RouteStopOutput[];
  totalStops: number;
  pendingStops: number;
  inProgressStops: number;
  completedStops: number;
  failedStops: number;
}

/**
 * Individual route stop output
 */
export interface RouteStopOutput {
  sequence: number;
  orderId: string;
  trackingId: string;
  customerName: string | null;
  customerPhone: string | null;
  address: string;
  latitude: string;
  longitude: string;
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
  estimatedArrival: string | null;
  estimatedServiceTime: number | null;
  status: string;
  notes: string | null;
  customerNotes: string | null;
}

/**
 * Complete plan output structure
 */
export interface PlanOutput {
  outputId: string;
  jobId: string;
  jobName: string;
  configurationId: string;
  configurationName: string;
  generatedAt: string;
  generatedBy: string;
  format: keyof typeof OUTPUT_FORMAT;
  driverRoutes: DriverRouteOutput[];
  summary: PlanOutputSummary;
}

/**
 * Summary metrics for plan output
 */
export interface PlanOutputSummary {
  totalRoutes: number;
  totalStops: number;
  pendingStops: number;
  inProgressStops: number;
  completedStops: number;
  failedStops: number;
  uniqueDrivers: number;
  uniqueVehicles: number;
}
