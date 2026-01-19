/**
 * VROOM Adapter - Implements IOptimizer using VROOM backend
 *
 * This adapter wraps the existing VROOM optimizer to conform to the
 * common optimizer interface, allowing it to be used interchangeably
 * with other optimization engines.
 */

import {
  optimizeRoutes,
  type OrderForOptimization,
  type VehicleForOptimization,
  type OptimizationConfig as VroomConfig,
} from "../vroom-optimizer";
import { isVroomAvailable } from "../vroom-client";
import type {
  IOptimizer,
  OptimizerCapabilities,
  OptimizerConfig,
  OptimizerOrder,
  OptimizerVehicle,
  OptimizationResult,
} from "./optimizer-interface";

export class VroomAdapter implements IOptimizer {
  readonly name = "VROOM";
  readonly displayName = "Optimización Rápida";

  async isAvailable(): Promise<boolean> {
    return isVroomAvailable();
  }

  async optimize(
    orders: OptimizerOrder[],
    vehicles: OptimizerVehicle[],
    config: OptimizerConfig,
  ): Promise<OptimizationResult> {
    // Convert to VROOM-specific types
    const vroomOrders: OrderForOptimization[] = orders.map((o) => ({
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
      timeWindowStart: o.timeWindowStart,
      timeWindowEnd: o.timeWindowEnd,
      skillsRequired: o.skillsRequired,
      priority: o.priority,
      serviceTime: o.serviceTime,
      zoneId: o.zoneId,
    }));

    const vroomVehicles: VehicleForOptimization[] = vehicles.map((v) => ({
      id: v.id,
      plate: v.identifier,
      maxWeight: v.maxWeight,
      maxVolume: v.maxVolume,
      maxValueCapacity: v.maxValueCapacity,
      maxUnitsCapacity: v.maxUnitsCapacity,
      maxOrders: v.maxOrders,
      originLatitude: v.originLatitude,
      originLongitude: v.originLongitude,
      skills: v.skills,
      speedFactor: v.speedFactor,
    }));

    const vroomConfig: VroomConfig = {
      depot: {
        latitude: config.depot.latitude,
        longitude: config.depot.longitude,
        timeWindowStart: config.depot.timeWindowStart,
        timeWindowEnd: config.depot.timeWindowEnd,
      },
      objective: config.objective,
      profile: config.profile,
      balanceVisits: config.balanceVisits,
      maxDistanceKm: config.maxDistanceKm,
      maxTravelTimeMinutes: config.maxTravelTimeMinutes,
      trafficFactor: config.trafficFactor,
      routeEndMode: config.routeEndMode,
      endDepot: config.endDepot
        ? {
            latitude: config.endDepot.latitude,
            longitude: config.endDepot.longitude,
            address: config.endDepot.address,
          }
        : undefined,
      openStart: config.openStart,
      minimizeVehicles: config.minimizeVehicles,
      flexibleTimeWindows: config.flexibleTimeWindows,
      maxRoutes: config.maxRoutes,
    };

    // Call existing VROOM optimizer
    const result = await optimizeRoutes(vroomOrders, vroomVehicles, vroomConfig);

    // Convert to common format
    return {
      routes: result.routes.map((r) => ({
        vehicleId: r.vehicleId,
        vehicleIdentifier: r.vehiclePlate,
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
      metrics: {
        totalDistance: result.metrics.totalDistance,
        totalDuration: result.metrics.totalDuration,
        totalRoutes: result.metrics.totalRoutes,
        totalStops: result.metrics.totalStops,
        computingTimeMs: result.metrics.computingTimeMs,
        balanceScore: result.metrics.balanceScore,
      },
      optimizer: this.name,
    };
  }

  estimateTime(orderCount: number, vehicleCount: number): number {
    // VROOM is very fast - typically milliseconds to seconds
    // Rough estimate: 100ms per 100 orders
    const baseTime = 500; // base overhead
    const orderFactor = Math.ceil(orderCount / 100) * 100;
    const vehicleFactor = Math.ceil(vehicleCount / 10) * 50;
    return baseTime + orderFactor + vehicleFactor;
  }

  getCapabilities(): OptimizerCapabilities {
    return {
      supportsTimeWindows: true,
      supportsSkills: true,
      supportsMultiDimensionalCapacity: true,
      supportsPriorities: true,
      supportsBalancing: true,
      maxOrders: 10000, // practical limit for reasonable performance
      maxVehicles: 500, // practical limit
      typicalSpeed: "fast",
      qualityLevel: "good",
    };
  }
}

// Export singleton instance
export const vroomAdapter = new VroomAdapter();
