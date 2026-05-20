/**
 * Stage 3 — Solve: take prepared orders/vehicles/config and run VROOM,
 * either per-zone batch or as a single global solve. Produces canonical
 * `RawSolvedRoute[]` (no driver assigned yet — that's stage 4).
 *
 * The bulk of the runner's I/O sits here: VROOM is called once per zone
 * batch (when zones are configured) or once globally. Stop conversion
 * handles the grouped-orders case (multiple orders sharing an exact lat/lng
 * collapse into one VROOM stop and expand back to per-order rows).
 */

import {
  createZoneBatches,
  type DayOfWeek,
  type ZoneData,
} from "../../../geo/zone-utils";
import type {
  RawSolvedRoute,
  SolvedStop,
  UnassignedOrderRecord,
} from "../../solved-plan";
import {
  type OrderForOptimization,
  type VehicleForOptimization,
  type OptimizationConfig as VroomOptConfig,
  optimizeRoutes as vroomOptimizeRoutes,
} from "../../vroom-optimizer";
import { parseRequiredSkills } from "../load-skills";
import { formatArrivalTime } from "../postprocess";
import { groupOrdersByLocation, type OrderGroupMap } from "../prepare";

/**
 * Subset of pendingOrder data the solver needs after time-window resolution.
 */
export interface OrderForSolve {
  id: string;
  trackingId: string;
  address: string;
  latitude: string | number;
  longitude: string | number;
  weightRequired: number;
  volumeRequired: number;
  orderValue?: number;
  unitsRequired?: number;
  orderType?: "NEW" | "RESCHEDULED" | "URGENT" | null;
  priority?: number | null;
  promisedDate?: Date | string | null;
  serviceTime?: number;
  timeWindowStart?: string;
  timeWindowEnd?: string;
  requiredSkills?: string | null;
}

export interface VehicleForSolve {
  id: string;
  /** Identifier for the vehicle. Fallbacks (`name`, `id`) cover null cases. */
  plate: string | null;
  name?: string | null;
  weightCapacity?: number | null;
  volumeCapacity?: number | null;
  maxValueCapacity?: number | null;
  maxUnitsCapacity?: number | null;
  maxOrders?: number | null;
  originLatitude?: string | null;
  originLongitude?: string | null;
  workdayStart?: string | null;
  workdayEnd?: string | null;
  hasBreakTime?: boolean | null;
  breakDuration?: number | null;
  breakTimeStart?: string | null;
  breakTimeEnd?: string | null;
}

export interface VehicleWithZoneAssignment extends VehicleForSolve {
  zoneAssignments: Array<{
    zoneId: string;
    vehicleId: string;
    assignedDays?: string[] | null;
    active: boolean;
  }>;
}

export interface OrderDetails {
  latitude?: number;
  longitude?: number;
  address: string;
  timeWindowStart?: string;
  timeWindowEnd?: string;
}

export interface SolveBatchesArgs {
  ordersWithLocation: OrderForSolve[];
  selectedVehicles: VehicleForSolve[];
  vehiclesWithZones: VehicleWithZoneAssignment[];
  vehicleSkillsMap: Map<string, string[]>;
  zonesData: ZoneData[];
  dayOfWeek: DayOfWeek;
  vroomConfig: VroomOptConfig;
  groupSameLocation: boolean;
  oneRoutePerVehicle: boolean;
  orderDetailsMap: Map<string, OrderDetails>;
  buildTimeWindow: (
    orderId: string,
  ) => { start: string; end: string } | undefined;
  calculateWaitingSeconds: (
    arrivalSeconds: number,
    orderId: string,
  ) => number | undefined;
  /** Fired after each route is appended — lets the caller snapshot for cancel. */
  onRouteAdded?: (allRoutes: RawSolvedRoute[]) => void;
  /** Fired after each batch finishes; lets the caller update job progress. */
  onBatchProgress?: (progressPercent: number) => Promise<void>;
  checkAbort: () => void;
}

