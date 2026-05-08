// route-map keeps a local presentation shape (lat/lng as strings) because
// the rendering pipeline below mixes string interpolation, geometry parsing,
// and DOM attributes that all expect strings. The canonical SolvedPlan uses
// numbers; `fromCanonicalRoute` and friends convert at the boundary.

import type {
  AssignedSolvedRoute,
  SolvedStop,
  UnassignedOrderRecord,
  VehicleWithoutRoute as CanonicalVehicleWithoutRoute,
} from "@/lib/optimization/solved-plan";
import type maplibregl from "maplibre-gl";

export interface RouteStop {
  orderId: string;
  trackingId: string;
  sequence: number;
  address: string;
  latitude: string;
  longitude: string;
  groupedOrderIds?: string[];
  groupedTrackingIds?: string[];
}

export interface Route {
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
  stops: RouteStop[];
  totalDistance: number;
  totalDuration: number;
  geometry?: string;
}

export interface UnassignedOrder {
  orderId: string;
  trackingId: string;
  reason: string;
  latitude?: string;
  longitude?: string;
  address?: string;
}

export interface VehicleWithoutRoute {
  id: string;
  plate: string;
  originLatitude?: string;
  originLongitude?: string;
}

export interface Zone {
  id: string;
  name: string;
  geometry: {
    type: string;
    coordinates: number[][][];
  };
  color: string | null;
  active: boolean;
  vehicleCount: number;
  vehicles: Array<{ id: string; plate: string | null }>;
}

export interface RouteMapProps {
  routes: Route[];
  depot?: {
    latitude: number;
    longitude: number;
  };
  unassignedOrders?: UnassignedOrder[];
  vehiclesWithoutRoutes?: VehicleWithoutRoute[];
  zones?: Zone[];
  selectedRouteId?: string | null;
  onRouteSelect?: (routeId: string | null) => void;
  variant?: "card" | "fullscreen";
  showLegend?: boolean;
  showDepot?: boolean;
  onMapReady?: (map: maplibregl.Map) => void;
  /** Order IDs that should be highlighted as selected (for pencil selection feedback) */
  highlightedOrderIds?: string[];
}

// ─── Canonical → presentation adapters ────────────────────────────────

function stopFromCanonical(s: SolvedStop): RouteStop {
  return {
    orderId: s.orderId,
    trackingId: s.trackingId,
    sequence: s.sequence,
    address: s.address,
    latitude: String(s.latitude),
    longitude: String(s.longitude),
    groupedOrderIds: s.groupedOrderIds,
    groupedTrackingIds: s.groupedTrackingIds,
  };
}

export function fromCanonicalRoute(r: AssignedSolvedRoute): Route {
  return {
    routeId: r.routeId,
    vehicleId: r.vehicleId,
    vehiclePlate: r.vehicleIdentifier,
    driverId: r.driverId,
    driverName: r.driverName,
    driverOrigin: r.driverOrigin
      ? {
          latitude: String(r.driverOrigin.latitude),
          longitude: String(r.driverOrigin.longitude),
          address: r.driverOrigin.address,
        }
      : undefined,
    stops: r.stops.map(stopFromCanonical),
    totalDistance: r.totalDistance,
    totalDuration: r.totalDuration,
    geometry: r.geometry,
  };
}

export function fromCanonicalUnassigned(
  u: UnassignedOrderRecord,
): UnassignedOrder {
  return {
    orderId: u.orderId,
    trackingId: u.trackingId,
    reason: u.reason,
    latitude: u.latitude !== undefined ? String(u.latitude) : undefined,
    longitude: u.longitude !== undefined ? String(u.longitude) : undefined,
    address: u.address,
  };
}

export function fromCanonicalVehicleWithoutRoute(
  v: CanonicalVehicleWithoutRoute,
): VehicleWithoutRoute {
  return {
    id: v.id,
    plate: v.plate,
    originLatitude:
      v.originLatitude !== undefined ? String(v.originLatitude) : undefined,
    originLongitude:
      v.originLongitude !== undefined ? String(v.originLongitude) : undefined,
  };
}
