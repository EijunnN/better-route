/**
 * VROOM Optimizer - Converts our domain model to VROOM format and back
 *
 * This module bridges our application's data model with VROOM's API,
 * falling back to a simple nearest-neighbor algorithm when VROOM is unavailable.
 */

import {
  type Coordinates,
  calculateDistance,
  calculateRouteDistance,
} from "./geospatial";
import {
  createVroomJob,
  createVroomVehicle,
  isVroomAvailable,
  solveVRP,
  type VroomRequest,
  type VroomResponse,
} from "./vroom-client";

// Our domain types
export interface OrderForOptimization {
  id: string;
  trackingId: string;
  address: string;
  latitude: number;
  longitude: number;
  weightRequired: number;
  volumeRequired: number;
  timeWindowStart?: string;
  timeWindowEnd?: string;
  skillsRequired?: string[];
  priority?: number;
  serviceTime?: number; // seconds
}

export interface VehicleForOptimization {
  id: string;
  plate: string;
  maxWeight: number;
  maxVolume: number;
  skills?: string[];
  speedFactor?: number;
}

export interface DepotConfig {
  latitude: number;
  longitude: number;
  timeWindowStart?: string;
  timeWindowEnd?: string;
}

export interface OptimizationConfig {
  depot: DepotConfig;
  objective: "DISTANCE" | "TIME" | "BALANCED";
  maxRoutes?: number;
  balanceFactor?: number;
}

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
  vehiclePlate: string;
  stops: OptimizedStop[];
  totalDistance: number;
  totalDuration: number;
  totalWeight: number;
  totalVolume: number;
  geometry?: string; // Encoded polyline from VROOM/OSRM
}

export interface OptimizationOutput {
  routes: OptimizedRoute[];
  unassigned: Array<{
    orderId: string;
    trackingId: string;
    reason: string;
  }>;
  metrics: {
    totalDistance: number;
    totalDuration: number;
    totalRoutes: number;
    totalStops: number;
    computingTimeMs: number;
  };
  usedVroom: boolean;
}

// Skill mapping for VROOM (skills are numbers)
const skillMap = new Map<string, number>();
let skillCounter = 1;

function getSkillId(skillName: string): number {
  const existingId = skillMap.get(skillName);
  if (existingId !== undefined) {
    return existingId;
  }
  const newId = skillCounter++;
  skillMap.set(skillName, newId);
  return newId;
}

/**
 * Optimize routes using VROOM or fallback to nearest-neighbor
 */
export async function optimizeRoutes(
  orders: OrderForOptimization[],
  vehicles: VehicleForOptimization[],
  config: OptimizationConfig,
): Promise<OptimizationOutput> {
  const startTime = Date.now();

  // Try VROOM first
  const vroomAvailable = await isVroomAvailable();

  if (vroomAvailable) {
    try {
      return await optimizeWithVroom(orders, vehicles, config, startTime);
    } catch (error) {
      console.warn(
        "VROOM optimization failed, falling back to nearest-neighbor:",
        error,
      );
    }
  }

  // Fallback to nearest-neighbor
  return optimizeWithNearestNeighbor(orders, vehicles, config, startTime);
}

/**
 * Optimize using VROOM
 */