export interface SolveBatchesResult {
  rawRoutes: RawSolvedRoute[];
  unassignedOrders: UnassignedOrderRecord[];
  warnings: string[];
}

// ─── VROOM input adapters ─────────────────────────────────────────────

function toVroomOrder(
  order: OrderForSolve,
  zoneId: string | undefined,
): OrderForOptimization {
  // Use direct time window fields first, fallback to promisedDate
  const timeWindowStart = order.timeWindowStart
    ? String(order.timeWindowStart)
    : order.promisedDate
      ? new Date(order.promisedDate).toTimeString().slice(0, 5)
      : undefined;
  const timeWindowEnd = order.timeWindowEnd
    ? String(order.timeWindowEnd)
    : order.promisedDate
      ? new Date(new Date(order.promisedDate).getTime() + 2 * 60 * 60 * 1000)
          .toTimeString()
          .slice(0, 5)
      : undefined;

  const skillsRequired = parseRequiredSkills(order.requiredSkills);
  return {
    id: order.id,
    trackingId: order.trackingId,
    address: order.address,
    latitude: parseFloat(String(order.latitude)),
    longitude: parseFloat(String(order.longitude)),
    weightRequired: order.weightRequired,
    volumeRequired: order.volumeRequired,
    orderValue: order.orderValue ?? 0,
    unitsRequired: order.unitsRequired ?? 1,
    orderType: order.orderType ?? undefined,
    priority: order.priority ?? undefined,
    timeWindowStart,
    timeWindowEnd,
    serviceTime: order.serviceTime,
    skillsRequired: skillsRequired.length > 0 ? skillsRequired : undefined,
    zoneId,
  };
}

function toVroomVehicle(
  vehicle: VehicleForSolve,
  vehicleSkillsMap: Map<string, string[]>,
): VehicleForOptimization {
  return {
    id: vehicle.id,
    plate: vehicle.plate ?? vehicle.name ?? vehicle.id,
    maxWeight: vehicle.weightCapacity ?? 10000,
    maxVolume: vehicle.volumeCapacity ?? 100,
    maxValueCapacity: vehicle.maxValueCapacity ?? undefined,
    maxUnitsCapacity: vehicle.maxUnitsCapacity ?? undefined,
    maxOrders: vehicle.maxOrders ?? 30,
    originLatitude: vehicle.originLatitude
      ? parseFloat(vehicle.originLatitude)
      : undefined,
    originLongitude: vehicle.originLongitude
      ? parseFloat(vehicle.originLongitude)
      : undefined,
    skills: vehicleSkillsMap.get(vehicle.id),
    timeWindowStart: vehicle.workdayStart ?? undefined,
    timeWindowEnd: vehicle.workdayEnd ?? undefined,
    hasBreakTime: vehicle.hasBreakTime ?? undefined,
    breakDuration: vehicle.breakDuration ?? undefined,
    breakTimeStart: vehicle.breakTimeStart ?? undefined,
    breakTimeEnd: vehicle.breakTimeEnd ?? undefined,
  };
}

// ─── VROOM output → SolvedStop / RawSolvedRoute ───────────────────────

interface BuildStopHelpers {
  globalGroupMap: OrderGroupMap;
  groupSameLocation: boolean;
  buildTimeWindow: SolveBatchesArgs["buildTimeWindow"];
  calculateWaitingSeconds: SolveBatchesArgs["calculateWaitingSeconds"];
}

interface VroomStopShape {
  orderId: string;
  trackingId: string;
  address: string;
  latitude: number;
  longitude: number;
  arrivalTime?: number;
}

/**
 * Materialise SolvedStops from a VROOM stop, expanding grouped orders
 * back into individual rows when grouping was enabled but the caller wants
 * each order represented separately.
 */
