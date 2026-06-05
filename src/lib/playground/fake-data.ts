/**
 * Fake-data generators for the dev "playground" (test fleets/vehicles/drivers).
 *
 * Pure, dependency-free, and usable on BOTH client and server: the client uses
 * `scatterAround` to preview vehicle origins on the map before generating, and
 * the server uses the name/plate/capacity helpers when inserting the records.
 *
 * Everything generated is tagged with TEST_PREFIX so the cleanup endpoint can
 * find and delete it without a DB migration.
 */

export const TEST_PREFIX = "TEST-";
/** Drivers get a known password so you can log into the mobile app as one. */
export const TEST_DRIVER_PASSWORD = "test1234";
/** Email domain used to tag (and later clean up) generated driver users. */
export const TEST_EMAIL_DOMAIN = "playground.local";

const FIRST_NAMES = [
  "Juan",
  "María",
  "Carlos",
  "Lucía",
  "José",
  "Ana",
  "Luis",
  "Sofía",
  "Miguel",
  "Valentina",
  "Jorge",
  "Camila",
  "Pedro",
  "Daniela",
  "Diego",
  "Fernanda",
  "Andrés",
  "Gabriela",
  "Ricardo",
  "Paula",
];

const LAST_NAMES = [
  "García",
  "Rodríguez",
  "Martínez",
  "López",
  "Gonzáles",
  "Pérez",
  "Sánchez",
  "Ramírez",
  "Torres",
  "Flores",
  "Rivera",
  "Díaz",
  "Vargas",
  "Castillo",
  "Romero",
  "Mendoza",
  "Rojas",
  "Cruz",
  "Reyes",
  "Quispe",
];

const VEHICLE_MODELS: Array<{ brand: string; model: string }> = [
  { brand: "Toyota", model: "Hiace" },
  { brand: "Hyundai", model: "H1" },
  { brand: "Mercedes-Benz", model: "Sprinter" },
  { brand: "Volkswagen", model: "Crafter" },
  { brand: "Nissan", model: "NV350" },
  { brand: "Ford", model: "Transit" },
  { brand: "Renault", model: "Master" },
  { brand: "Iveco", model: "Daily" },
];

/** Peru license categories for light/heavy transport. */
const LICENSE_CATEGORIES = ["A-I", "A-IIa", "A-IIb", "A-IIIa"];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDigits(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

function randomLetters(n: number): string {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O to avoid plate confusion
  let s = "";
  for (let i = 0; i < n; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

export function randomFullName(): string {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

export function randomVehicleModel(): { brand: string; model: string } {
  return pick(VEHICLE_MODELS);
}

export function randomLicenseCategory(): string {
  return pick(LICENSE_CATEGORIES);
}

/** Peruvian-style plate, tagged: "TEST-ABC-123". */
export function randomPlate(): string {
  return `${TEST_PREFIX}${randomLetters(3)}-${randomDigits(3)}`;
}

/** A plausible mobile phone number (Peru). */
export function randomPhone(): string {
  return `+519${randomDigits(8)}`;
}

/** Unique-ish slug for emails/usernames (timestamp-free; caller ensures uniqueness). */
export function randomSlug(): string {
  return `${randomLetters(3).toLowerCase()}${randomDigits(5)}`;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * Scatter `count` points uniformly within `radiusKm` of `center`. Used to
 * preview vehicle origins on the map. Uses an equal-area disk sample so points
 * aren't clustered at the center.
 */
export function scatterAround(
  center: GeoPoint,
  count: number,
  radiusKm: number,
): GeoPoint[] {
  const points: GeoPoint[] = [];
  const kmPerDegLat = 111.32;
  const kmPerDegLng = 111.32 * Math.cos((center.lat * Math.PI) / 180) || 1;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * 2 * Math.PI;
    const r = radiusKm * Math.sqrt(Math.random());
    points.push({
      lat: center.lat + (r * Math.cos(angle)) / kmPerDegLat,
      lng: center.lng + (r * Math.sin(angle)) / kmPerDegLng,
    });
  }
  return points;
}

export interface CapacityProfile {
  enableWeight?: boolean;
  enableVolume?: boolean;
  enableUnits?: boolean;
  enableOrderValue?: boolean;
}

export interface VehicleCapacities {
  weightCapacity: number | null;
  volumeCapacity: number | null;
  maxUnitsCapacity: number | null;
  maxValueCapacity: number | null;
}

export interface CapacityOverrides {
  weight?: number | null;
  volume?: number | null;
  units?: number | null;
  value?: number | null;
}

/**
 * Default vehicle parameters for generated test vehicles. The playground UI
 * pre-fills its inputs with these and the user can override every value.
 */
export const DEFAULT_CAPS = {
  weight: 2000,
  volume: 15,
  units: 200,
  value: 20000,
};
export const DEFAULT_MAX_ORDERS = 25;
export const DEFAULT_WORKDAY_START = "08:00";
export const DEFAULT_WORKDAY_END = "20:00";

/**
 * Capacity values applied to every generated vehicle — ONLY for the dimensions
 * the company's optimization profile has enabled (disabled dimensions stay null
 * so the generated fleet mirrors the real configuration). Values come from the
 * user's overrides, falling back to DEFAULT_CAPS.
 */
export function capacitiesForProfile(
  profile: CapacityProfile,
  overrides: CapacityOverrides = {},
): VehicleCapacities {
  const val = (
    on: boolean | undefined,
    o: number | null | undefined,
    d: number,
  ) => (on ? (o ?? d) : null);
  return {
    weightCapacity: val(
      profile.enableWeight,
      overrides.weight,
      DEFAULT_CAPS.weight,
    ),
    volumeCapacity: val(
      profile.enableVolume,
      overrides.volume,
      DEFAULT_CAPS.volume,
    ),
    maxUnitsCapacity: val(
      profile.enableUnits,
      overrides.units,
      DEFAULT_CAPS.units,
    ),
    maxValueCapacity: val(
      profile.enableOrderValue,
      overrides.value,
      DEFAULT_CAPS.value,
    ),
  };
}

/** Default map center when none is set — Lima, Peru (matches the OSRM region). */
export const DEFAULT_MAP_CENTER: GeoPoint = { lat: -12.0464, lng: -77.0428 };