async function optimizeWithVroom(
  orders: OrderForOptimization[],
  vehicles: VehicleForOptimization[],
  config: OptimizationConfig,
  startTime: number,
): Promise<OptimizationOutput> {
  // Build order ID to index mapping
  const orderIdToIndex = new Map<number, string>();
  const vehicleIdToIndex = new Map<number, string>();

  // Create VROOM jobs from orders
  const jobs = orders.map((order, index) => {
    const jobId = index + 1;
    orderIdToIndex.set(jobId, order.id);

    // Map skills to numbers
    const skills = order.skillsRequired?.map((s) => getSkillId(s));

    return createVroomJob(jobId, order.longitude, order.latitude, {
      description: order.trackingId,
      service: order.serviceTime || 300, // 5 min default
      delivery: [
        Math.round(order.weightRequired),
        Math.round(order.volumeRequired),
      ],
      skills,
      priority: order.priority,
      timeWindowStart: order.timeWindowStart,
      timeWindowEnd: order.timeWindowEnd,
    });
  });

  // Create VROOM vehicles
  const vroomVehicles = vehicles.map((vehicle, index) => {
    const vehicleId = index + 1;
    vehicleIdToIndex.set(vehicleId, vehicle.id);

    // Map skills to numbers
    const skills = vehicle.skills?.map((s) => getSkillId(s));

    return createVroomVehicle(
      vehicleId,
      config.depot.longitude,
      config.depot.latitude,
      {
        description: vehicle.plate,
        capacity: [
          Math.round(vehicle.maxWeight),
          Math.round(vehicle.maxVolume),
        ],
        skills,
        timeWindowStart: config.depot.timeWindowStart,
        timeWindowEnd: config.depot.timeWindowEnd,
        speedFactor: vehicle.speedFactor,
      },
    );
  });

  // Build VROOM request
  const request: VroomRequest = {
    jobs,
    vehicles: vroomVehicles,
    options: {
      g: true, // Return geometry
    },
  };

  // Call VROOM
  const response = await solveVRP(request);

  // Convert response to our format
  return convertVroomResponse(
    response,
    orders,
    vehicles,
    orderIdToIndex,
    vehicleIdToIndex,
    startTime,
  );
}

/**
 * Convert VROOM response to our domain model
 */
function convertVroomResponse(
  response: VroomResponse,
  orders: OrderForOptimization[],
  vehicles: VehicleForOptimization[],
  orderIdToIndex: Map<number, string>,
  vehicleIdToIndex: Map<number, string>,
  startTime: number,
): OptimizationOutput {
  const orderMap = new Map(orders.map((o) => [o.id, o]));
  const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));

  const routes: OptimizedRoute[] = [];

  for (const vroomRoute of response.routes || []) {
    const vehicleId = vehicleIdToIndex.get(vroomRoute.vehicle);
    if (!vehicleId) continue;

    const vehicle = vehicleMap.get(vehicleId);
    if (!vehicle) continue;

    const stops: OptimizedStop[] = [];
    let totalWeight = 0;
    let totalVolume = 0;
    let sequence = 1;

    for (const step of vroomRoute.steps) {
      if (step.type === "job" && step.job !== undefined) {
        const orderId = orderIdToIndex.get(step.job);
        if (!orderId) continue;

        const order = orderMap.get(orderId);
        if (!order) continue;

        stops.push({
          orderId: order.id,
          trackingId: order.trackingId,
          address: order.address,
          latitude: order.latitude,
          longitude: order.longitude,
          sequence: sequence++,
          arrivalTime: step.arrival,
          serviceTime: step.service,
          waitingTime: step.waiting_time,
        });

        totalWeight += order.weightRequired;
        totalVolume += order.volumeRequired;
      }
    }

    if (stops.length > 0) {
      routes.push({
        vehicleId,
        vehiclePlate: vehicle.plate,
        stops,
        totalDistance: vroomRoute.distance || 0,
        totalDuration: vroomRoute.duration || 0,
        totalWeight,
        totalVolume,
        geometry: vroomRoute.geometry, // Encoded polyline from OSRM
      });
    }
  }

  // Map unassigned
  const unassigned = (response.unassigned || []).map((u) => {
    const orderId = orderIdToIndex.get(u.id);
    const order = orderId ? orderMap.get(orderId) : undefined;
    return {
      orderId: orderId || String(u.id),
      trackingId: order?.trackingId || u.description || "Unknown",
      reason: "No feasible route found",
    };
  });

  const summary = response.summary;

  return {
    routes,
    unassigned,
    metrics: {
      totalDistance:
        summary?.distance ||
        routes.reduce((sum, r) => sum + r.totalDistance, 0),
      totalDuration:
        summary?.duration ||
        routes.reduce((sum, r) => sum + r.totalDuration, 0),
      totalRoutes: routes.length,
      totalStops: routes.reduce((sum, r) => sum + r.stops.length, 0),
      computingTimeMs: Date.now() - startTime,
    },
    usedVroom: true,
  };
}

