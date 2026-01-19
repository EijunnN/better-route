/**
 * Zone Utilities - Geographic zone operations using Turf.js
 *
 * This module provides functions for:
 * - Point-in-polygon checking (order in zone)
 * - Assigning orders to zones
 * - Filtering vehicles by zone
 * - Grouping orders by zone for optimization
 */

import * as turf from "@turf/turf";
import type {
  Feature,
  Polygon,
  MultiPolygon,
  GeoJsonProperties,
} from "geojson";

// Day of week types (matching what's stored in the database)
export type DayOfWeek =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

// Zone from database
export interface ZoneData {
  id: string;
  name: string;
  geometry: string; // GeoJSON string
  activeDays?: string | null; // JSON array of days
  active: boolean;
  type?: string;
  color?: string;
}

// Vehicle zone assignment from database
export interface VehicleZoneAssignment {
  zoneId: string;
  vehicleId: string;
  assignedDays?: string | null; // JSON array of days
  active: boolean;
}

// Order with location
export interface OrderWithLocation {
  id: string;
  latitude: number | string;
  longitude: number | string;
}

// Vehicle with zone assignments
export interface VehicleWithZones {
  id: string;
  zoneAssignments?: VehicleZoneAssignment[];
}

/**
 * Parse geometry string to GeoJSON Feature
 */
function parseGeometry(
  geometryString: string,
): Feature<Polygon | MultiPolygon, GeoJsonProperties> | null {
  try {
    const parsed = JSON.parse(geometryString);

    // Handle both raw geometry and feature objects
    if (parsed.type === "Feature") {
      return parsed as Feature<Polygon | MultiPolygon, GeoJsonProperties>;
    }

    if (parsed.type === "Polygon" || parsed.type === "MultiPolygon") {
      return {
        type: "Feature",
        properties: {},
        geometry: parsed,
      } as Feature<Polygon | MultiPolygon, GeoJsonProperties>;
    }

    console.warn("Invalid geometry type:", parsed.type);
    return null;
  } catch (error) {
    console.warn("Failed to parse geometry:", error);
    return null;
  }
}

/**
 * Parse days string to array
 */
