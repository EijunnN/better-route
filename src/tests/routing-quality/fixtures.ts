import type {
  OptimizerOrder,
  OptimizerVehicle,
  OptimizerDepot,
  OptimizerConfig,
} from "@/lib/optimization/optimizer-interface";

/**
 * Lima, Peru coordinate cluster. OSRM container is loaded with peru-latest.
 * Depot at Plaza de Armas. Customer points within ~5-15 km radius.
 */
export const LIMA_DEPOT: OptimizerDepot = {
  latitude: -12.046374,
  longitude: -77.042793,
  address: "Plaza de Armas, Cercado de Lima",
};

/** Small cluster of coordinates around Lima for building scenarios. */
export const LIMA_POINTS: Array<{ lat: number; lng: number; name: string }> = [
  { lat: -12.0564, lng: -77.0366, name: "La Victoria" },
  { lat: -12.1180, lng: -77.0269, name: "Miraflores" },
  { lat: -12.0908, lng: -77.0502, name: "San Isidro" },
  { lat: -12.1461, lng: -77.0197, name: "Barranco" },
  { lat: -12.0631, lng: -77.0365, name: "Centro 1" },
  { lat: -12.0719, lng: -77.0889, name: "Callao 1" },
  { lat: -12.0862, lng: -77.0813, name: "San Miguel" },
  { lat: -12.1089, lng: -77.0370, name: "Lince" },
  { lat: -12.1352, lng: -77.0223, name: "Chorrillos Norte" },
  { lat: -12.0267, lng: -77.0543, name: "San Martín de Porres" },
  { lat: -11.9855, lng: -77.0658, name: "Los Olivos" },
  { lat: -12.0433, lng: -77.0251, name: "Breña" },
  { lat: -12.1608, lng: -77.0183, name: "Chorrillos Sur" },
  { lat: -12.0754, lng: -77.0121, name: "La Molina Oeste" },
  { lat: -12.0975, lng: -76.9879, name: "Ate" },
  { lat: -12.0511, lng: -77.0876, name: "Pueblo Libre" },
  { lat: -12.0322, lng: -77.0471, name: "Rimac" },
  { lat: -11.9937, lng: -77.0055, name: "San Juan Lurigancho" },
  { lat: -12.1717, lng: -76.9745, name: "San Juan Miraflores" },
  { lat: -12.2154, lng: -76.9278, name: "Villa El Salvador" },
];

export function makeOrder(
  idx: number,
  overrides: Partial<OptimizerOrder> = {},
): OptimizerOrder {
  const point = LIMA_POINTS[idx % LIMA_POINTS.length];
  return {
    id: `order-${String(idx).padStart(3, "0")}`,
    trackingId: `TRK-${String(idx).padStart(5, "0")}`,
    address: point.name,
    latitude: point.lat,
    longitude: point.lng,
    weightRequired: 10,
    volumeRequired: 1,
    serviceTime: 300,
    ...overrides,
  };
}

export function makeVehicle(
  idx: number,
  overrides: Partial<OptimizerVehicle> = {},
): OptimizerVehicle {
  return {
    id: `vehicle-${String(idx).padStart(2, "0")}`,
    identifier: `VEH-${idx}`,
    maxWeight: 1000,
    maxVolume: 100,
    originLatitude: LIMA_DEPOT.latitude,
    originLongitude: LIMA_DEPOT.longitude,
    ...overrides,
  };
}

export function baseConfig(overrides: Partial<OptimizerConfig> = {}): OptimizerConfig {
  return {
    depot: LIMA_DEPOT,
    objective: "BALANCED",
    timeoutMs: 60000,
    ...overrides,
  };
}
