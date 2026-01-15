import { z } from "zod";

export const VEHICLE_STATUS = [
  "AVAILABLE",
  "IN_MAINTENANCE",
  "ASSIGNED",
  "INACTIVE",
] as const;
export const VEHICLE_TYPES = [
  "TRUCK",
  "VAN",
  "SEMI_TRUCK",
  "PICKUP",
  "TRAILER",
  "REFRIGERATED_TRUCK",
] as const;
export const LICENSE_CATEGORIES = [
  "B",
  "C",
  "C1",
  "CE",
  "D",
  "D1",
  "DE",
] as const;

// Load types for vehicles
export const LOAD_TYPES = [
  "PACKAGES",
  "PALLETS",
  "BULK",
  "REFRIGERATED",
  "DANGEROUS",
] as const;

// Time format regex (HH:MM or HH:MM:SS)
const TIME_FORMAT = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;

// Helper to transform empty strings to null
const emptyStringToNull = (val: unknown) =>
  val === "" ? null : val;

// Helper to normalize time values (strip seconds and handle empty)
const normalizeTime = (val: unknown): string | null => {
  if (val === "" || val === null || val === undefined) return null;
  if (typeof val !== "string") return null;
  // Strip seconds if present (07:00:00 -> 07:00)
  const match = val.match(/^(\d{1,2}:\d{2})(:\d{2})?$/);
  return match ? match[1] : val;
};

// New vehicle schema
export const vehicleSchema = z
  .object({
    // Identification
    name: z
      .string()
      .min(1, "Nombre es requerido")
      .max(255, "Nombre demasiado largo"),
    useNameAsPlate: z.boolean().default(false),
    plate: z.preprocess(
      emptyStringToNull,
      z.string().max(50, "Matrícula demasiado larga").optional().nullable()
    ),

    // Capacity
    loadType: z.preprocess(
      emptyStringToNull,
      z
        .enum(LOAD_TYPES, {
          message:
            "Tipo de carga debe ser PACKAGES, PALLETS, BULK, REFRIGERATED o DANGEROUS",
        })
        .optional()
        .nullable()
    ),
    maxOrders: z
      .number()
      .int("Capacidad debe ser un entero")
      .positive("Capacidad debe ser mayor a 0")
      .default(20),

    // Origin
    originAddress: z.preprocess(
      emptyStringToNull,
      z.string().max(500, "Dirección demasiado larga").optional().nullable()
    ),
    originLatitude: z.preprocess(
      emptyStringToNull,
      z.string().max(20, "Latitud demasiado larga").optional().nullable()
    ),
    originLongitude: z.preprocess(
      emptyStringToNull,
      z.string().max(20, "Longitud demasiado larga").optional().nullable()
    ),

    // Assigned driver
    assignedDriverId: z.preprocess(
      emptyStringToNull,
      z.string().uuid("ID de conductor inválido").optional().nullable()
    ),

    // Workday configuration
    workdayStart: z.preprocess(
      normalizeTime,
      z.string().regex(TIME_FORMAT, "Formato de hora inválido (HH:MM)").optional().nullable()
    ),
    workdayEnd: z.preprocess(
      normalizeTime,
      z.string().regex(TIME_FORMAT, "Formato de hora inválido (HH:MM)").optional().nullable()
    ),
    hasBreakTime: z.boolean().default(false),
    breakDuration: z
      .number()
      .int()
      .positive("Duración debe ser mayor a 0")
      .optional()
      .nullable(),
    breakTimeStart: z.preprocess(
      normalizeTime,
      z.string().regex(TIME_FORMAT, "Formato de hora inválido (HH:MM)").optional().nullable()
    ),
    breakTimeEnd: z.preprocess(
      normalizeTime,
      z.string().regex(TIME_FORMAT, "Formato de hora inválido (HH:MM)").optional().nullable()
    ),

    // Fleet IDs (M:N relationship)
    fleetIds: z.array(z.string().uuid()).optional().default([]),

    // Legacy fields (kept for backward compatibility)
    brand: z.preprocess(
      emptyStringToNull,
      z.string().max(100, "Marca demasiado larga").optional().nullable()
    ),
    model: z.preprocess(
      emptyStringToNull,
      z.string().max(100, "Modelo demasiado largo").optional().nullable()
    ),
    year: z
      .number()
      .int()
      .min(1900)
      .max(new Date().getFullYear() + 1)
      .optional()
      .nullable(),
    type: z.preprocess(
      emptyStringToNull,
      z.enum(VEHICLE_TYPES).optional().nullable()
    ),
    weightCapacity: z.number().positive().optional().nullable(),
    volumeCapacity: z.number().positive().optional().nullable(),
    refrigerated: z.boolean().default(false),
    heated: z.boolean().default(false),
    lifting: z.boolean().default(false),
    licenseRequired: z.preprocess(
      emptyStringToNull,
      z.enum(LICENSE_CATEGORIES).optional().nullable()
    ),
    insuranceExpiry: z.preprocess(
      emptyStringToNull,
      z.string().datetime().optional().nullable()
    ),
    inspectionExpiry: z.preprocess(
      emptyStringToNull,
      z.string().datetime().optional().nullable()
    ),

    status: z
      .enum(VEHICLE_STATUS, {
        message:
          "Estado debe ser AVAILABLE, IN_MAINTENANCE, ASSIGNED o INACTIVE",
      })
      .default("AVAILABLE"),
    active: z.boolean().default(true),
  })
  .refine(
    (data) => {
      // If useNameAsPlate is false, plate is required
      if (!data.useNameAsPlate && (!data.plate || data.plate.trim() === "")) {
        return false;
      }
      return true;
    },
    {
      message: "La matrícula es requerida si no usa el nombre como placa",
      path: ["plate"],
    },
  )
  .refine(
    (data) => {
      // If hasBreakTime is true, breakDuration is required
      if (data.hasBreakTime && !data.breakDuration) {
        return false;
      }
      return true;
    },
    {
      message:
        "La duración del descanso es requerida si aplica tiempo de descanso",
      path: ["breakDuration"],
    },
  )
  .refine(
    (data) => {
      // Validate workday times
      if (data.workdayStart && data.workdayEnd) {
        const [startHour, startMin] = data.workdayStart.split(":").map(Number);
        const [endHour, endMin] = data.workdayEnd.split(":").map(Number);
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;
        if (startMinutes >= endMinutes) {
          return false;
        }
      }
      return true;
    },
    {
      message:
        "La hora de fin de jornada debe ser posterior a la hora de inicio",
      path: ["workdayEnd"],
    },
  );

