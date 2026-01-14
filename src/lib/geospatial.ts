/**
 * Geospatial utilities for Story 17.1: Optimización de Consultas Geoespaciales
 *
 * This module provides distance calculations using Haversine formula.
 * Falls back to JavaScript calculation when PostGIS is not available.
 */

import { CACHE_TTL, cacheGet, cacheSet } from "./cache";

// Distance result in meters and seconds
export interface DistanceResult {
  distanceMeters: number;
  durationSeconds: number;
}

// Coordinate pair
export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Calculate the distance between two points using Haversine formula
 * Returns distance in meters
 *
 * @param from - Starting coordinates
 * @param to - Ending coordinates
 * @returns Distance in meters
 */
export function calculateDistance(from: Coordinates, to: Coordinates): number {
  const R = 6371000; // Earth's radius in meters
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const deltaLat = ((to.latitude - from.latitude) * Math.PI) / 180;
  const deltaLon = ((to.longitude - from.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Calculate the distance between two points with duration estimation
 * Uses an average speed of 40 km/h in urban areas for duration calculation
 *
 * @param from - Starting coordinates
 * @param to - Ending coordinates
 * @returns Distance in meters and estimated duration in seconds
 */
export function calculateDistanceWithDuration(
  from: Coordinates,
  to: Coordinates,
): DistanceResult {
  const distanceMeters = calculateDistance(from, to);

  // Average urban speed: 40 km/h = ~11.11 m/s
  const averageSpeedMetersPerSecond = (40 * 1000) / 3600;
  const durationSeconds = Math.round(
    distanceMeters / averageSpeedMetersPerSecond,
  );

  return {
    distanceMeters,
    durationSeconds,
  };
}

/**
 * Calculate distance from coordinates to another point
 *
 * @param from - Starting coordinates
 * @param to - Target coordinates
 * @returns Distance in meters and estimated duration in seconds
 */
export function calculateDistanceFromCoords(
  from: Coordinates,
  to: Coordinates,
): DistanceResult {
  return calculateDistanceWithDuration(from, to);
}

/**
 * Calculate distance matrix for multiple points
 * Caches results in Redis for improved performance
 *
 * @param coordinates - Array of coordinates
 * @param companyId - Company ID for cache namespacing
 * @returns Distance matrix as 2D array [i][j] = distance from i to j
 */
export async function calculateDistanceMatrix(
  coordinates: Coordinates[],
  companyId: string,
): Promise<number[][]> {
  const n = coordinates.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  // Create cache key from sorted coordinate pairs
  const coordKey = coordinates
    .map((c) => `${c.latitude.toFixed(6)},${c.longitude.toFixed(6)}`)
    .sort()
    .join("|");
  const cacheKey = `geospatial:distance_matrix:${companyId}:${coordKey}`;

  // Try to get from cache
  const cached = await cacheGet<number[][]>(cacheKey);
  if (cached) {
    return cached;
  }

  // Calculate distances using Haversine formula
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const distance = calculateDistance(coordinates[i], coordinates[j]);
      matrix[i][j] = distance;
      matrix[j][i] = distance; // Symmetric matrix
    }
  }

  // Cache the result (24 hours TTL for distance matrices)
  await cacheSet(cacheKey, matrix, CACHE_TTL.GEOCODING);

  return matrix;
}

/**
 * Check if a point is within a given radius from center
 *
 * @param center - Center coordinates
 * @param point - Point coordinates
 * @param radiusMeters - Search radius in meters
 * @returns True if point is within radius
 */
export function isWithinRadius(
  center: Coordinates,
  point: Coordinates,
  radiusMeters: number,
): boolean {
  const distance = calculateDistance(center, point);
  return distance <= radiusMeters;
}

/**
 * Calculate total route distance passing through multiple stops
 *
 * @param stops - Array of coordinates in order
 * @returns Total distance in meters and total duration in seconds
 */
export function calculateRouteDistance(stops: Coordinates[]): DistanceResult {
  if (stops.length < 2) {
    return { distanceMeters: 0, durationSeconds: 0 };
  }

  let totalDistance = 0;

  for (let i = 0; i < stops.length - 1; i++) {
    const distance = calculateDistance(stops[i], stops[i + 1]);
    totalDistance += distance;
  }

  const averageSpeedMetersPerSecond = (40 * 1000) / 3600;
  const durationSeconds = Math.round(
    totalDistance / averageSpeedMetersPerSecond,
  );

  return {
    distanceMeters: totalDistance,
    durationSeconds,
  };
}

/**
 * Batch calculate distances for multiple pairs using Haversine
 *
 * @param pairs - Array of coordinate pairs
 * @returns Array of distances in meters
 */
export function batchCalculateDistances(
  pairs: Array<{ from: Coordinates; to: Coordinates }>,
): number[] {
  return pairs.map((p) => calculateDistance(p.from, p.to));
}

/**
 * Invalidate distance matrix cache for a company
 * Should be called when orders are updated or new orders are added
 *
 * @param companyId - Company ID
 */
export async function invalidateDistanceCache(
  _companyId: string,
): Promise<void> {
  // Use cache pattern to invalidate - the cache will be rebuilt on next access
  // For now we rely on TTL expiration, but this function can be extended
  // to use a more explicit invalidation strategy if needed
}
