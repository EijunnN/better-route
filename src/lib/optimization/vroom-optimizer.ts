/**
 * VROOM Optimizer - Converts our domain model to VROOM format and back
 *
 * This module bridges our application's data model with VROOM's API,
 * falling back to a simple nearest-neighbor algorithm when VROOM is unavailable.
 *
 * Supports dynamic capacity dimensions via company optimization profiles.
 */

import {
  type Coordinates,
  calculateDistance,
  calculateRouteDistance,
} from "../geo/geospatial";
import {
  createVroomJob,
  createVroomVehicle,
  isVroomAvailable,
  solveVRP,
  type VroomRequest,
  type VroomResponse,
} from "./vroom-client";
import {
  calculateBalancedMaxOrders,
  getBalanceScore,
  redistributeOrders,
  type BalanceableRoute,
  type BalanceableStop,
} from "./balance-utils";
import {
  type CompanyOptimizationProfile,
  DEFAULT_PROFILE,
  mapOrderCapacities,
  mapVehicleCapacities,
  getDimensionInfo,
} from "./capacity-mapper";

// Our domain types
export interface OrderForOptimization {
  id: string;
  trackingId: string;
  address: string;
  latitude: number;
  longitude: number;
  weightRequired: number;
  volumeRequired: number;
  // New fields for multi-company support
  orderValue?: number; // Value in cents
  unitsRequired?: number; // Number of units
  orderType?: "NEW" | "RESCHEDULED" | "URGENT";
  timeWindowStart?: string;
  timeWindowEnd?: string;
  skillsRequired?: string[];
  priority?: number;
  serviceTime?: number; // seconds
  zoneId?: string; // Zone this order belongs to (for zone-aware optimization)
}

export interface VehicleForOptimization {
  id: string;
  plate: string;
  maxWeight: number;
  maxVolume: number;
  // New capacity fields for multi-company support
  maxValueCapacity?: number; // Maximum value capacity
  maxUnitsCapacity?: number; // Maximum units capacity
  maxOrders?: number; // Maximum number of orders per vehicle
  originLatitude?: number; // Vehicle's starting location
  originLongitude?: number;
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
  // Company-specific optimization profile (optional, defaults to weight+volume)
  profile?: CompanyOptimizationProfile;
  // New options for balancing and limits
  balanceVisits?: boolean; // Enable post-optimization balancing
  maxDistanceKm?: number; // Maximum distance per route (km)
  maxTravelTimeMinutes?: number; // Maximum travel time per route (minutes)
  trafficFactor?: number; // Traffic factor 0-100 (affects speed)
  // Route end configuration
  routeEndMode?: "DRIVER_ORIGIN" | "SPECIFIC_DEPOT" | "OPEN_END";
  endDepot?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  // Additional preset options
  openStart?: boolean; // Vehicles can start from anywhere (no fixed start)
  minimizeVehicles?: boolean; // Use minimum number of vehicles
  flexibleTimeWindows?: boolean; // Add tolerance to time windows
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
  totalDuration: number; // Total time (travel + service + waiting)
  totalServiceTime: number; // Time spent at stops
  totalTravelTime: number; // Time spent traveling
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
    balanceScore?: number; // 0-100, higher is better distribution
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
  // Validate inputs
  if (orders.length === 0) {
    console.warn("[VROOM] No orders to optimize, returning empty result");
    return {
      routes: [],
      unassigned: [],
      metrics: {
        totalDistance: 0,
        totalDuration: 0,
        totalRoutes: 0,
        totalStops: 0,
        computingTimeMs: Date.now() - startTime,
      },
      usedVroom: false,
    };
  }

  if (vehicles.length === 0) {
    console.warn("[VROOM] No vehicles available, returning all orders as unassigned");
    return {
      routes: [],
      unassigned: orders.map((o) => ({
        orderId: o.id,
        trackingId: o.trackingId,
        reason: "No hay vehículos disponibles",
      })),
      metrics: {
        totalDistance: 0,
        totalDuration: 0,
        totalRoutes: 0,
        totalStops: 0,
        computingTimeMs: Date.now() - startTime,
      },
      usedVroom: false,
    };
  }