function buildSolvedStops(
  vroomStops: VroomStopShape[],
  helpers: BuildStopHelpers,
): SolvedStop[] {
  const result: SolvedStop[] = [];
  let sequence = 1;
  for (const stop of vroomStops) {
    const grouped = helpers.globalGroupMap.get(stop.orderId);
    if (grouped && grouped.orderIds.length > 1) {
      if (helpers.groupSameLocation) {
        // Single stop carrying the grouped order ids
        result.push({
          orderId: grouped.orderIds[0],
          trackingId: grouped.trackingIds[0],
          sequence: sequence++,
          address: stop.address,
          latitude: stop.latitude,
          longitude: stop.longitude,
          estimatedArrival: stop.arrivalTime
            ? formatArrivalTime(stop.arrivalTime)
            : undefined,
          waitingTimeSeconds: stop.arrivalTime
            ? helpers.calculateWaitingSeconds(
                stop.arrivalTime,
                grouped.orderIds[0],
              )
            : undefined,
          timeWindow: helpers.buildTimeWindow(grouped.orderIds[0]),
          groupedOrderIds: grouped.orderIds,
          groupedTrackingIds: grouped.trackingIds,
        });
      } else {
        // Expand into per-order stops at the same location
        for (let i = 0; i < grouped.orderIds.length; i++) {
          result.push({
            orderId: grouped.orderIds[i],
            trackingId: grouped.trackingIds[i],
            sequence: sequence++,
            address: stop.address,
            latitude: stop.latitude,
            longitude: stop.longitude,
            estimatedArrival: stop.arrivalTime
              ? formatArrivalTime(stop.arrivalTime)
              : undefined,
            waitingTimeSeconds: stop.arrivalTime
              ? helpers.calculateWaitingSeconds(
                  stop.arrivalTime,
                  grouped.orderIds[i],
                )
              : undefined,
            timeWindow: helpers.buildTimeWindow(grouped.orderIds[i]),
          });
        }
      }
    } else {
      result.push({
        orderId: stop.orderId,
        trackingId: stop.trackingId,
        sequence: sequence++,
        address: stop.address,
        latitude: stop.latitude,
        longitude: stop.longitude,
        estimatedArrival: stop.arrivalTime
          ? formatArrivalTime(stop.arrivalTime)
          : undefined,
        waitingTimeSeconds: stop.arrivalTime
          ? helpers.calculateWaitingSeconds(stop.arrivalTime, stop.orderId)
          : undefined,
        timeWindow: helpers.buildTimeWindow(stop.orderId),
      });
    }
  }
  return result;
}

interface BuildRouteArgs {
  vehicle: VehicleForSolve;
  vroomRoute: {
    vehicleId: string;
    stops: VroomStopShape[];
    totalDistance: number;
    totalDuration: number;
    totalServiceTime: number;
    totalTravelTime: number;
    totalWeight: number;
    totalVolume: number;
    geometry?: string;
  };
  zoneId?: string;
  helpers: BuildStopHelpers;
}

function buildRawSolvedRoute({
  vehicle,
  vroomRoute,
  zoneId,
  helpers,
}: BuildRouteArgs): RawSolvedRoute {
  const stops = buildSolvedStops(vroomRoute.stops, helpers);
  return {
    routeId: `route-${vehicle.id}-${zoneId ?? "no-zone"}-${Date.now()}`,
    vehicleId: vehicle.id,
    vehicleIdentifier: vehicle.plate || vehicle.name || vehicle.id,
    zoneId,
    stops,
    totalDistance: vroomRoute.totalDistance,
    totalDuration: vroomRoute.totalDuration,
    totalServiceTime: vroomRoute.totalServiceTime,
    totalTravelTime: vroomRoute.totalTravelTime,
    capacityUsed: {
      WEIGHT: vroomRoute.totalWeight,
      VOLUME: vroomRoute.totalVolume,
    },
    utilizationPercentage: Math.round(
      Math.max(
        (vroomRoute.totalWeight / (vehicle.weightCapacity || 1)) * 100,
        (vroomRoute.totalVolume / (vehicle.volumeCapacity || 1)) * 100,
      ) || 0,
    ),
    timeWindowViolations: 0,
    geometry: vroomRoute.geometry,
  };
}

// ─── Public stage entry ───────────────────────────────────────────────

