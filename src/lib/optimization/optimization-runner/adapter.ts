import {
  type OrderForOptimization,
  type VehicleForOptimization,
  type OptimizationConfig as VroomOptConfig,
} from "../vroom-optimizer";
import type { IOptimizer, OptimizerOrder, OptimizerVehicle, OptimizerConfig } from "../optimizer-interface";

/**
 * Run optimization via the abstract adapter (PyVRP or fallback).
 * Bridges between the runner's VROOM-style types and the adapter's common types.
 */
export async function runViaAdapter(
  adapter: IOptimizer,
  ordersForVroom: OrderForOptimization[],
  vehiclesForVroom: VehicleForOptimization[],
  vroomConfig: VroomOptConfig,
) {
  const adapterOrders: OptimizerOrder[] = ordersForVroom.map((o) => ({
    id: o.id,
    trackingId: o.trackingId,
    address: o.address,
    latitude: o.latitude,
    longitude: o.longitude,
    weightRequired: o.weightRequired,
    volumeRequired: o.volumeRequired,
    orderValue: o.orderValue,
    unitsRequired: o.unitsRequired,
    orderType: o.orderType,
    priority: o.priority,
    timeWindowStart: o.timeWindowStart,
    timeWindowEnd: o.timeWindowEnd,
    serviceTime: o.serviceTime,
    zoneId: o.zoneId,
  }));

  const adapterVehicles: OptimizerVehicle[] = vehiclesForVroom.map((v) => ({
    id: v.id,
    identifier: v.plate,
    maxWeight: v.maxWeight,
    maxVolume: v.maxVolume,
    maxValueCapacity: v.maxValueCapacity,
    maxUnitsCapacity: v.maxUnitsCapacity,
    maxOrders: v.maxOrders,
    originLatitude: v.originLatitude,
    originLongitude: v.originLongitude,
    timeWindowStart: v.timeWindowStart,
    timeWindowEnd: v.timeWindowEnd,
    hasBreakTime: v.hasBreakTime,
    breakDuration: v.breakDuration,
    breakTimeStart: v.breakTimeStart,
    breakTimeEnd: v.breakTimeEnd,
  }));

  const adapterConfig: OptimizerConfig = {
    depot: {
      latitude: vroomConfig.depot.latitude,
      longitude: vroomConfig.depot.longitude,
      timeWindowStart: vroomConfig.depot.timeWindowStart,
      timeWindowEnd: vroomConfig.depot.timeWindowEnd,
    },
    objective: vroomConfig.objective,
    profile: vroomConfig.profile,
    balanceVisits: vroomConfig.balanceVisits,
    maxDistanceKm: vroomConfig.maxDistanceKm,
    maxTravelTimeMinutes: vroomConfig.maxTravelTimeMinutes,
    trafficFactor: vroomConfig.trafficFactor,
    routeEndMode: vroomConfig.routeEndMode,
    minimizeVehicles: vroomConfig.minimizeVehicles,
    openStart: vroomConfig.openStart,
    flexibleTimeWindows: vroomConfig.flexibleTimeWindows,
    timeoutMs: 120000,
  };

  const result = await adapter.optimize(adapterOrders, adapterVehicles, adapterConfig);

  // Convert back to runner's VROOM-style result format
  return {
    routes: result.routes.map((r) => ({
      vehicleId: r.vehicleId,
      stops: r.stops.map((s) => ({
        orderId: s.orderId,
        trackingId: s.trackingId,
        address: s.address,
        latitude: s.latitude,
        longitude: s.longitude,
        sequence: s.sequence,
        arrivalTime: s.arrivalTime,
        serviceTime: s.serviceTime,
        waitingTime: s.waitingTime,
      })),
      totalDistance: r.totalDistance,
      totalDuration: r.totalDuration,
      totalServiceTime: r.totalServiceTime,
      totalTravelTime: r.totalTravelTime,
      totalWeight: r.totalWeight,
      totalVolume: r.totalVolume,
      geometry: r.geometry,
    })),
    unassigned: result.unassigned.map((u) => ({
      orderId: u.orderId,
      trackingId: u.trackingId,
      reason: u.reason,
    })),
  };
}
