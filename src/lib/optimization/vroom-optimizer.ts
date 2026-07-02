/**
 * VROOM Optimizer - Converts our domain model to VROOM format and back
 *
 * This module bridges our application's data model with VROOM's API.
 * VROOM is the ONLY solve path: if it is unreachable or errors, the
 * optimization fails loudly (SEMANTICS A11). There is no silent greedy
 * fallback — a nearest-neighbor stand-in ignores time windows and emits no
 * arrival times, which is strictly worse than an honest error.
 *
 * Supports dynamic capacity dimensions via company optimization profiles.
 */

import {
  buildOrderCapacityVector,
  buildVehicleCapacityVector,
  defaultProfileSchema,
  type ProfileSchema,
  resolveOrderPriority,
} from "@/lib/orders/profile-schema";
import { getBalanceScore } from "./balance-utils";
import {
  DEFAULT_MAX_ORDERS_PER_VEHICLE,
  DEFAULT_SERVICE_TIME_SECONDS,
  FLEX_TIME_WINDOW_TOLERANCE_MINUTES,
} from "./constants";
import {
  createVroomJob,
  createVroomVehicle,
  solveVRP,
  type VroomRequest,
  type VroomResponse,
  type VroomVehicle,
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
  timeWindowStart?: string; // Vehicle workday start (HH:MM)
  timeWindowEnd?: string; // Vehicle workday end (HH:MM)
  // Break / lunch configuration
  hasBreakTime?: boolean;
  breakDuration?: number; // minutes
  breakTimeStart?: string; // HH:MM or HH:MM:SS
  breakTimeEnd?: string; // HH:MM or HH:MM:SS
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
  profile?: ProfileSchema;
  // New options for balancing and limits
  balanceVisits?: boolean; // Enable pre-solve balancing (max_tasks fair-share cap)
  maxDistanceKm?: number; // Maximum distance per route (km) — enforced natively by VROOM
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
  minimizeVehicles?: boolean; // Use minimum number of vehicles (via costs.fixed)
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
  /** Breaks the solver scheduled on this route (VROOM `type:"break"` steps). */
  breaks?: Array<{ arrivalTime?: number; durationSeconds: number }>;
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
    /** VROOM's own timing breakdown (ms) — persisted for solve telemetry. */
    vroomComputingTimes?: {
      loading?: number;
      solving?: number;
      routing?: number;
    };
  };
}

/**
 * Express the user-facing objective as VROOM's per-vehicle cost model.
 * VROOM minimizes `fixed + per_hour * duration + per_km * distance`. The
 * old top-level `objectives` request key does not exist in VROOM's API and
 * was silently ignored — presets claimed DISTANCE but always got
 * min-duration.
 *
 * Ratios assume ~30 km/h urban driving, where 1 h ≈ 30 km:
 * - TIME: pure duration (VROOM's default cost model).
 * - DISTANCE: distance dominates ~1000:1; the small per_hour keeps a sane
 *   tie-break on duration.
 * - BALANCED: duration and distance weigh roughly equal at urban speed.
 *
 * `minimizeVehicles` adds a fixed cost per used vehicle (~2 h / 60 km
 * equivalent) so VROOM only opens another route when constraints force it.
 * This replaces the old pre-solve fleet slicing by capacity averages, which
 * never let the solver see the real trade-off.
 */
function buildVehicleCosts(
  objective: OptimizationConfig["objective"],
  minimizeVehicles: boolean | undefined,
): VroomVehicle["costs"] | undefined {
  const base = {
    TIME: { per_hour: 3600, per_km: 0 },
    DISTANCE: { per_hour: 36, per_km: 1200 },
    BALANCED: { per_hour: 3600, per_km: 120 },
  }[objective] ?? { per_hour: 3600, per_km: 120 }; // objective comes from a DB string cast — guard drift

  const fixed = minimizeVehicles ? base.per_hour * 2 + base.per_km * 60 : 0;

  // Pure duration with no fixed cost is VROOM's default — omit the field.
  if (fixed === 0 && base.per_km === 0) return undefined;
  return { fixed, per_hour: base.per_hour, per_km: base.per_km };
}