  // Build order ID to index mapping
  const orderIdToIndex = new Map<number, string>();
  const vehicleIdToIndex = new Map<number, string>();

  // Get optimization profile (use default if not specified)
  let profile = config.profile || DEFAULT_PROFILE;

  // Safeguard: If no active dimensions, fall back to default profile
  if (!profile.activeDimensions || profile.activeDimensions.length === 0) {
    console.warn("[VROOM] Profile has no active dimensions, falling back to default (WEIGHT, VOLUME)");
    profile = DEFAULT_PROFILE;
  }

  console.log(`[VROOM] Using profile: ${getDimensionInfo(profile)}`);
  console.log(`[VROOM] Active dimensions: ${profile.activeDimensions.join(", ")}`);
  console.log(`[VROOM] Orders: ${orders.length}, Vehicles: ${vehicles.length}`);

  // Calculate balanced maxOrders if balancing is enabled (pre-balancing)
  const balancedMaxOrders = config.balanceVisits
    ? calculateBalancedMaxOrders(orders.length, vehicles.length, 50)
    : undefined;

  // Helper function to adjust time windows for flexibility
  const adjustTimeWindow = (
    time: string | undefined,
    adjustMinutes: number,
  ): string | undefined => {
    if (!time) return undefined;
    const date = new Date(`1970-01-01T${time}`);
    date.setMinutes(date.getMinutes() + adjustMinutes);
    return date.toTimeString().slice(0, 5);
  };

  // Time window tolerance in minutes when flexibleTimeWindows is enabled
  const timeWindowTolerance = config.flexibleTimeWindows ? 30 : 0;

  // Create VROOM jobs from orders
  const jobs = orders.map((order, index) => {
    const jobId = index + 1;
    orderIdToIndex.set(jobId, order.id);

    // Map skills to numbers
    const skills = order.skillsRequired?.map((s) => getSkillId(s));

    // Apply time window tolerance if flexible time windows is enabled
    const adjustedTimeWindowStart = config.flexibleTimeWindows
      ? adjustTimeWindow(order.timeWindowStart, -timeWindowTolerance)
      : order.timeWindowStart;
    const adjustedTimeWindowEnd = config.flexibleTimeWindows
      ? adjustTimeWindow(order.timeWindowEnd, timeWindowTolerance)
      : order.timeWindowEnd;

    // Map order capacities dynamically based on profile
    const capacityMapping = mapOrderCapacities(
      {
        weightRequired: order.weightRequired,
        volumeRequired: order.volumeRequired,
        orderValue: order.orderValue,
        unitsRequired: order.unitsRequired,
        orderType: order.orderType,
        priority: order.priority,
      },
      profile,
    );

    // Log first few orders for debugging
    if (index < 3) {
      console.log(`[VROOM] Order ${jobId}: trackingId=${order.trackingId}, ` +
        `coords=[${order.longitude}, ${order.latitude}], ` +
        `orderValue=${order.orderValue}, unitsRequired=${order.unitsRequired}, ` +
        `delivery=${JSON.stringify(capacityMapping.capacityArray)}`);
    }

    return createVroomJob(jobId, order.longitude, order.latitude, {
      description: order.trackingId,
      service: order.serviceTime || 300, // 5 min default
      delivery: capacityMapping.capacityArray,
      skills,
      priority: capacityMapping.priority ?? order.priority,
      timeWindowStart: adjustedTimeWindowStart,
      timeWindowEnd: adjustedTimeWindowEnd,
    });
  });

  // Calculate speed factor from traffic factor (0-100 -> 0.5-1.5)
  const speedFactor =
    config.trafficFactor !== undefined
      ? 1.5 - config.trafficFactor / 100 // 0 traffic = 1.5x speed, 100 traffic = 0.5x speed
      : undefined;

  // Calculate max travel time in seconds
  // Can come from maxTravelTimeMinutes directly, or estimated from maxDistanceKm
  let maxTravelTime = config.maxTravelTimeMinutes
    ? config.maxTravelTimeMinutes * 60
    : undefined;