export async function solveBatches(
  args: SolveBatchesArgs,
): Promise<SolveBatchesResult> {
  const {
    ordersWithLocation,
    selectedVehicles,
    vehiclesWithZones,
    vehicleSkillsMap,
    zonesData,
    dayOfWeek,
    vroomConfig,
    groupSameLocation,
    oneRoutePerVehicle,
    orderDetailsMap,
    buildTimeWindow,
    calculateWaitingSeconds,
    onRouteAdded,
    onBatchProgress,
    checkAbort,
  } = args;

  const rawRoutes: RawSolvedRoute[] = [];
  const unassignedOrders: UnassignedOrderRecord[] = [];
  const warnings: string[] = [];
  const globalGroupMap: OrderGroupMap = new Map();
  const vehiclesWithRoutes = new Set<string>();
  const selectedVehiclesById = new Map(selectedVehicles.map((v) => [v.id, v]));
  const helpers: BuildStopHelpers = {
    globalGroupMap,
    groupSameLocation,
    buildTimeWindow,
    calculateWaitingSeconds,
  };

  const hasZones = zonesData.length > 0;

  if (hasZones) {
    // Zone-aware optimization: run optimization per zone batch.
    const {
      batches: zoneBatches,
      warnings: zoneWarnings,
      unroutable,
    } = createZoneBatches(
      ordersWithLocation,
      vehiclesWithZones,
      zonesData,
      dayOfWeek,
    );
    warnings.push(...zoneWarnings);

    // Orders whose zone has no eligible vehicles must be surfaced as
    // unassigned with a clear reason. Without this they silently disappear.
    for (const { order, reason } of unroutable) {
      const details = orderDetailsMap.get(order.id);
      unassignedOrders.push({
        orderId: order.id,
        trackingId: order.trackingId,
        reason,
        latitude: details?.latitude,
        longitude: details?.longitude,
        address: details?.address,
      });
    }

    // Process "unzoned" (Sin Zona) FIRST so unrestricted vehicles serve
    // orders that ONLY they can handle before being used for zone orders
    // (which may have zone-specific vehicles).
    zoneBatches.sort((a, b) => {
      if (a.zoneId === "unzoned") return -1;
      if (b.zoneId === "unzoned") return 1;
      return 0;
    });

    const progressPerBatch =
      zoneBatches.length > 0 ? 50 / zoneBatches.length : 50;
    let currentProgress = 20;

    for (const batch of zoneBatches) {
      checkAbort();

      // Filter out vehicles that already have routes if oneRoutePerVehicle is enabled
      const availableVehicles = oneRoutePerVehicle
        ? batch.vehicles.filter((v) => !vehiclesWithRoutes.has(v.id))
        : batch.vehicles;

      if (availableVehicles.length === 0) {
        const reason =
          oneRoutePerVehicle && batch.vehicles.length > 0
            ? `Vehículos de zona ${batch.zoneName} ya tienen rutas asignadas (1 ruta por vehículo habilitado)`
            : `No hay vehículos disponibles para la zona ${batch.zoneName} el día ${dayOfWeek}`;

        for (const order of batch.orders) {
          const details = orderDetailsMap.get(order.id);
          unassignedOrders.push({
            orderId: order.id,
            trackingId: order.trackingId,
            reason,
            latitude: details?.latitude,
            longitude: details?.longitude,
            address: details?.address,
          });
        }
        continue;
      }

      // Apply grouping if enabled
      let ordersToProcess = batch.orders;
      if (groupSameLocation) {
        const { groupedOrders, groupMap } = groupOrdersByLocation(batch.orders);
        for (const [key, value] of groupMap) {
          globalGroupMap.set(key, value);
        }
        ordersToProcess = groupedOrders;
      }

      const vroomZoneId = batch.zoneId === "unzoned" ? undefined : batch.zoneId;
      const batchOrdersForVroom = ordersToProcess.map((order) =>
        toVroomOrder(order as OrderForSolve, vroomZoneId),
      );
      const batchVehiclesForVroom = availableVehicles.map((v) =>
        toVroomVehicle(v as VehicleForSolve, vehicleSkillsMap),
      );

      const batchResult = await vroomOptimizeRoutes(
        batchOrdersForVroom,
        batchVehiclesForVroom,
        vroomConfig,
      );

      // Expand batch unassigned (handle grouped orders)
      for (const unassigned of batchResult.unassigned) {
        const grouped = globalGroupMap.get(unassigned.orderId);
        if (grouped && grouped.orderIds.length > 1) {
          for (let i = 0; i < grouped.orderIds.length; i++) {
            const details = orderDetailsMap.get(grouped.orderIds[i]);
            unassignedOrders.push({
              orderId: grouped.orderIds[i],
              trackingId: grouped.trackingIds[i],
              reason: `${unassigned.reason} (Zona: ${batch.zoneName})`,
              latitude: details?.latitude,
              longitude: details?.longitude,
              address: details?.address,
            });
          }
        } else {
          const details = orderDetailsMap.get(unassigned.orderId);
          unassignedOrders.push({
            ...unassigned,
            reason: `${unassigned.reason} (Zona: ${batch.zoneName})`,
            latitude: details?.latitude,
            longitude: details?.longitude,
            address: details?.address,
          });
        }
      }

      // Materialise routes
      for (const vroomRoute of batchResult.routes) {
        const vehicle = selectedVehiclesById.get(vroomRoute.vehicleId);
        if (!vehicle) continue;

        const route = buildRawSolvedRoute({
          vehicle,
          vroomRoute,
          zoneId: vroomZoneId,
          helpers,
        });
        rawRoutes.push(route);
        onRouteAdded?.(rawRoutes);
        if (oneRoutePerVehicle) {
          vehiclesWithRoutes.add(vehicle.id);
        }
      }

      currentProgress += progressPerBatch;
      await onBatchProgress?.(currentProgress);
    }
  } else {
    // No zones configured — single global optimization.
    let ordersToProcess = ordersWithLocation;
    if (groupSameLocation) {
      const { groupedOrders, groupMap } =
        groupOrdersByLocation(ordersWithLocation);
      for (const [key, value] of groupMap) {
        globalGroupMap.set(key, value);
      }
      ordersToProcess = groupedOrders as OrderForSolve[];
    }

    const ordersForVroom = ordersToProcess.map((o) =>
      toVroomOrder(o, undefined),
    );
    const vehiclesForVroom = vehiclesWithZones.map((v) =>
      toVroomVehicle(v, vehicleSkillsMap),
    );

    await onBatchProgress?.(30);
    checkAbort();

    const vroomResult = await vroomOptimizeRoutes(
      ordersForVroom,
      vehiclesForVroom,
      vroomConfig,
    );

    // Expand unassigned (handle grouped)
    for (const unassigned of vroomResult.unassigned) {
      const grouped = globalGroupMap.get(unassigned.orderId);
      if (grouped && grouped.orderIds.length > 1) {
        for (let i = 0; i < grouped.orderIds.length; i++) {
          const details = orderDetailsMap.get(grouped.orderIds[i]);
          unassignedOrders.push({
            orderId: grouped.orderIds[i],
            trackingId: grouped.trackingIds[i],
            reason: unassigned.reason,
            latitude: details?.latitude,
            longitude: details?.longitude,
            address: details?.address,
          });
        }
      } else {
        const details = orderDetailsMap.get(unassigned.orderId);
        unassignedOrders.push({
          ...unassigned,
          latitude: details?.latitude,
          longitude: details?.longitude,
          address: details?.address,
        });
      }
    }

    // Materialise routes
    for (const vroomRoute of vroomResult.routes) {
      const vehicle = selectedVehiclesById.get(vroomRoute.vehicleId);
      if (!vehicle) continue;

      const route = buildRawSolvedRoute({
        vehicle,
        vroomRoute,
        zoneId: undefined,
        helpers,
      });
      rawRoutes.push(route);
      onRouteAdded?.(rawRoutes);
    }
  }

  return { rawRoutes, unassignedOrders, warnings };
}
