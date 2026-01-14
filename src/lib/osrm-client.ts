/**
 * OSRM Client - Open Source Routing Machine
 *
 * This module provides distance and duration calculations using real road networks.
 * Falls back to Haversine calculations when OSRM is not available.
 *
 * @see http://project-osrm.org/docs/v5.24.0/api/
 */

import {
  type Coordinates,
  calculateDistance as haversineDistance,
} from "./geospatial";

// Configuration
const OSRM_URL = process.env.OSRM_URL || "http://localhost:5001";
const OSRM_TIMEOUT = Number(process.env.OSRM_TIMEOUT) || 30000;

// Cache for OSRM availability status
let osrmAvailable: boolean | null = null;
let lastCheck = 0;
const CHECK_INTERVAL = 30000; // 30 seconds

/**
 * Check if OSRM service is available
 */
export async function isOsrmAvailable(): Promise<boolean> {
  const now = Date.now();

  // Use cached result if recent
  if (osrmAvailable !== null && now - lastCheck < CHECK_INTERVAL) {
    return osrmAvailable;
  }

  try {
    const response = await fetch(`${OSRM_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    osrmAvailable = response.ok;
  } catch {
    // Try a simple route request as fallback health check
    try {
      const response = await fetch(
        `${OSRM_URL}/route/v1/driving/-99.1332,19.4326;-99.1333,19.4327?overview=false`,
        { signal: AbortSignal.timeout(5000) },
      );
      osrmAvailable = response.ok;
    } catch {
      osrmAvailable = false;
    }
  }

  lastCheck = now;
  return osrmAvailable;
}

interface RouteResponse {
  code: string;
  routes?: Array<{
    distance: number; // meters
    duration: number; // seconds
    geometry?: string;
  }>;
}

interface TableResponse {
  code: string;
  durations?: number[][]; // seconds
  distances?: number[][]; // meters
  sources?: Array<{ location: [number, number] }>;
  destinations?: Array<{ location: [number, number] }>;
}

/**
 * Get route between two points using OSRM
 */
export async function getRoute(
  from: Coordinates,
  to: Coordinates,
): Promise<{ distance: number; duration: number } | null> {
  const available = await isOsrmAvailable();

  if (!available) {
    // Fallback to Haversine
    const distance = haversineDistance(from, to);
    // Estimate duration at 40 km/h average urban speed
    const duration = Math.round(distance / ((40 * 1000) / 3600));
    return { distance, duration };
  }

  try {
    const url = `${OSRM_URL}/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=false`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(OSRM_TIMEOUT),
    });

    if (!response.ok) {
      throw new Error(`OSRM error: ${response.status}`);
    }

    const data: RouteResponse = await response.json();

    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
      return null;
    }

    return {
      distance: Math.round(data.routes[0].distance),
      duration: Math.round(data.routes[0].duration),
    };
  } catch (error) {
    console.warn("OSRM route failed, using Haversine fallback:", error);
    const distance = haversineDistance(from, to);
    const duration = Math.round(distance / ((40 * 1000) / 3600));
    return { distance, duration };
  }
}

/**
 * Get distance/duration matrix for multiple points using OSRM Table service
 */
export async function getDistanceMatrix(
  coordinates: Coordinates[],
): Promise<{ distances: number[][]; durations: number[][] }> {
  const n = coordinates.length;

  // Initialize matrices
  const distances: number[][] = Array.from({ length: n }, () =>
    Array(n).fill(0),
  );
  const durations: number[][] = Array.from({ length: n }, () =>
    Array(n).fill(0),
  );

  const available = await isOsrmAvailable();

  if (!available || n < 2) {
    // Fallback to Haversine
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j) {
          const dist = haversineDistance(coordinates[i], coordinates[j]);
          distances[i][j] = dist;
          durations[i][j] = Math.round(dist / ((40 * 1000) / 3600));
        }
      }
    }
    return { distances, durations };
  }

  try {
    // Build coordinates string
    const coordStr = coordinates
      .map((c) => `${c.longitude},${c.latitude}`)
      .join(";");

    const url = `${OSRM_URL}/table/v1/driving/${coordStr}?annotations=distance,duration`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(OSRM_TIMEOUT),
    });

    if (!response.ok) {
      throw new Error(`OSRM error: ${response.status}`);
    }

    const data: TableResponse = await response.json();

    if (data.code !== "Ok") {
      throw new Error(`OSRM table error: ${data.code}`);
    }

    // Copy results
    if (data.distances && data.durations) {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          distances[i][j] = Math.round(data.distances[i][j] || 0);
          durations[i][j] = Math.round(data.durations[i][j] || 0);
        }
      }
    }

    return { distances, durations };
  } catch (error) {
    console.warn("OSRM table failed, using Haversine fallback:", error);

    // Fallback to Haversine
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j) {
          const dist = haversineDistance(coordinates[i], coordinates[j]);
          distances[i][j] = dist;
          durations[i][j] = Math.round(dist / ((40 * 1000) / 3600));
        }
      }
    }
    return { distances, durations };
  }
}

/**
 * Get trip (optimized route through multiple waypoints) using OSRM
 */
export async function getOptimizedTrip(
  coordinates: Coordinates[],
  roundtrip = true,
): Promise<{
  distance: number;
  duration: number;
  waypoints: Array<{ waypointIndex: number; tripIndex: number }>;
} | null> {
  const available = await isOsrmAvailable();

  if (!available || coordinates.length < 2) {
    return null;
  }

  try {
    const coordStr = coordinates
      .map((c) => `${c.longitude},${c.latitude}`)
      .join(";");

    const url = `${OSRM_URL}/trip/v1/driving/${coordStr}?roundtrip=${roundtrip}&overview=false`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(OSRM_TIMEOUT),
    });

    if (!response.ok) {
      throw new Error(`OSRM error: ${response.status}`);
    }

    interface TripResponse {
      code: string;
      trips?: Array<{
        distance: number;
        duration: number;
      }>;
      waypoints?: Array<{
        waypoint_index: number;
        trips_index: number;
      }>;
    }

    const data: TripResponse = await response.json();

    if (data.code !== "Ok" || !data.trips || data.trips.length === 0) {
      return null;
    }

    return {
      distance: Math.round(data.trips[0].distance),
      duration: Math.round(data.trips[0].duration),
      waypoints: (data.waypoints || []).map((wp) => ({
        waypointIndex: wp.waypoint_index,
        tripIndex: wp.trips_index,
      })),
    };
  } catch (error) {
    console.warn("OSRM trip failed:", error);
    return null;
  }
}