/**
 * Optimize routes using VROOM. Throws on any solve failure — the job must
 * fail visibly rather than degrade (SEMANTICS A11).
 *
 * `signal` aborts the in-flight VROOM request when the job is cancelled.
 */
export async function optimizeRoutes(
  orders: OrderForOptimization[],
  vehicles: VehicleForOptimization[],
  config: OptimizationConfig,
  signal?: AbortSignal,
): Promise<OptimizationOutput> {
  const startTime = Date.now();

  try {
    return await optimizeWithVroom(orders, vehicles, config, startTime, signal);
  } catch (error) {
    console.error(
      `[vroom] solve failed (${orders.length} orders, ${vehicles.length} vehicles):`,
      error,
    );
    throw error;
  }
}

/**
 * Optimize using VROOM
 */
async function optimizeWithVroom(
  orders: OrderForOptimization[],
  vehicles: VehicleForOptimization[],
  config: OptimizationConfig,
  startTime: number,
  signal?: AbortSignal,
): Promise<OptimizationOutput> {
  // Validate inputs
  if (orders.length === 0) {
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
    };
  }

  if (vehicles.length === 0) {
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
    };
  }

  // Build order ID to index mapping
  const orderIdToIndex = new Map<number, string>();
  const vehicleIdToIndex = new Map<number, string>();

  // Skill name → numeric id, scoped to this solve. Jobs and vehicles only
  // need consistent ids within one request; a module-global map would grow
  // unbounded and leak skill names across tenants.
  const skillMap = new Map<string, number>();
  let skillCounter = 1;
  const getSkillId = (skillName: string): number => {
    const existingId = skillMap.get(skillName);
    if (existingId !== undefined) return existingId;
    const newId = skillCounter++;
    skillMap.set(skillName, newId);
    return newId;
  };

  // Get optimization profile (use default if not specified).
  let profile: ProfileSchema = config.profile || defaultProfileSchema();

  // Safeguard: a schema without dimensions can't produce valid capacity vectors.
  if (!profile.activeDimensions || profile.activeDimensions.length === 0) {
    profile = defaultProfileSchema(profile.companyId);
  }

  // Pre-solve balancing: cap every vehicle's max_tasks near the fair share
  // (+20% slack) so VROOM itself spreads the load — while still honoring
  // skills, time windows and capacities. The old post-solve redistribution
  // moved stops with none of those checks and wiped the solver's arrival
  // times (SEMANTICS A5).
  const balancedMaxOrders =
    config.balanceVisits && vehicles.length > 1
      ? Math.max(1, Math.ceil((orders.length / vehicles.length) * 1.2))
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

  // Time window tolerance in minutes when flexibleTimeWindows is enabled.
  // Shared constant — the verifier widens by the same amount (SEMANTICS A1).
  const timeWindowTolerance = config.flexibleTimeWindows
    ? FLEX_TIME_WINDOW_TOLERANCE_MINUTES
    : 0;

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
    const capacityInput = {
      weightRequired: order.weightRequired,
      volumeRequired: order.volumeRequired,
      orderValue: order.orderValue,
      unitsRequired: order.unitsRequired,
      orderType: order.orderType,
      priority: order.priority,
    };
    const capacityVector = buildOrderCapacityVector(capacityInput, profile);
    const resolvedPriority = resolveOrderPriority(capacityInput, profile);

    return createVroomJob(jobId, order.longitude, order.latitude, {
      description: order.trackingId,
      service: order.serviceTime || DEFAULT_SERVICE_TIME_SECONDS,
      delivery: capacityVector.values,
      skills,
      priority: resolvedPriority ?? order.priority,
      timeWindowStart: adjustedTimeWindowStart,
      timeWindowEnd: adjustedTimeWindowEnd,
    });
  });

  // Calculate speed factor from traffic factor (0-100 -> 0.5-1.5)
  const speedFactor =
    config.trafficFactor !== undefined
      ? 1.5 - config.trafficFactor / 100 // 0 traffic = 1.5x speed, 100 traffic = 0.5x speed
      : undefined;

  // The max-distance cap is enforced natively by VROOM (vehicle.max_distance)
  // — no 35 km/h proxy and no post-solve trim (SEMANTICS A6).
  const maxDistanceMeters = config.maxDistanceKm
    ? config.maxDistanceKm * 1000
    : undefined;

  // Objective + minimizeVehicles expressed as VROOM's cost model.
  const vehicleCosts = buildVehicleCosts(
    config.objective,
    config.minimizeVehicles,
  );

  // Create VROOM vehicles — the full fleet. When minimizeVehicles is on,
  // costs.fixed makes VROOM open as few routes as constraints allow.
  const vroomVehicles = vehicles.map((vehicle, index) => {
    const vehicleId = index + 1;
    vehicleIdToIndex.set(vehicleId, vehicle.id);

    // Map skills to numbers
    const skills = vehicle.skills?.map((s) => getSkillId(s));

    // Use vehicle's individual origin if available, otherwise use depot
    const startLongitude = vehicle.originLongitude ?? config.depot.longitude;
    const startLatitude = vehicle.originLatitude ?? config.depot.latitude;

    // Balanced cap never raises a vehicle's own limit — only lowers it
    // toward the fair share. (The old code let the balanced value override
    // smaller per-vehicle limits, producing MAX_ORDERS_EXCEEDED plans.)
    const vehicleMaxOrders =
      vehicle.maxOrders ?? DEFAULT_MAX_ORDERS_PER_VEHICLE;
    const effectiveMaxOrders = balancedMaxOrders
      ? Math.min(balancedMaxOrders, vehicleMaxOrders)
      : vehicleMaxOrders;

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
    const vehicleCapacityVector = buildVehicleCapacityVector(
      {
        weightCapacity: vehicle.maxWeight,
        volumeCapacity: vehicle.maxVolume,
        maxValueCapacity: vehicle.maxValueCapacity,
        maxUnitsCapacity: vehicle.maxUnitsCapacity,
      },
      profile,
    );

    return createVroomVehicle(
      vehicleId,
      config.openStart ? undefined : startLongitude,
      config.openStart ? undefined : startLatitude,
      {
        description: vehicle.plate,
        capacity: vehicleCapacityVector.values,
        skills,
        timeWindowStart:
          vehicle.timeWindowStart || config.depot.timeWindowStart,
        timeWindowEnd: vehicle.timeWindowEnd || config.depot.timeWindowEnd,
        speedFactor: effectiveSpeedFactor,
        maxTasks: effectiveMaxOrders,
        maxDistanceMeters, // Maximum distance per route (native VROOM)
        costs: vehicleCosts,
        endLongitude,
        endLatitude,
        openStart: config.openStart,
        openEnd,
        // Break / lunch configuration
        hasBreakTime: vehicle.hasBreakTime,
        breakDuration: vehicle.breakDuration,
        breakTimeStart: vehicle.breakTimeStart,
        breakTimeEnd: vehicle.breakTimeEnd,
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

  // Validate jobs have valid coordinates
  for (const job of jobs) {
    if (
      !job.location ||
      Number.isNaN(job.location[0]) ||
      Number.isNaN(job.location[1])
    ) {
      throw new Error(
        `Job ${job.id} has invalid coordinates: ${JSON.stringify(job.location)}`,
      );
    }
  }

  // Validate capacity array dimensions match between jobs and vehicles
  if (jobs.length > 0 && vroomVehicles.length > 0) {
    const jobDeliveryLength = jobs[0].delivery?.length || 0;
    const vehicleCapacityLength = vroomVehicles[0].capacity?.length || 0;
    if (jobDeliveryLength !== vehicleCapacityLength) {
      throw new Error(
        `Capacity dimension mismatch: jobs=${jobDeliveryLength}, vehicles=${vehicleCapacityLength}`,
      );
    }
  }

  // Call VROOM
  const response = await solveVRP(request, signal);

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
    const routeBreaks: Array<{
      arrivalTime?: number;
      durationSeconds: number;
    }> = [];
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
      } else if (step.type === "break") {
        routeBreaks.push({
          arrivalTime: step.arrival,
          durationSeconds: step.service ?? 0,
        });
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
        breaks: routeBreaks.length > 0 ? routeBreaks : undefined,
      });

      // DIAGNOSTIC — route geometry/distance mismatch. A route's distance must
      // be AT LEAST the straight-line span of its stops; when it's far less,
      // VROOM returned a distance/geometry that doesn't cover all the stops it
      // assigned (the "N paradas pero 2.2 km / sin línea completa" bug). The
      // `jobSteps` vs `stops` numbers isolate the culprit: jobSteps === stops
      // ⇒ VROOM/OSRM under-routed (matrix/coords); jobSteps < stops ⇒ stops got
      // inflated downstream. Remove once the root cause is fixed.
      if (stops.length >= 2) {
        let minLat = Number.POSITIVE_INFINITY;
        let minLng = Number.POSITIVE_INFINITY;
        let maxLat = Number.NEGATIVE_INFINITY;
        let maxLng = Number.NEGATIVE_INFINITY;
        for (const s of stops) {
          if (s.latitude < minLat) minLat = s.latitude;
          if (s.latitude > maxLat) maxLat = s.latitude;
          if (s.longitude < minLng) minLng = s.longitude;
          if (s.longitude > maxLng) maxLng = s.longitude;
        }
        const toRad = (d: number) => (d * Math.PI) / 180;
        const dLat = toRad(maxLat - minLat);
        const dLng = toRad(maxLng - minLng);
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(minLat)) *
            Math.cos(toRad(maxLat)) *
            Math.sin(dLng / 2) ** 2;
        const stopsSpanKm = 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
        const distKm = (vroomRoute.distance || 0) / 1000;
        if (stopsSpanKm > distKm + 0.5) {
          const jobSteps = vroomRoute.steps.filter(
            (st) => st.type === "job",
          ).length;
          console.warn(
            `[route-geom MISMATCH] ${vehicle.plate}: stops=${stops.length} ` +
              `jobSteps=${jobSteps} distKm=${distKm.toFixed(2)} ` +
              `stopsSpanKm=${stopsSpanKm.toFixed(2)} ` +
              `geomChars=${vroomRoute.geometry?.length ?? 0}`,
          );
        }
      }
    }
  }

  // Map unassigned with a CLASSIFIED reason. VROOM doesn't return a per-job
  // reason, so we infer the dominant cause from fleet coverage: a required
  // skill no vehicle has, or a capacity no vehicle can hold. If the fleet
  // covers both, the order is feasible on paper and the cause is the schedule
  // — time window, vehicle workday, or the break eating into available time.
  const unassigned = (response.unassigned || []).map((u) => {
    const orderId = orderIdToIndex.get(u.id);
    const order = orderId ? orderMap.get(orderId) : undefined;

    let reason =
      "No se pudo encajar en ninguna ruta (ventana horaria, jornada del vehículo o descanso).";
    if (order) {
      const required = order.skillsRequired ?? [];
      const uncoveredSkill = required.find(
        (code) => !vehicles.some((v) => (v.skills ?? []).includes(code)),
      );
      const fitsCapacity = vehicles.some(
        (v) =>
          order.weightRequired <= v.maxWeight &&
          order.volumeRequired <= v.maxVolume,
      );
      if (uncoveredSkill) {
        reason = `Ninguna unidad posee la habilidad requerida "${uncoveredSkill}".`;
      } else if (!fitsCapacity) {
        reason =
          "El pedido excede la capacidad (peso/volumen) de todas las unidades disponibles.";
      }
    }

    return {
      orderId: orderId || String(u.id),
      trackingId: order?.trackingId || u.description || "Unknown",
      reason,
    };
  });

  const summary = response.summary;
  const balanceScore = getBalanceScore(routes.map((r) => r.stops.length));

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
      vroomComputingTimes: summary?.computing_times
        ? {
            loading: summary.computing_times.loading,
            solving: summary.computing_times.solving,
            routing: summary.computing_times.routing,
          }
        : undefined,
    },
  };
}
