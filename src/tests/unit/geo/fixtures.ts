import { afterEach, beforeEach } from "bun:test";
import type {
  DayOfWeek,
  VehicleWithZones,
  VehicleZoneAssignment,
  ZoneData,
} from "@/lib/geo/zone-utils";

/**
 * zone-utils narrates every degraded path through `console.warn` (corrupt
 * polygon, unroutable zone, bad coordinates). Muting it keeps the suite output
 * readable while still letting a test assert that the warning fired.
 *
 * Call inside a `describe` — it installs its own beforeEach/afterEach.
 */
export function muteWarnings() {
  const original = console.warn;
  let calls = 0;

  beforeEach(() => {
    calls = 0;
    console.warn = () => {
      calls += 1;
    };
  });
  afterEach(() => {
    console.warn = original;
  });

  return {
    get calls() {
      return calls;
    },
  };
}

/**
 * Synthetic grid coordinates instead of real Lima ones: these tests reason
 * about polygon borders down to the vertex, and round numbers make "is this
 * point on the edge or a hair outside it?" an unambiguous question.
 *
 * The grid is laid out in GeoJSON order — [lng, lat] — because that is the
 * axis swap the module has to get right when it calls `turf.point`.
 */
export const ZONE_SIZE = 10;

interface SquareZoneOptions {
  minLng?: number;
  minLat?: number;
  size?: number;
  type?: string;
  active?: boolean;
  activeDays?: string[] | null;
  name?: string;
}

/** Closed, axis-aligned square ring anchored at (minLng, minLat). */
export function squareZone(
  id: string,
  options: SquareZoneOptions = {},
): ZoneData {
  const {
    minLng = 0,
    minLat = 0,
    size = ZONE_SIZE,
    type = "DELIVERY",
    active = true,
    activeDays = null,
    name = id,
  } = options;

  const maxLng = minLng + size;
  const maxLat = minLat + size;

  return {
    id,
    name,
    active,
    type,
    activeDays,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [minLng, minLat],
          [maxLng, minLat],
          [maxLng, maxLat],
          [minLng, maxLat],
          [minLng, minLat],
        ],
      ],
    },
  };
}

/** Same square but with a caller-supplied (possibly broken) ring. */
export function zoneWithRing(id: string, ring: number[][]): ZoneData {
  return {
    id,
    name: id,
    active: true,
    type: "DELIVERY",
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

/** Zone carrying an arbitrary geometry blob — for the parse-failure cases. */
export function zoneWithGeometry(id: string, geometry: unknown): ZoneData {
  return { id, name: id, active: true, type: "DELIVERY", geometry };
}

/**
 * Generic in the coordinate types so numeric fixtures stay numeric — the
 * geometry assertions need `latitude` to be a `number`, not the
 * `number | string` union that `OrderWithLocation` allows.
 */
export function order<L extends number | string, G extends number | string>(
  id: string,
  latitude: L,
  longitude: G,
): { id: string; latitude: L; longitude: G } {
  return { id, latitude, longitude };
}

/** Vehicle with no zone assignments — allowed everywhere. */
export function unrestrictedVehicle(id: string): VehicleWithZones {
  return { id, zoneAssignments: [] };
}

export function assignment(
  vehicleId: string,
  zoneId: string,
  overrides: Partial<VehicleZoneAssignment> = {},
): VehicleZoneAssignment {
  return { zoneId, vehicleId, active: true, assignedDays: null, ...overrides };
}

/** Vehicle restricted to the given zones (every day, unless overridden). */
export function zonedVehicle(
  id: string,
  zoneIds: string[],
  overrides: Partial<VehicleZoneAssignment> = {},
): VehicleWithZones {
  return {
    id,
    zoneAssignments: zoneIds.map((zoneId) => assignment(id, zoneId, overrides)),
  };
}

export const ALL_DAYS: DayOfWeek[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

/**
 * xorshift32 — deterministic across runs and platforms, so the property-style
 * isolation test either always passes or always fails on a given commit.
 */
export function makeRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}
