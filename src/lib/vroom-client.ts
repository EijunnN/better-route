/**
 * VROOM Client - Vehicle Routing Optimization
 *
 * This module integrates with VROOM (Vehicle Routing Open-source Optimization Machine)
 * for solving the Vehicle Routing Problem (VRP).
 *
 * @see https://github.com/VROOM-Project/vroom/blob/master/docs/API.md
 */

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
  max_travel_time?: number; // Maximum travel time in seconds
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
  // Optimization objectives: "min-cost" (minimize distance) or "min-duration" (minimize time)
  // Can be combined with weights, e.g., [{"type": "min-cost", "weight": 1}, {"type": "min-duration", "weight": 2}]
  objectives?: Array<{ type: "min-cost" | "min-duration"; weight?: number }>;
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
const VROOM_TIMEOUT = Number(process.env.VROOM_TIMEOUT) || 60000; // 60 seconds

/**
 * Check if VROOM service is available
 */
export async function isVroomAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${VROOM_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Solve a Vehicle Routing Problem using VROOM
 */
export async function solveVRP(request: VroomRequest): Promise<VroomResponse> {
  const response = await fetch(VROOM_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(VROOM_TIMEOUT),
  });

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

/**
 * Convert time window string (HH:MM) to VROOM format
 */
export function parseTimeWindow(timeStr: string): number {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 3600 + (minutes || 0) * 60;
}

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
    service: options?.service || 300, // Default 5 minutes service time
  };

  if (options?.description) job.description = options.description;
  if (options?.delivery) job.delivery = options.delivery;
  if (options?.skills) job.skills = options.skills;
  if (options?.priority) job.priority = options.priority;

  if (options?.timeWindowStart && options?.timeWindowEnd) {
    job.time_windows = [
      [
        parseTimeWindow(options.timeWindowStart),
        parseTimeWindow(options.timeWindowEnd),
      ],
    ];
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
    maxTravelTime?: number; // Maximum travel time in seconds
    openStart?: boolean; // Don't set start location
    openEnd?: boolean; // Don't set end location
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
  if (options?.maxTravelTime) vehicle.max_travel_time = options.maxTravelTime;

  if (options?.timeWindowStart && options?.timeWindowEnd) {
    vehicle.time_window = [
      parseTimeWindow(options.timeWindowStart),
      parseTimeWindow(options.timeWindowEnd),
    ];
  }

  return vehicle;
}
