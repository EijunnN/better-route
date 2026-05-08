/**
 * Input shapes the verifier expects: a normalised view of the optimization
 * configuration plus its orders and vehicles. These are the **inputs** to the
 * solver as the verifier sees them — distinct from the canonical SolvedPlan
 * which is the **output** the verifier checks against.
 *
 * Lives inside `verifier/` because it's the verifier's contract; consumers
 * (the runner via `verifyPlan`) build these from their own raw shapes.
 */

import type { ProfileSchema } from "@/lib/orders/profile-schema";

export interface OptimizerOrder {
  id: string;
  trackingId: string;
  address: string;
  latitude: number;
  longitude: number;
  // Capacity requirements (dynamic based on profile)
  weightRequired: number;
  volumeRequired: number;
  orderValue?: number;
  unitsRequired?: number;
  // Prioritization
  orderType?: "NEW" | "RESCHEDULED" | "URGENT";
  priority?: number;
  // Time constraints
  timeWindowStart?: string;
  timeWindowEnd?: string;
  serviceTime?: number; // seconds
  // Skill requirements
  skillsRequired?: string[];
  // Zone assignment
  zoneId?: string;
}

export interface OptimizerVehicle {
  id: string;
  identifier: string; // plate or name
  maxWeight: number;
  maxVolume: number;
  maxValueCapacity?: number;
  maxUnitsCapacity?: number;
  maxOrders?: number;
  originLatitude?: number;
  originLongitude?: number;
  skills?: string[];
  speedFactor?: number;
  timeWindowStart?: string;
  timeWindowEnd?: string;
  hasBreakTime?: boolean;
  breakDuration?: number;
  breakTimeStart?: string;
  breakTimeEnd?: string;
}

export interface OptimizerDepot {
  latitude: number;
  longitude: number;
  address?: string;
  timeWindowStart?: string;
  timeWindowEnd?: string;
}

export interface OptimizerConfig {
  depot: OptimizerDepot;
  objective: "DISTANCE" | "TIME" | "BALANCED";
  profile?: ProfileSchema;
  balanceVisits?: boolean;
  maxDistanceKm?: number;
  maxTravelTimeMinutes?: number;
  trafficFactor?: number;
  routeEndMode?: "DRIVER_ORIGIN" | "SPECIFIC_DEPOT" | "OPEN_END";
  endDepot?: OptimizerDepot;
  openStart?: boolean;
  minimizeVehicles?: boolean;
  flexibleTimeWindows?: boolean;
  maxRoutes?: number;
  timeoutMs?: number;
}