  // If maxDistanceKm is set but no maxTravelTime, estimate based on average speed
  // Assume average 35 km/h in urban areas (accounting for stops, traffic, etc.)
  const AVERAGE_SPEED_KMH = 35;
  if (!maxTravelTime && config.maxDistanceKm) {
    // Convert distance to time: time = distance / speed
    // Add 20% buffer for service times and variability
    const estimatedTimeHours = (config.maxDistanceKm / AVERAGE_SPEED_KMH) * 1.2;
    maxTravelTime = Math.round(estimatedTimeHours * 3600); // Convert to seconds
    console.log(
      `Max distance ${config.maxDistanceKm}km -> estimated max travel time: ${Math.round(estimatedTimeHours * 60)} minutes`,
    );
  }

  // Calculate minimum vehicles needed if minimizeVehicles is enabled
  // Use actual capacity constraints instead of hardcoded assumptions
  let vehiclesToUse = vehicles;
  if (config.minimizeVehicles && vehicles.length > 1) {
    const totalWeight = orders.reduce((s, o) => s + o.weightRequired, 0);
    const totalVolume = orders.reduce((s, o) => s + o.volumeRequired, 0);
    const totalOrders = orders.length;

    const avgMaxWeight = vehicles.reduce((s, v) => s + v.maxWeight, 0) / vehicles.length;
    const avgMaxVolume = vehicles.reduce((s, v) => s + v.maxVolume, 0) / vehicles.length;
    const avgMaxOrders = vehicles.reduce((s, v) => s + (v.maxOrders ?? 50), 0) / vehicles.length;

    const minByWeight = avgMaxWeight > 0 ? Math.ceil(totalWeight / avgMaxWeight) : 1;
    const minByVolume = avgMaxVolume > 0 ? Math.ceil(totalVolume / avgMaxVolume) : 1;
    const minByOrders = Math.ceil(totalOrders / avgMaxOrders);

    // Take the most restrictive constraint + 1 safety margin for skills/time windows
    const minVehiclesNeeded = Math.min(
      vehicles.length,
      Math.max(minByWeight, minByVolume, minByOrders, 1) + 1,
    );

    vehiclesToUse = vehicles.slice(0, minVehiclesNeeded);
    console.log(
      `[VROOM] minimizeVehicles: need≥${Math.max(minByWeight, minByVolume, minByOrders)} ` +
      `(weight=${minByWeight}, volume=${minByVolume}, orders=${minByOrders}), using ${vehiclesToUse.length}/${vehicles.length}`,
    );
  }