// Helper to transform empty strings to null (for updateVehicleSchema)
const emptyToNull = (val: unknown): unknown =>
  val === "" || val === undefined ? null : val;

// Helper to create nullable enum that accepts empty/invalid values and converts them to null
const nullableEnum = <T extends readonly [string, ...string[]]>(enumValues: T) => {
  const validValues = new Set(enumValues as unknown as string[]);
  return z.preprocess(
    (val) => {
      if (val === null || val === undefined || val === "") return null;
      if (typeof val === "string" && !validValues.has(val)) return null;
      return val;
    },
    z.enum(enumValues).nullable().optional()
  );
};

export const updateVehicleSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  useNameAsPlate: z.boolean().optional(),
  plate: z.preprocess(emptyToNull, z.string().max(50).optional().nullable()),
  loadType: nullableEnum(LOAD_TYPES),
  maxOrders: z.number().int().positive().optional(),
  originAddress: z.preprocess(
    emptyToNull,
    z.string().max(500).optional().nullable()
  ),
  originLatitude: z.preprocess(
    emptyToNull,
    z.string().max(20).optional().nullable()
  ),
  originLongitude: z.preprocess(
    emptyToNull,
    z.string().max(20).optional().nullable()
  ),
  assignedDriverId: z.preprocess(
    emptyToNull,
    z.string().uuid().optional().nullable()
  ),
  workdayStart: z.preprocess(
    normalizeTime,
    z.string().regex(TIME_FORMAT).optional().nullable()
  ),
  workdayEnd: z.preprocess(
    normalizeTime,
    z.string().regex(TIME_FORMAT).optional().nullable()
  ),
  hasBreakTime: z.boolean().optional(),
  breakDuration: z.number().int().positive().optional().nullable(),
  breakTimeStart: z.preprocess(
    normalizeTime,
    z.string().regex(TIME_FORMAT).optional().nullable()
  ),
  breakTimeEnd: z.preprocess(
    normalizeTime,
    z.string().regex(TIME_FORMAT).optional().nullable()
  ),
  fleetIds: z.array(z.string().uuid()).optional(),
  // Legacy fields
  brand: z.preprocess(emptyToNull, z.string().max(100).optional().nullable()),
  model: z.preprocess(emptyToNull, z.string().max(100).optional().nullable()),
  year: z
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear() + 1)
    .optional()
    .nullable(),
  type: nullableEnum(VEHICLE_TYPES),
  weightCapacity: z.number().positive().optional().nullable(),
  volumeCapacity: z.number().positive().optional().nullable(),
  refrigerated: z.boolean().optional(),
  heated: z.boolean().optional(),
  lifting: z.boolean().optional(),
  licenseRequired: nullableEnum(LICENSE_CATEGORIES),
  insuranceExpiry: z.preprocess(
    emptyToNull,
    z.string().datetime().optional().nullable()
  ),
  inspectionExpiry: z.preprocess(
    emptyToNull,
    z.string().datetime().optional().nullable()
  ),
  status: z.enum(VEHICLE_STATUS).optional(),
  active: z.boolean().optional(),
});

export const vehicleQuerySchema = z.object({
  fleetId: z.string().uuid().optional(),
  status: z.enum(VEHICLE_STATUS).optional(),
  type: z.enum(VEHICLE_TYPES).optional(),
  loadType: z.enum(LOAD_TYPES).optional(),
  assignedDriverId: z.string().uuid().optional(),
  hasDriver: z.coerce.boolean().optional(),
  active: z.coerce.boolean().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type VehicleInput = z.infer<typeof vehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
export type VehicleQuery = z.infer<typeof vehicleQuerySchema>;

// Load type display names for UI
export const LOAD_TYPE_LABELS: Record<(typeof LOAD_TYPES)[number], string> = {
  PACKAGES: "Paquetes",
  PALLETS: "Pallets",
  BULK: "Granel",
  REFRIGERATED: "Refrigerado",
  DANGEROUS: "Peligroso",
};

// Vehicle status display names for UI
export const VEHICLE_STATUS_LABELS: Record<
  (typeof VEHICLE_STATUS)[number],
  string
> = {
  AVAILABLE: "Disponible",
  IN_MAINTENANCE: "En Mantenimiento",
  ASSIGNED: "Asignado",
  INACTIVE: "Inactivo",
};