/**
 * Fallback: Nearest-neighbor algorithm when VROOM is not available
 */
function optimizeWithNearestNeighbor(
  orders: OrderForOptimization[],
  vehicles: VehicleForOptimization[],
  config: OptimizationConfig,
  startTime: number,
): OptimizationOutput {
  const depot: Coordinates = {
    latitude: config.depot.latitude,
    longitude: config.depot.longitude,
  };

  const routes: OptimizedRoute[] = [];
  const assigned = new Set<string>();
  const unassigned: Array<{
    orderId: string;
    trackingId: string;
    reason: string;
  }> = [];

  // Sort vehicles by capacity (largest first)
  const sortedVehicles = [...vehicles].sort(
    (a, b) => b.maxWeight + b.maxVolume - (a.maxWeight + a.maxVolume),
  );

  for (const vehicle of sortedVehicles) {
    const stops: OptimizedStop[] = [];
    let currentWeight = 0;
    let currentVolume = 0;
    let currentLocation = depot;
    let sequence = 1;

    // Filter available orders
    const availableOrders = orders.filter((o) => {
      if (assigned.has(o.id)) return false;

      // Check capacity
      if (currentWeight + o.weightRequired > vehicle.maxWeight) return false;
      if (currentVolume + o.volumeRequired > vehicle.maxVolume) return false;

      // Check skills
      if (o.skillsRequired && o.skillsRequired.length > 0) {
        const vehicleSkills = new Set(vehicle.skills || []);
        if (!o.skillsRequired.every((s) => vehicleSkills.has(s))) return false;
      }

      return true;
    });

    // Nearest neighbor
    while (availableOrders.length > 0) {
      // Find nearest unassigned order
      let nearestIndex = -1;
      let nearestDistance = Number.POSITIVE_INFINITY;

      for (let i = 0; i < availableOrders.length; i++) {
        const order = availableOrders[i];

        // Check capacity
        if (currentWeight + order.weightRequired > vehicle.maxWeight) continue;
        if (currentVolume + order.volumeRequired > vehicle.maxVolume) continue;

        const orderCoords: Coordinates = {
          latitude: order.latitude,
          longitude: order.longitude,
        };

        const distance = calculateDistance(currentLocation, orderCoords);

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = i;
        }
      }

      if (nearestIndex === -1) break;

      const order = availableOrders[nearestIndex];
      availableOrders.splice(nearestIndex, 1);
      assigned.add(order.id);

      stops.push({
        orderId: order.id,
        trackingId: order.trackingId,
        address: order.address,
        latitude: order.latitude,
        longitude: order.longitude,
        sequence: sequence++,
        serviceTime: order.serviceTime || 300,
      });

      currentWeight += order.weightRequired;
      currentVolume += order.volumeRequired;
      currentLocation = {
        latitude: order.latitude,
        longitude: order.longitude,
      };
    }

    if (stops.length > 0) {
      // Calculate route distance
      const routeCoords = [
        depot,
        ...stops.map((s) => ({ latitude: s.latitude, longitude: s.longitude })),
        depot,
      ];
      const routeResult = calculateRouteDistance(routeCoords);

      routes.push({
        vehicleId: vehicle.id,
        vehiclePlate: vehicle.plate,
        stops,
        totalDistance: routeResult.distanceMeters,
        totalDuration: routeResult.durationSeconds,
        totalWeight: currentWeight,
        totalVolume: currentVolume,
      });
    }
  }

  // Mark remaining orders as unassigned
  for (const order of orders) {
    if (!assigned.has(order.id)) {
      unassigned.push({
        orderId: order.id,
        trackingId: order.trackingId,
        reason: "No vehicle with sufficient capacity or skills",
      });
    }
  }

  return {
    routes,
    unassigned,
    metrics: {
      totalDistance: routes.reduce((sum, r) => sum + r.totalDistance, 0),
      totalDuration: routes.reduce((sum, r) => sum + r.totalDuration, 0),
      totalRoutes: routes.length,
      totalStops: routes.reduce((sum, r) => sum + r.stops.length, 0),
      computingTimeMs: Date.now() - startTime,
    },
    usedVroom: false,
  };
}
