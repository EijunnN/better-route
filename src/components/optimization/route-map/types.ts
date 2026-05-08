// route-map renders the canonical SolvedPlan shapes directly. Coordinates
// are numbers; the renderer calls String(...) at the few HTML/CSS injection
// sites where strings are required.

import type {
  AssignedSolvedRoute,
  SolvedStop,
  UnassignedOrderRecord,
  VehicleWithoutRoute,
} from "@/lib/optimization/solved-plan";
import type maplibregl from "maplibre-gl";

export type RouteStop = SolvedStop;
export type Route = AssignedSolvedRoute;
export type UnassignedOrder = UnassignedOrderRecord;
export type { VehicleWithoutRoute };

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