  // Create VROOM vehicles
  const vroomVehicles = vehiclesToUse.map((vehicle, index) => {
    const vehicleId = index + 1;
    vehicleIdToIndex.set(vehicleId, vehicle.id);

    // Map skills to numbers
    const skills = vehicle.skills?.map((s) => getSkillId(s));

    // Use vehicle's individual origin if available, otherwise use depot
    const startLongitude = vehicle.originLongitude ?? config.depot.longitude;
    const startLatitude = vehicle.originLatitude ?? config.depot.latitude;

    // Use balanced maxOrders if balancing is enabled, otherwise use vehicle's limit
    const effectiveMaxOrders = balancedMaxOrders ?? vehicle.maxOrders ?? 50;

    // Apply vehicle's speed factor or global traffic-based factor
    const effectiveSpeedFactor = vehicle.speedFactor ?? speedFactor;

    // Determine end location based on routeEndMode
    let endLongitude: number | undefined;
    let endLatitude: number | undefined;
    let openEnd = false;

    const routeEndMode = config.routeEndMode || "DRIVER_ORIGIN";

    if (routeEndMode === "DRIVER_ORIGIN") {
      // Return to vehicle's start location
      endLongitude = startLongitude;
      endLatitude = startLatitude;
    } else if (routeEndMode === "SPECIFIC_DEPOT") {
      // Return to specific depot
      endLongitude = config.endDepot?.longitude ?? config.depot.longitude;
      endLatitude = config.endDepot?.latitude ?? config.depot.latitude;
    } else if (routeEndMode === "OPEN_END") {
      // Route ends at last stop
      openEnd = true;
    }

    // Map vehicle capacities dynamically based on profile
    const capacityMapping = mapVehicleCapacities(
      {
        weightCapacity: vehicle.maxWeight,
        volumeCapacity: vehicle.maxVolume,
        maxValueCapacity: vehicle.maxValueCapacity,
        maxUnitsCapacity: vehicle.maxUnitsCapacity,
      },
      profile,
    );

    // Log first few vehicles for debugging
    if (index < 3) {
      console.log(`[VROOM] Vehicle ${vehicleId}: plate=${vehicle.plate}, ` +
        `maxValueCapacity=${vehicle.maxValueCapacity}, maxUnitsCapacity=${vehicle.maxUnitsCapacity}, ` +
        `capacity=${JSON.stringify(capacityMapping.capacityArray)}`);
    }

    return createVroomVehicle(
      vehicleId,
      config.openStart ? undefined : startLongitude,
      config.openStart ? undefined : startLatitude,
      {
        description: vehicle.plate,
        capacity: capacityMapping.capacityArray,
        skills,
        timeWindowStart: config.depot.timeWindowStart,
        timeWindowEnd: config.depot.timeWindowEnd,
        speedFactor: effectiveSpeedFactor,
        maxTasks: effectiveMaxOrders,
        maxTravelTime, // Maximum travel time per route
        endLongitude,
        endLatitude,
        openStart: config.openStart,
        openEnd,
      },
    );
  });

  // Map our objective to VROOM objectives
  // DISTANCE -> min-cost (minimize distance/cost)
  // TIME -> min-duration (minimize total time)
  // BALANCED -> both with equal weight
  const vroomObjectives = (() => {
    switch (config.objective) {
      case "DISTANCE":
        return [{ type: "min-cost" as const, weight: 1 }];
      case "TIME":
        return [{ type: "min-duration" as const, weight: 1 }];
      case "BALANCED":
      default:
        // Equal weight for both cost and duration
        return [
          { type: "min-cost" as const, weight: 1 },
          { type: "min-duration" as const, weight: 1 },
        ];
    }
  })();

  console.log(
    `[VROOM] Optimization objective: ${config.objective} -> ${JSON.stringify(vroomObjectives)}`,
  );

  // Build VROOM request
  const request: VroomRequest = {
    jobs,
    vehicles: vroomVehicles,
    options: {
      g: true, // Return geometry
    },
    objectives: vroomObjectives,
  };

  // Debug: Log request summary
  console.log(`[VROOM] Request: ${jobs.length} jobs, ${vroomVehicles.length} vehicles`);
  if (jobs.length > 0) {
    const sampleJob = jobs[0];
    console.log(`[VROOM] Sample job: id=${sampleJob.id}, location=[${sampleJob.location}], delivery=${JSON.stringify(sampleJob.delivery)}`);
  }
  if (vroomVehicles.length > 0) {
    const sampleVehicle = vroomVehicles[0];
    console.log(`[VROOM] Sample vehicle: id=${sampleVehicle.id}, capacity=${JSON.stringify(sampleVehicle.capacity)}`);
  }

  // Validate jobs have valid coordinates
  for (const job of jobs) {
    if (!job.location || isNaN(job.location[0]) || isNaN(job.location[1])) {
      console.error(`[VROOM] Invalid job coordinates: id=${job.id}, location=${JSON.stringify(job.location)}`);
      throw new Error(`Job ${job.id} has invalid coordinates: ${JSON.stringify(job.location)}`);
    }
  }

