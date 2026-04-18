export interface RouteStop {
  orderId: string;
  trackingId: string;
  sequence: number;
  address: string;
  latitude: string;
  longitude: string;
  // For grouped stops (multiple orders at same location)
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
