/**
 * PyVRP Adapter - Placeholder for future PyVRP integration
 *
 * PyVRP is a high-quality VRP solver that produces excellent solutions
 * but requires more computation time. This adapter will connect to a
 * Python microservice running PyVRP when implemented.
 *
 * Integration Requirements:
 * 1. Python microservice with FastAPI
 * 2. Endpoint /solve accepting our common format
 * 3. Async job processing for long-running optimizations
 * 4. Docker container for deployment
 */

import type {
  IOptimizer,
  OptimizerCapabilities,
  OptimizerConfig,
  OptimizerOrder,
  OptimizerVehicle,
  OptimizationResult,
} from "./optimizer-interface";

// Configuration for PyVRP service
interface PyVRPServiceConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs: number;
}

const DEFAULT_CONFIG: PyVRPServiceConfig = {
  baseUrl: process.env.PYVRP_SERVICE_URL || "http://localhost:8000",
  apiKey: process.env.PYVRP_API_KEY,
  timeoutMs: 300000, // 5 minutes default
};

export class PyVRPAdapter implements IOptimizer {
  readonly name = "PYVRP";
  readonly displayName = "Optimización Avanzada";

  private config: PyVRPServiceConfig;

  constructor(config?: Partial<PyVRPServiceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async isAvailable(): Promise<boolean> {
    // Check if PyVRP service is running
    try {
      const response = await fetch(`${this.config.baseUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async optimize(
    orders: OptimizerOrder[],
    vehicles: OptimizerVehicle[],
    config: OptimizerConfig,
  ): Promise<OptimizationResult> {
    // Check if service is available
    const available = await this.isAvailable();
    if (!available) {
      throw new Error(
        "PyVRP service is not available. Please ensure the service is running.",
      );
    }

    const startTime = Date.now();

    // Build request payload
    const payload = {
      orders: orders.map((o) => ({
        id: o.id,
        tracking_id: o.trackingId,
        address: o.address,
        lat: o.latitude,
        lng: o.longitude,
        weight: o.weightRequired,
        volume: o.volumeRequired,
        value: o.orderValue,
        units: o.unitsRequired,
        order_type: o.orderType,
        priority: o.priority,
        time_window_start: o.timeWindowStart,
        time_window_end: o.timeWindowEnd,
        service_time: o.serviceTime,
        skills: o.skillsRequired,
      })),
      vehicles: vehicles.map((v) => ({
        id: v.id,
        identifier: v.identifier,
        max_weight: v.maxWeight,
        max_volume: v.maxVolume,
        max_value: v.maxValueCapacity,
        max_units: v.maxUnitsCapacity,
        max_orders: v.maxOrders,
        origin_lat: v.originLatitude,
        origin_lng: v.originLongitude,
        skills: v.skills,
        speed_factor: v.speedFactor,
      })),
      config: {
        depot: {
          lat: config.depot.latitude,
          lng: config.depot.longitude,
          time_window_start: config.depot.timeWindowStart,
          time_window_end: config.depot.timeWindowEnd,
        },
        objective: config.objective,
        balance_visits: config.balanceVisits,
        max_distance_km: config.maxDistanceKm,
        max_travel_time_minutes: config.maxTravelTimeMinutes,
        route_end_mode: config.routeEndMode,
        minimize_vehicles: config.minimizeVehicles,
        max_routes: config.maxRoutes,
        // PyVRP specific options
        timeout_seconds: Math.floor((config.timeoutMs || this.config.timeoutMs) / 1000),
      },
    };

    // Submit optimization job
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(`${this.config.baseUrl}/solve`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(config.timeoutMs || this.config.timeoutMs),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`PyVRP optimization failed: ${error}`);
    }

    const result = await response.json();

    // Convert PyVRP response to common format
    return {
      routes: result.routes.map((r: PyVRPRoute) => ({
        vehicleId: r.vehicle_id,
        vehicleIdentifier: r.vehicle_identifier,
        stops: r.stops.map((s: PyVRPStop) => ({
          orderId: s.order_id,
          trackingId: s.tracking_id,
          address: s.address,
          latitude: s.lat,
          longitude: s.lng,
          sequence: s.sequence,
          arrivalTime: s.arrival_time,
          serviceTime: s.service_time,
          waitingTime: s.waiting_time,
        })),
        totalDistance: r.total_distance,
        totalDuration: r.total_duration,
        totalServiceTime: r.total_service_time,
        totalTravelTime: r.total_travel_time,
        totalWeight: r.total_weight,
        totalVolume: r.total_volume,
        geometry: r.geometry,
      })),
      unassigned: result.unassigned.map((u: PyVRPUnassigned) => ({
        orderId: u.order_id,
        trackingId: u.tracking_id,
        reason: u.reason,
      })),
      metrics: {
        totalDistance: result.metrics.total_distance,
        totalDuration: result.metrics.total_duration,
        totalRoutes: result.metrics.total_routes,
        totalStops: result.metrics.total_stops,
        computingTimeMs: Date.now() - startTime,
        balanceScore: result.metrics.balance_score,
      },
      optimizer: this.name,
    };
  }

  estimateTime(orderCount: number, vehicleCount: number): number {
    // PyVRP is slower but produces better solutions
    // Rough estimate: scales with problem complexity
    const baseTime = 5000; // 5 second base
    const orderFactor = Math.pow(orderCount, 1.5) * 10; // superlinear scaling
    const vehicleFactor = vehicleCount * 500;
    return Math.min(baseTime + orderFactor + vehicleFactor, 300000); // cap at 5 minutes
  }

  getCapabilities(): OptimizerCapabilities {
    return {
      supportsTimeWindows: true,
      supportsSkills: true,
      supportsMultiDimensionalCapacity: true,
      supportsPriorities: true,
      supportsBalancing: true,
      maxOrders: -1, // unlimited (but slow)
      maxVehicles: -1, // unlimited
      typicalSpeed: "slow",
      qualityLevel: "excellent",
    };
  }
}

// Types for PyVRP response (snake_case from Python)
interface PyVRPRoute {
  vehicle_id: string;
  vehicle_identifier: string;
  stops: PyVRPStop[];
  total_distance: number;
  total_duration: number;
  total_service_time: number;
  total_travel_time: number;
  total_weight: number;
  total_volume: number;
  geometry?: string;
}

interface PyVRPStop {
  order_id: string;
  tracking_id: string;
  address: string;
  lat: number;
  lng: number;
  sequence: number;
  arrival_time?: number;
  service_time?: number;
  waiting_time?: number;
}

interface PyVRPUnassigned {
  order_id: string;
  tracking_id: string;
  reason: string;
}

// Export singleton instance
export const pyvrpAdapter = new PyVRPAdapter();
