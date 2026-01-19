/**
 * Balance Utilities - Post-optimization balancing of orders across vehicles
 *
 * This module provides functions for:
 * - Calculating ideal distribution of stops per vehicle
 * - Redistributing orders between routes
 * - Measuring balance quality
 */

import { calculateDistance, type Coordinates } from "./geospatial";

// Generic route interface for balancing
export interface BalanceableRoute {
  vehicleId: string;
  vehiclePlate: string;
  stops: BalanceableStop[];
  totalWeight: number;
  totalVolume: number;
  maxWeight: number;
  maxVolume: number;
  maxOrders: number;
}

export interface BalanceableStop {
  orderId: string;
  trackingId: string;
  address: string;
  latitude: number;
  longitude: number;
  weight: number;
  volume: number;
  sequence: number;
}

export interface BalanceConfig {
  enabled: boolean;
  // Maximum deviation from ideal (as percentage, 0-100)
  maxDeviation?: number;
  // Preserve route order after redistribution
  preserveSequence?: boolean;
  // Only redistribute within same zone
  respectZones?: boolean;
}

export interface BalanceResult {
  originalScore: number;
  newScore: number;
  movedOrders: number;
  routes: BalanceableRoute[];
}

/**
 * Calculate ideal number of stops per vehicle
 */
export function calculateIdealStopsPerVehicle(
  totalStops: number,
  vehicleCount: number,
): number {
  if (vehicleCount === 0) return 0;
  return Math.ceil(totalStops / vehicleCount);
}

/**
 * Calculate balance score (0-100, higher is better)
 * A perfect balance would score 100
 */
export function getBalanceScore(routes: BalanceableRoute[]): number {
  if (routes.length === 0) return 100;

  const totalStops = routes.reduce((sum, r) => sum + r.stops.length, 0);
  if (totalStops === 0) return 100;

  const idealPerRoute = totalStops / routes.length;

  // Calculate standard deviation
  const deviations = routes.map((r) =>
    Math.pow(r.stops.length - idealPerRoute, 2),
  );
  const variance = deviations.reduce((sum, d) => sum + d, 0) / routes.length;
  const stdDev = Math.sqrt(variance);

  // Normalize to 0-100 score
  // If stdDev is 0, perfect balance = 100
  // Higher stdDev = lower score
  const maxDeviation = idealPerRoute; // Maximum possible deviation
  const normalizedDeviation = stdDev / maxDeviation;
  const score = Math.max(0, Math.round((1 - normalizedDeviation) * 100));

  return score;
}

/**
 * Get balance statistics for a set of routes
 */
export function getBalanceStats(routes: BalanceableRoute[]): {
  totalStops: number;
  minStops: number;
  maxStops: number;
  avgStops: number;
  idealStops: number;
  score: number;
} {
  const stopCounts = routes.map((r) => r.stops.length);
  const totalStops = stopCounts.reduce((sum, c) => sum + c, 0);

  return {
    totalStops,
    minStops: Math.min(...stopCounts),
    maxStops: Math.max(...stopCounts),
    avgStops: routes.length > 0 ? totalStops / routes.length : 0,
    idealStops: calculateIdealStopsPerVehicle(totalStops, routes.length),
    score: getBalanceScore(routes),
  };
}

/**
 * Check if a vehicle can accept more orders
 */
function canAcceptOrder(
  route: BalanceableRoute,
  order: BalanceableStop,
): boolean {
  // Check order limit
  if (route.stops.length >= route.maxOrders) {
    return false;
  }

  // Check weight capacity
  if (route.totalWeight + order.weight > route.maxWeight) {
    return false;
  }

  // Check volume capacity
  if (route.totalVolume + order.volume > route.maxVolume) {
    return false;
  }

  return true;
}

/**
 * Calculate insertion cost for adding an order to a route
 * Lower cost is better
 */
function calculateInsertionCost(
  route: BalanceableRoute,
  order: BalanceableStop,
): number {
  if (route.stops.length === 0) {
    return 0; // Empty route, no cost
  }

  // Find minimum distance to any existing stop
  let minDistance = Infinity;

  for (const stop of route.stops) {
    const distance = calculateDistance(
      { latitude: stop.latitude, longitude: stop.longitude },
      { latitude: order.latitude, longitude: order.longitude },
    );
    minDistance = Math.min(minDistance, distance);
  }

  return minDistance;
}

/**
 * Sort routes by stop count (ascending - fewest first)
 */
function sortByStopCount(routes: BalanceableRoute[]): BalanceableRoute[] {
  return [...routes].sort((a, b) => a.stops.length - b.stops.length);
}

/**
 * Sort routes by stop count (descending - most first)
 */
function sortByStopCountDesc(routes: BalanceableRoute[]): BalanceableRoute[] {
  return [...routes].sort((a, b) => b.stops.length - a.stops.length);
}

/**
 * Redistribute orders to balance routes
 *
 * Strategy:
 * 1. Calculate ideal stops per vehicle
 * 2. Find overloaded routes (above ideal)
 * 3. Try to move orders from overloaded to underloaded routes
 * 4. Respect capacity constraints
 * 5. Minimize distance impact when moving
 */
