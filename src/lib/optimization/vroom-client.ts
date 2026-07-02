/**
 * VROOM Client - Vehicle Routing Optimization
 *
 * This module integrates with VROOM (Vehicle Routing Open-source Optimization Machine)
 * for solving the Vehicle Routing Problem (VRP).
 *
 * @see https://github.com/VROOM-Project/vroom/blob/master/docs/API.md
 */

import { DEFAULT_SERVICE_TIME_SECONDS } from "./constants";
import { parseTimeWindow } from "./time-window-policy";

// VROOM API types
export interface VroomLocation {
  id: number;
  description?: string;
  location: [number, number]; // [longitude, latitude]
  setup?: number; // Setup time in seconds
  service?: number; // Service time in seconds
}

export interface VroomJob {
  id: number;
  description?: string;
  location: [number, number]; // [longitude, latitude]
  service?: number; // Service time in seconds
  delivery?: number[]; // Delivery quantities
  pickup?: number[]; // Pickup quantities
  skills?: number[]; // Required skills
  priority?: number; // Priority (0-100, higher = more important)
  time_windows?: Array<[number, number]>; // [[start, end], ...]
}

export interface VroomVehicle {
  id: number;
  profile?: string;
  description?: string;
  start?: [number, number]; // [longitude, latitude]
  end?: [number, number]; // [longitude, latitude]
  capacity?: number[]; // Capacity per dimension
  skills?: number[]; // Available skills
  time_window?: [number, number]; // [start, end]
  breaks?: Array<{
    id: number;
    time_windows: Array<[number, number]>;
    service?: number;
  }>;
  speed_factor?: number; // Multiplier for travel time
  max_tasks?: number; // Maximum number of tasks
  max_distance?: number; // Maximum distance in meters (VROOM enforces during solve)
  /**
   * Cost model per vehicle (VROOM 1.14). The solver minimizes
   * `fixed + per_hour * duration + per_km * distance` — this is how the
   * DISTANCE/TIME/BALANCED objective is actually expressed (defaults:
   * fixed 0, per_hour 3600, per_km 0 = pure duration).
   */
  costs?: {
    fixed?: number;
    per_hour?: number;
    per_km?: number;
  };
}

export interface VroomShipment {
  pickup: VroomJob;
  delivery: VroomJob;
  amount?: number[];
  skills?: number[];
  priority?: number;
}

export interface VroomRequest {
  jobs?: VroomJob[];
  shipments?: VroomShipment[];
  vehicles: VroomVehicle[];
  options?: {
    g?: boolean; // Return geometry
    c?: boolean; // Return cost matrices
  };
}

export interface VroomStep {
  type: "start" | "end" | "job" | "pickup" | "delivery" | "break";
  location?: [number, number];
  id?: number;
  service?: number;
  waiting_time?: number;
  job?: number;
  load?: number[];
  arrival?: number;
  duration?: number;
  violations?: Array<{
    cause: string;
    duration?: number;
  }>;
  distance?: number;
}

export interface VroomRoute {
  vehicle: number;
  cost: number;
  delivery?: number[];
  pickup?: number[];
  service: number;
  duration: number;
  waiting_time: number;
  priority: number;
  steps: VroomStep[];
  violations?: Array<{
    cause: string;
    duration?: number;
  }>;
  geometry?: string; // Encoded polyline
  distance?: number;
}

export interface VroomUnassigned {
  id: number;
  type: "job" | "shipment";
  location?: [number, number];
  description?: string;
}

export interface VroomResponse {
  code: number;
  error?: string;
  summary?: {
    cost: number;
    routes: number;
    unassigned: number;
    delivery?: number[];
    pickup?: number[];
    service: number;
    duration: number;
    waiting_time: number;
    priority: number;
    violations?: Array<{
      cause: string;
      duration?: number;
    }>;
    computing_times?: {
      loading?: number;
      solving?: number;
      routing?: number;
    };
    distance?: number;
  };
  routes?: VroomRoute[];
  unassigned?: VroomUnassigned[];
}