  // Validate capacity array dimensions match between jobs and vehicles
  if (jobs.length > 0 && vroomVehicles.length > 0) {
    const jobDeliveryLength = jobs[0].delivery?.length || 0;
    const vehicleCapacityLength = vroomVehicles[0].capacity?.length || 0;
    if (jobDeliveryLength !== vehicleCapacityLength) {
      console.error(`[VROOM] Capacity dimension mismatch: jobs have ${jobDeliveryLength} dimensions, vehicles have ${vehicleCapacityLength}`);
      console.error(`[VROOM] Profile dimensions: ${profile.activeDimensions.join(", ")}`);
      throw new Error(`Capacity dimension mismatch: jobs=${jobDeliveryLength}, vehicles=${vehicleCapacityLength}`);
    }
    console.log(`[VROOM] Capacity dimensions validated: ${jobDeliveryLength} dimensions (${profile.activeDimensions.join(", ")})`);
  }

  // Call VROOM
  const response = await solveVRP(request);

  // Convert response to our format
  const result = convertVroomResponse(
    response,
    orders,
    vehicles,
    orderIdToIndex,
    vehicleIdToIndex,
    startTime,
  );

  // Apply post-optimization balancing if enabled and initial score is low
  if (config.balanceVisits && result.routes.length > 1) {
    const initialScore = result.metrics.balanceScore || 0;

    // Only rebalance if there's room for improvement (score < 80)
    if (initialScore < 80) {
      const balanceableRoutes: BalanceableRoute[] = result.routes.map((r) => ({
        vehicleId: r.vehicleId,
        vehiclePlate: r.vehiclePlate,
        stops: r.stops.map((s) => {
          const order = orders.find((o) => o.id === s.orderId);
          return {
            orderId: s.orderId,
            trackingId: s.trackingId,
            address: s.address,
            latitude: s.latitude,
            longitude: s.longitude,
            weight: order?.weightRequired || 0,
            volume: order?.volumeRequired || 0,
            sequence: s.sequence,
          };
        }),
        totalWeight: r.totalWeight,
        totalVolume: r.totalVolume,
        maxWeight:
          vehicles.find((v) => v.id === r.vehicleId)?.maxWeight ?? 10000,
        maxVolume: vehicles.find((v) => v.id === r.vehicleId)?.maxVolume ?? 100,
        maxOrders: vehicles.find((v) => v.id === r.vehicleId)?.maxOrders ?? 50,
      }));

      const balanceResult = redistributeOrders(balanceableRoutes, {
        enabled: true,
        maxDeviation: 20,
        preserveSequence: false,
      });

      // Only apply if improvement is significant
      if (balanceResult.newScore > initialScore + 5) {
        console.log(
          `Balance improved from ${initialScore} to ${balanceResult.newScore} (moved ${balanceResult.movedOrders} orders)`,
        );

        // Update routes with balanced results
        for (const balancedRoute of balanceResult.routes) {
          const originalRoute = result.routes.find(
            (r) => r.vehicleId === balancedRoute.vehicleId,
          );
          if (originalRoute) {
            originalRoute.stops = balancedRoute.stops.map((s) => ({
              orderId: s.orderId,
              trackingId: s.trackingId,
              address: s.address,
              latitude: s.latitude,
              longitude: s.longitude,
              sequence: s.sequence,
            }));
            originalRoute.totalWeight = balancedRoute.totalWeight;
            originalRoute.totalVolume = balancedRoute.totalVolume;
          }
        }

        // Update balance score
        result.metrics.balanceScore = balanceResult.newScore;
      }
    }
  }