function parseDays(daysString: string | null | undefined): DayOfWeek[] {
  if (!daysString) return [];
  try {
    const parsed = JSON.parse(daysString);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Check if a point is inside a zone's polygon
 */
export function isPointInZone(
  latitude: number,
  longitude: number,
  zone: ZoneData,
): boolean {
  const feature = parseGeometry(zone.geometry);
  if (!feature) return false;

  try {
    const point = turf.point([longitude, latitude]); // GeoJSON uses [lng, lat]
    return turf.booleanPointInPolygon(point, feature);
  } catch (error) {
    console.warn(`Error checking point in zone ${zone.id}:`, error);
    return false;
  }
}

/**
 * Get the zone for an order based on its coordinates
 * Returns the first matching zone, or null if no zone contains the point
 */
export function getZoneForOrder(
  order: OrderWithLocation,
  zones: ZoneData[],
): ZoneData | null {
  const lat =
    typeof order.latitude === "string"
      ? parseFloat(order.latitude)
      : order.latitude;
  const lng =
    typeof order.longitude === "string"
      ? parseFloat(order.longitude)
      : order.longitude;

  if (isNaN(lat) || isNaN(lng)) {
    console.warn(`Invalid coordinates for order ${order.id}`);
    return null;
  }

  // Find first zone that contains this point
  for (const zone of zones) {
    if (!zone.active) continue;
    if (isPointInZone(lat, lng, zone)) {
      return zone;
    }
  }

  return null;
}

/**
 * Check if a zone is active on a given day
 */
export function isZoneActiveOnDay(zone: ZoneData, day: DayOfWeek): boolean {
  const activeDays = parseDays(zone.activeDays);
  // If no days specified, zone is active every day
  if (activeDays.length === 0) return true;
  return activeDays.includes(day);
}

/**
 * Check if a vehicle is assigned to a zone on a given day
 */
export function isVehicleAssignedToZoneOnDay(
  assignment: VehicleZoneAssignment,
  day: DayOfWeek,
): boolean {
  if (!assignment.active) return false;
  const assignedDays = parseDays(assignment.assignedDays);
  // If no days specified, assignment is active every day
  if (assignedDays.length === 0) return true;
  return assignedDays.includes(day);
}

/**
 * Get vehicles that can deliver to a specific zone on a given day
 */
export function getVehiclesForZone(
  zone: ZoneData,
  vehicles: VehicleWithZones[],
  day: DayOfWeek,
): VehicleWithZones[] {
  // Check if zone is active on this day
  if (!isZoneActiveOnDay(zone, day)) {
    return [];
  }

  return vehicles.filter((vehicle) => {
    const assignments = vehicle.zoneAssignments || [];

    // Find assignment for this zone
    const zoneAssignment = assignments.find((a) => a.zoneId === zone.id);

    if (!zoneAssignment) return false;

    // Check if assignment is active on this day
    return isVehicleAssignedToZoneOnDay(zoneAssignment, day);
  });
}

/**
 * Get all zone IDs a vehicle is assigned to on a given day
 */
export function getVehicleZoneIds(
  vehicle: VehicleWithZones,
  day: DayOfWeek,
): string[] {
  const assignments = vehicle.zoneAssignments || [];

  return assignments
    .filter((a) => isVehicleAssignedToZoneOnDay(a, day))
    .map((a) => a.zoneId);
}

/**
 * Check if a vehicle can deliver to any zone (has no zone restrictions)
 */
export function isVehicleUnrestricted(vehicle: VehicleWithZones): boolean {
  const assignments = vehicle.zoneAssignments || [];
  return assignments.length === 0;
}

/**
 * Group orders by their zone
 * Returns a map of zoneId -> orders, plus a special "unzoned" key for orders outside all zones
 */
export function groupOrdersByZone<T extends OrderWithLocation>(
  orders: T[],
  zones: ZoneData[],
): Map<string | "unzoned", T[]> {
  const grouped = new Map<string | "unzoned", T[]>();

  // Initialize all zone groups
  for (const zone of zones) {
    if (zone.active) {
      grouped.set(zone.id, []);
    }
  }
  grouped.set("unzoned", []);

  // Assign each order to its zone
  for (const order of orders) {
    const zone = getZoneForOrder(order, zones);
    const key = zone ? zone.id : "unzoned";

    const list = grouped.get(key) || [];
    list.push(order);
    grouped.set(key, list);
  }

  return grouped;
}

/**
 * Filter vehicles that can handle orders for a specific zone on a given day
 * Includes unrestricted vehicles (those with no zone assignments)
 */
export function filterVehiclesForZone<T extends VehicleWithZones>(
  vehicles: T[],
  zoneId: string | "unzoned",
  day: DayOfWeek,
): T[] {
  return vehicles.filter((vehicle) => {
    // Unrestricted vehicles can deliver anywhere
    if (isVehicleUnrestricted(vehicle)) {
      return true;
    }

    // For unzoned orders, only unrestricted vehicles can handle them
    if (zoneId === "unzoned") {
      return false;
    }

    // Check if vehicle is assigned to this zone on this day
    const zoneIds = getVehicleZoneIds(vehicle, day);
    return zoneIds.includes(zoneId);
  });
}

/**
 * Get the current day of week
 */
export function getCurrentDayOfWeek(): DayOfWeek {
  const days: DayOfWeek[] = [
    "SUNDAY",
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
  ];
  return days[new Date().getDay()];
}

/**
 * Get day of week from a Date object
 */
export function getDayOfWeek(date: Date): DayOfWeek {
  const days: DayOfWeek[] = [
    "SUNDAY",
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
  ];
  return days[date.getDay()];
}

/**
 * Create zone batches for optimization
 * Each batch contains orders for a zone and the vehicles that can service them
 */
export interface ZoneBatch<
  TOrder extends OrderWithLocation,
  TVehicle extends VehicleWithZones,
> {
  zoneId: string | "unzoned";
  zoneName: string;
  orders: TOrder[];
  vehicles: TVehicle[];
}

export function createZoneBatches<
  TOrder extends OrderWithLocation,
  TVehicle extends VehicleWithZones,
>(
  orders: TOrder[],
  vehicles: TVehicle[],
  zones: ZoneData[],
  day: DayOfWeek,
): ZoneBatch<TOrder, TVehicle>[] {
  const batches: ZoneBatch<TOrder, TVehicle>[] = [];

  // Group orders by zone
  const ordersByZone = groupOrdersByZone(orders, zones);

  // Create batch for each zone with orders
  for (const [zoneId, zoneOrders] of ordersByZone.entries()) {
    if (zoneOrders.length === 0) continue;

    const zone = zones.find((z) => z.id === zoneId);
    const eligibleVehicles = filterVehiclesForZone(vehicles, zoneId, day);

    // Only create batch if there are vehicles available
    if (eligibleVehicles.length > 0) {
      batches.push({
        zoneId,
        zoneName: zone?.name || "Sin Zona",
        orders: zoneOrders,
        vehicles: eligibleVehicles,
      });
    } else {
      // No vehicles for this zone - orders will be unassigned
      console.warn(
        `No vehicles available for zone ${zone?.name || zoneId} on ${day}. ${zoneOrders.length} orders will be unassigned.`,
      );
    }
  }

  return batches;
}

/**
 * Calculate zone statistics for reporting
 */
export interface ZoneStats {
  zoneId: string;
  zoneName: string;
  orderCount: number;
  vehicleCount: number;
  coverage: number; // percentage of orders that can be assigned
}

export function calculateZoneStats(
  orders: OrderWithLocation[],
  vehicles: VehicleWithZones[],
  zones: ZoneData[],
  day: DayOfWeek,
): { stats: ZoneStats[]; unzonedCount: number; unassignableCount: number } {
  const stats: ZoneStats[] = [];
  let unzonedCount = 0;
  let unassignableCount = 0;

  const ordersByZone = groupOrdersByZone(orders, zones);

  for (const [zoneId, zoneOrders] of ordersByZone.entries()) {
    if (zoneId === "unzoned") {
      unzonedCount = zoneOrders.length;
      // Check if there are unrestricted vehicles for unzoned orders
      const unrestrictedVehicles = vehicles.filter(isVehicleUnrestricted);
      if (unrestrictedVehicles.length === 0) {
        unassignableCount += zoneOrders.length;
      }
      continue;
    }

    const zone = zones.find((z) => z.id === zoneId);
    const eligibleVehicles = filterVehiclesForZone(vehicles, zoneId, day);

    stats.push({
      zoneId,
      zoneName: zone?.name || "Unknown",
      orderCount: zoneOrders.length,
      vehicleCount: eligibleVehicles.length,
      coverage: eligibleVehicles.length > 0 ? 100 : 0,
    });

    if (eligibleVehicles.length === 0) {
      unassignableCount += zoneOrders.length;
    }
  }

  return { stats, unzonedCount, unassignableCount };
}