// Configuration
const VROOM_URL = process.env.VROOM_URL || "http://localhost:5000";
// Client timeout must exceed vroom-express's server-side timeout (300s in
// docker/vroom/config.yml) so the server limit governs. A shorter client
// timeout aborts large solves the server would have finished — and keeps
// burning VROOM CPU for the full server window anyway.
const VROOM_TIMEOUT = Number(process.env.VROOM_TIMEOUT) || 310000;

/**
 * Check if VROOM service is available
 * Send a minimal valid request with Lima coordinates to verify connectivity
 */
export async function isVroomAvailable(): Promise<boolean> {
  try {
    // Send a minimal request with valid Lima coordinates
    const testRequest = {
      vehicles: [
        {
          id: 1,
          start: [-77.0428, -12.0464], // Lima centro
          end: [-77.0428, -12.0464],
        },
      ],
      jobs: [
        {
          id: 1,
          location: [-77.03, -12.05], // Nearby in Lima
        },
      ],
    };
    const response = await fetch(VROOM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testRequest),
      signal: AbortSignal.timeout(5000),
    });

    if (response.status !== 200) return false;

    const result = await response.json();
    // code 0 = success, code 1 = internal error, code 2 = input error, code 3 = routing error
    // We consider it available if VROOM responds (even with routing errors)
    return result.code === 0 || result.code === 3;
  } catch {
    return false;
  }
}

/**
 * Solve a Vehicle Routing Problem using VROOM.
 *
 * `signal` (optional) is the caller's abort signal — combined with the HTTP
 * timeout so cancelling the optimization job actually cuts the in-flight
 * request instead of letting VROOM burn CPU on a result nobody will read.
 */
export async function solveVRP(
  request: VroomRequest,
  signal?: AbortSignal,
): Promise<VroomResponse> {
  const timeoutSignal = AbortSignal.timeout(VROOM_TIMEOUT);
  const effectiveSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;

  let response: Response;
  try {
    response = await fetch(VROOM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: effectiveSignal,
    });
  } catch (error) {
    if (signal?.aborted) {
      throw new Error("Optimización cancelada");
    }
    if (timeoutSignal.aborted) {
      throw new Error(
        `VROOM no respondió dentro del límite de ${Math.round(VROOM_TIMEOUT / 1000)}s. ` +
          `El problema puede ser demasiado grande o el servicio está sobrecargado.`,
      );
    }
    throw new Error(
      `No se pudo conectar a VROOM (${VROOM_URL}): ${error instanceof Error ? error.message : "error de red"}`,
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`VROOM error: ${response.status} - ${errorText}`);
  }

  const result: VroomResponse = await response.json();

  if (result.code !== 0) {
    throw new Error(
      `VROOM optimization failed: ${result.error || "Unknown error"}`,
    );
  }

  return result;
}

/**
 * Convert timestamp to VROOM time format (seconds since midnight or Unix timestamp)
 */
export function toVroomTime(date: Date): number {
  // VROOM uses seconds since midnight for time windows
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  return hours * 3600 + minutes * 60 + seconds;
}

// Window parsing lives in the shared policy module so the verifier applies
// the exact same "valid window" predicate as this request builder (A7).
export { parseTimeWindow };

/**
 * Helper to create a basic job from order data
 */
export function createVroomJob(
  id: number,
  longitude: number,
  latitude: number,
  options?: {
    description?: string;
    service?: number;
    delivery?: number[];
    skills?: number[];
    priority?: number;
    timeWindowStart?: string;
    timeWindowEnd?: string;
  },
): VroomJob {
  const job: VroomJob = {
    id,
    location: [longitude, latitude],
    service: options?.service || DEFAULT_SERVICE_TIME_SECONDS,
  };

  if (options?.description) job.description = options.description;
  if (options?.delivery) job.delivery = options.delivery;
  if (options?.skills) job.skills = options.skills;
  // `!== undefined` (not truthy): priority 0 is a valid VROOM value and the
  // old check silently dropped it. VROOM accepts [0, 100].
  if (options?.priority !== undefined) {
    job.priority = Math.max(0, Math.min(100, Math.round(options.priority)));
  }

  if (options?.timeWindowStart && options?.timeWindowEnd) {
    const start = parseTimeWindow(options.timeWindowStart);
    const end = parseTimeWindow(options.timeWindowEnd);
    // Only set time_windows if both values are valid
    if (start !== null && end !== null && start <= end) {
      job.time_windows = [[start, end]];
    }
  }

  return job;
}