  // Enforce max distance: trim stops from routes that exceed the limit
  if (config.maxDistanceKm) {
    const maxDistanceMeters = config.maxDistanceKm * 1000;

    for (const route of result.routes) {
      if (route.totalDistance > maxDistanceMeters) {
        console.warn(
          `[VROOM] Route ${route.vehiclePlate} exceeds max distance: ${(route.totalDistance / 1000).toFixed(1)}km > ${config.maxDistanceKm}km — trimming`,
        );

        // Remove stops from the end until route distance is within limit
        // Estimate distance per stop as totalDistance / (stops + 1 return leg)
        while (route.stops.length > 1 && route.totalDistance > maxDistanceMeters) {
          const removed = route.stops.pop()!;
          const order = orders.find((o) => o.id === removed.orderId);
          // Approximate: reduce distance proportionally
          const avgLegDist = route.totalDistance / (route.stops.length + 2); // +2 for start+end legs
          route.totalDistance -= avgLegDist;
          route.totalTravelTime -= avgLegDist / 8.33; // ~30 km/h
          route.totalServiceTime -= (removed.serviceTime || 300);
          route.totalDuration = route.totalTravelTime + route.totalServiceTime;
          route.totalWeight -= order?.weightRequired || 0;
          route.totalVolume -= order?.volumeRequired || 0;
          result.unassigned.push({
            orderId: removed.orderId,
            trackingId: removed.trackingId,
            reason: `Ruta excede distancia máxima de ${config.maxDistanceKm}km`,
          });
        }

        // Reindex remaining stops
        route.stops.forEach((s, i) => { s.sequence = i + 1; });

        // Update metrics
        result.metrics.totalStops = result.routes.reduce((s, r) => s + r.stops.length, 0);
        result.metrics.totalDistance = result.routes.reduce((s, r) => s + r.totalDistance, 0);
        result.metrics.totalDuration = result.routes.reduce((s, r) => s + r.totalDuration, 0);
      }
    }
  }

  return result;
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
      // VROOM returns:
      // - duration: travel time only (NOT including service)
      // - service: total service time at stops
      // - waiting_time: time spent waiting for time windows
      const vroomDuration = vroomRoute.duration || 0; // This is travel time
      const totalServiceTime = vroomRoute.service || 0;
      const waitingTime = vroomRoute.waiting_time || 0;

      // Total duration = travel + service + waiting
      const totalTravelTime = vroomDuration;
      const totalDuration = totalTravelTime + totalServiceTime + waitingTime;

      console.log(
        `[VROOM Route ${vehicle.plate}] VROOM duration: ${vroomDuration}s, service: ${totalServiceTime}s, waiting: ${waitingTime}s -> travel: ${totalTravelTime}s, total: ${totalDuration}s`,
      );