export function redistributeOrders(
  routes: BalanceableRoute[],
  config: BalanceConfig = { enabled: true },
): BalanceResult {
  if (!config.enabled || routes.length <= 1) {
    return {
      originalScore: getBalanceScore(routes),
      newScore: getBalanceScore(routes),
      movedOrders: 0,
      routes,
    };
  }

  const originalScore = getBalanceScore(routes);
  const totalStops = routes.reduce((sum, r) => sum + r.stops.length, 0);
  const idealStops = calculateIdealStopsPerVehicle(totalStops, routes.length);
  const maxDeviation = config.maxDeviation || 20; // Default 20% deviation allowed

  // Deep copy routes for modification
  const balancedRoutes: BalanceableRoute[] = routes.map((r) => ({
    ...r,
    stops: [...r.stops],
    totalWeight: r.totalWeight,
    totalVolume: r.totalVolume,
  }));

  let movedOrders = 0;
  let iterations = 0;
  const maxIterations = totalStops * 2; // Prevent infinite loop

  while (iterations < maxIterations) {
    iterations++;

    // Find most overloaded route
    const sortedDesc = sortByStopCountDesc(balancedRoutes);
    const overloaded = sortedDesc[0];

    // Find most underloaded route
    const sortedAsc = sortByStopCount(balancedRoutes);
    const underloaded = sortedAsc[0];

    // Check if rebalancing is needed
    const overloadedDeviation =
      ((overloaded.stops.length - idealStops) / idealStops) * 100;
    const underloadedDeviation =
      ((idealStops - underloaded.stops.length) / idealStops) * 100;

    // Stop if within acceptable deviation
    if (
      overloadedDeviation <= maxDeviation &&
      underloadedDeviation <= maxDeviation
    ) {
      break;
    }

    // Stop if no significant difference
    if (overloaded.stops.length - underloaded.stops.length <= 1) {
      break;
    }

    // Find best order to move from overloaded to underloaded
    let bestOrder: BalanceableStop | null = null;
    let bestCost = Infinity;

    for (const stop of overloaded.stops) {
      if (canAcceptOrder(underloaded, stop)) {
        const cost = calculateInsertionCost(underloaded, stop);
        if (cost < bestCost) {
          bestCost = cost;
          bestOrder = stop;
        }
      }
    }

    // Move order if found
    if (bestOrder) {
      // Remove from overloaded
      const orderIndex = overloaded.stops.findIndex(
        (s) => s.orderId === bestOrder!.orderId,
      );
      if (orderIndex !== -1) {
        overloaded.stops.splice(orderIndex, 1);
        overloaded.totalWeight -= bestOrder.weight;
        overloaded.totalVolume -= bestOrder.volume;

        // Add to underloaded
        underloaded.stops.push(bestOrder);
        underloaded.totalWeight += bestOrder.weight;
        underloaded.totalVolume += bestOrder.volume;

        movedOrders++;
      }
    } else {
      // No valid move found, try next pair or exit
      break;
    }
  }

  // Re-sequence stops in modified routes
  if (movedOrders > 0 && !config.preserveSequence) {
    for (const route of balancedRoutes) {
      route.stops.forEach((stop, index) => {
        stop.sequence = index + 1;
      });
    }
  }

  return {
    originalScore,
    newScore: getBalanceScore(balancedRoutes),
    movedOrders,
    routes: balancedRoutes,
  };
}

/**
 * Apply pre-balancing by adjusting maxOrders limits
 * This helps VROOM distribute orders more evenly upfront
 */
export function calculateBalancedMaxOrders(
  totalOrders: number,
  vehicleCount: number,
  defaultMaxOrders: number = 50,
): number {
  if (vehicleCount === 0) return defaultMaxOrders;

  // Calculate ideal per vehicle with 20% buffer
  const ideal = Math.ceil(totalOrders / vehicleCount);
  const withBuffer = Math.ceil(ideal * 1.2);

  // Don't exceed original max
  return Math.min(withBuffer, defaultMaxOrders);
}

/**
 * Get balance improvement potential
 * Estimates how much the balance could improve with redistribution
 */
export function getBalanceImprovementPotential(routes: BalanceableRoute[]): {
  currentScore: number;
  theoreticalBestScore: number;
  improvementPotential: number;
} {
  const currentScore = getBalanceScore(routes);

  // Theoretical best assumes perfect distribution within capacity constraints
  const totalStops = routes.reduce((sum, r) => sum + r.stops.length, 0);
  const totalCapacity = routes.reduce((sum, r) => sum + r.maxOrders, 0);

  // If total capacity exceeds total stops, perfect balance is achievable
  const canAchievePerfect = totalCapacity >= totalStops;
  const theoreticalBestScore = canAchievePerfect ? 100 : currentScore;

  return {
    currentScore,
    theoreticalBestScore,
    improvementPotential: theoreticalBestScore - currentScore,
  };
}