/**
 * Helper to create a vehicle from vehicle data
 */
export function createVroomVehicle(
  id: number,
  startLongitude: number | undefined,
  startLatitude: number | undefined,
  options?: {
    description?: string;
    endLongitude?: number;
    endLatitude?: number;
    capacity?: number[];
    skills?: number[];
    timeWindowStart?: string;
    timeWindowEnd?: string;
    maxTasks?: number;
    speedFactor?: number;
    maxDistanceMeters?: number; // Max route distance — VROOM enforces natively
    costs?: VroomVehicle["costs"]; // Objective expressed as cost model
    openStart?: boolean; // Don't set start location
    openEnd?: boolean; // Don't set end location
    // Break / lunch configuration
    hasBreakTime?: boolean;
    breakDuration?: number; // minutes
    breakTimeStart?: string; // HH:MM or HH:MM:SS
    breakTimeEnd?: string; // HH:MM or HH:MM:SS
  },
): VroomVehicle {
  const vehicle: VroomVehicle = {
    id,
    profile: "car",
  };

  // Set start location unless openStart is true
  if (
    !options?.openStart &&
    startLongitude !== undefined &&
    startLatitude !== undefined
  ) {
    vehicle.start = [startLongitude, startLatitude];
  }

  if (options?.description) vehicle.description = options.description;

  // Set end location based on options
  if (!options?.openEnd) {
    if (
      options?.endLongitude !== undefined &&
      options?.endLatitude !== undefined
    ) {
      vehicle.end = [options.endLongitude, options.endLatitude];
    } else if (
      startLongitude !== undefined &&
      startLatitude !== undefined &&
      !options?.openStart
    ) {
      // Return to start by default (if start is set)
      vehicle.end = [startLongitude, startLatitude];
    }
  }
  // If openEnd is true, don't set end location at all

  if (options?.capacity) vehicle.capacity = options.capacity;
  if (options?.skills) vehicle.skills = options.skills;
  if (options?.maxTasks) vehicle.max_tasks = options.maxTasks;
  if (options?.speedFactor) vehicle.speed_factor = options.speedFactor;
  if (options?.maxDistanceMeters) {
    vehicle.max_distance = Math.round(options.maxDistanceMeters);
  }
  if (options?.costs) vehicle.costs = options.costs;

  if (options?.timeWindowStart && options?.timeWindowEnd) {
    const start = parseTimeWindow(options.timeWindowStart);
    const end = parseTimeWindow(options.timeWindowEnd);
    // Only set time_window if both values are valid
    if (start !== null && end !== null && start <= end) {
      vehicle.time_window = [start, end];
    }
  }

  // Add break/lunch only when the vehicle has it enabled and a complete,
  // well-formed window. `hasBreakTime === false` explicitly suppresses the
  // break even if stale window fields linger; undefined stays backward
  // compatible (e.g. callers/tests that don't pass the flag).
  if (
    options?.hasBreakTime !== false &&
    options?.breakDuration &&
    options?.breakTimeStart &&
    options?.breakTimeEnd
  ) {
    const breakStart = parseTimeWindow(options.breakTimeStart);
    const breakEnd = parseTimeWindow(options.breakTimeEnd);
    if (breakStart !== null && breakEnd !== null && breakStart < breakEnd) {
      vehicle.breaks = [
        {
          id: id * 1000, // unique break ID per vehicle
          time_windows: [[breakStart, breakEnd]],
          service: options.breakDuration * 60, // convert minutes to seconds
        },
      ];
    }
  }

  return vehicle;
}