      routes.push({
        vehicleId,
        vehiclePlate: vehicle.plate,
        stops,
        totalDistance: vroomRoute.distance || 0,
        totalDuration,
        totalServiceTime,
        totalTravelTime,
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

  // Calculate balance score
  const balanceableRoutes: BalanceableRoute[] = routes.map((r) => ({
    vehicleId: r.vehicleId,
    vehiclePlate: r.vehiclePlate,
    stops: r.stops.map((s) => ({
      orderId: s.orderId,
      trackingId: s.trackingId,
      address: s.address,
      latitude: s.latitude,
      longitude: s.longitude,
      weight: orderMap.get(s.orderId)?.weightRequired || 0,
      volume: orderMap.get(s.orderId)?.volumeRequired || 0,
      sequence: s.sequence,
    })),
    totalWeight: r.totalWeight,
    totalVolume: r.totalVolume,
    maxWeight: vehicleMap.get(r.vehicleId)?.maxWeight ?? 10000,
    maxVolume: vehicleMap.get(r.vehicleId)?.maxVolume ?? 100,
    maxOrders: vehicleMap.get(r.vehicleId)?.maxOrders ?? 50,
  }));

  const balanceScore = getBalanceScore(balanceableRoutes);

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
      balanceScore,
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

  // Distribute orders more evenly - sort by maxOrders (smallest first) to fill smaller vehicles
  const sortedVehicles = [...vehicles].sort(
    (a, b) => (a.maxOrders ?? 50) - (b.maxOrders ?? 50),
  );

  for (const vehicle of sortedVehicles) {
    const stops: OptimizedStop[] = [];
    let currentWeight = 0;
    let currentVolume = 0;
    const maxTasks = vehicle.maxOrders ?? 50;

    // Use vehicle's origin if available, otherwise depot
    let currentLocation: Coordinates = {
      latitude: vehicle.originLatitude ?? depot.latitude,
      longitude: vehicle.originLongitude ?? depot.longitude,
    };
    let sequence = 1;

    // Nearest neighbor - respect maxOrders limit
    while (stops.length < maxTasks) {
      // Find nearest unassigned order
      let nearestDistance = Number.POSITIVE_INFINITY;
      let nearestOrder: OrderForOptimization | null = null;

      for (const order of orders) {
        if (assigned.has(order.id)) continue;

        // Check capacity
        if (currentWeight + order.weightRequired > vehicle.maxWeight) continue;
        if (currentVolume + order.volumeRequired > vehicle.maxVolume) continue;

        // Check skills
        if (order.skillsRequired && order.skillsRequired.length > 0) {
          const vehicleSkills = new Set(vehicle.skills || []);
          if (!order.skillsRequired.every((s) => vehicleSkills.has(s)))
            continue;
        }

        const orderCoords: Coordinates = {
          latitude: order.latitude,
          longitude: order.longitude,
        };

        const distance = calculateDistance(currentLocation, orderCoords);

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestOrder = order;
        }
      }

      if (!nearestOrder) break;

      assigned.add(nearestOrder.id);

      stops.push({
        orderId: nearestOrder.id,
        trackingId: nearestOrder.trackingId,
        address: nearestOrder.address,
        latitude: nearestOrder.latitude,
        longitude: nearestOrder.longitude,
        sequence: sequence++,
        serviceTime: nearestOrder.serviceTime || 300,
      });

      currentWeight += nearestOrder.weightRequired;
      currentVolume += nearestOrder.volumeRequired;
      currentLocation = {
        latitude: nearestOrder.latitude,
        longitude: nearestOrder.longitude,
      };
    }

    if (stops.length > 0) {
      // Calculate route distance - start from vehicle origin, end at depot
      const vehicleStart: Coordinates = {
        latitude: vehicle.originLatitude ?? depot.latitude,
        longitude: vehicle.originLongitude ?? depot.longitude,
      };
      const routeCoords = [
        vehicleStart,
        ...stops.map((s) => ({ latitude: s.latitude, longitude: s.longitude })),
        depot,
      ];
      const routeResult = calculateRouteDistance(routeCoords);

      // Calculate service time from stops
      const totalServiceTime = stops.reduce(
        (sum, s) => sum + (s.serviceTime || 0),
        0,
      );
      const totalTravelTime = routeResult.durationSeconds;
      const totalDuration = totalTravelTime + totalServiceTime;

      routes.push({
        vehicleId: vehicle.id,
        vehiclePlate: vehicle.plate,
        stops,
        totalDistance: routeResult.distanceMeters,
        totalDuration,
        totalServiceTime,
        totalTravelTime,
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

  // Calculate balance score for nearest-neighbor result
  const balanceableRoutes: BalanceableRoute[] = routes.map((r) => ({
    vehicleId: r.vehicleId,
    vehiclePlate: r.vehiclePlate,
    stops: r.stops.map((s) => {
      const order = orders.find((o) => o.id === s.orderId);
      return {
        orderId: s.orderId,
        trackingId: s.trackingId,
        address: s.address,
        latitude: s.latitude,
        longitude: s.longitude,
        weight: order?.weightRequired || 0,
        volume: order?.volumeRequired || 0,
        sequence: s.sequence,
      };
    }),
    totalWeight: r.totalWeight,
    totalVolume: r.totalVolume,
    maxWeight: vehicles.find((v) => v.id === r.vehicleId)?.maxWeight ?? 10000,
    maxVolume: vehicles.find((v) => v.id === r.vehicleId)?.maxVolume ?? 100,
    maxOrders: vehicles.find((v) => v.id === r.vehicleId)?.maxOrders ?? 50,
  }));

  const balanceScore = getBalanceScore(balanceableRoutes);

  return {
    routes,
    unassigned,
    metrics: {
      totalDistance: routes.reduce((sum, r) => sum + r.totalDistance, 0),
      totalDuration: routes.reduce((sum, r) => sum + r.totalDuration, 0),
      totalRoutes: routes.length,
      totalStops: routes.reduce((sum, r) => sum + r.stops.length, 0),
      computingTimeMs: Date.now() - startTime,
      balanceScore,
    },
    usedVroom: false,
  };
}
