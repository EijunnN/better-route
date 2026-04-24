import { z } from "zod";

export const VEHICLE_STATUS = [
  "AVAILABLE",
  "IN_MAINTENANCE",
  "ASSIGNED",
  "INACTIVE",
] as const;

export const LICENSE_CATEGORIES = [
  "A",
  "A1",
  "A2",
  "A3",
  "B",
  "C",
  "C1",
  "CE",
  "D",
  "D1",
  "DE",
] as const;

const TIME_FORMAT = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;

const emptyStringToNull = (val: unknown) => (val === "" ? null : val);

const dateToDatetime = (val: unknown): unknown => {
  if (val === "" || val === null || val === undefined) return null;
  if (typeof val !== "string") return val;
  if (val.includes("T")) return val;
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return `${val}T00:00:00Z`;
  return val;
};

const normalizeTime = (val: unknown): string | null => {
  if (val === "" || val === null || val === undefined) return null;
  if (typeof val !== "string") return null;
  const match = val.match(/^(\d{1,2}:\d{2})(:\d{2})?$/);
  return match ? match[1] : val;
};

const emptyToNull = (val: unknown): unknown =>
  val === "" || val === undefined ? null : val;

const nullableEnum = <T extends readonly [string, ...string[]]>(
  enumValues: T,
) => {
  const validValues = new Set(enumValues as unknown as string[]);
  return z.preprocess((val) => {
    if (val === null || val === undefined || val === "") return null;
    if (typeof val === "string" && !validValues.has(val)) return null;
    return val;
  }, z.enum(enumValues).nullable().optional());
};

export const vehicleSchema = z
  .object({
    name: z
      .string()
      .min(1, "Nombre es requerido")
      .max(255, "Nombre demasiado largo"),
    useNameAsPlate: z.boolean().default(false),
    plate: z.preprocess(
      emptyStringToNull,
      z.string().max(50, "Matrícula demasiado larga").optional().nullable(),
    ),

    brand: z.preprocess(
      emptyStringToNull,
      z.string().max(100, "Marca demasiado larga").optional().nullable(),
    ),
    model: z.preprocess(
      emptyStringToNull,
      z.string().max(100, "Modelo demasiado largo").optional().nullable(),
    ),

    maxOrders: z
      .number()
      .int("Capacidad debe ser un entero")
      .positive("Capacidad debe ser mayor a 0")
      .default(20),
    weightCapacity: z.number().positive().optional().nullable(),
    volumeCapacity: z.number().positive().optional().nullable(),
    maxValueCapacity: z
      .number()
      .int()
      .positive("Capacidad de valorizado debe ser mayor a 0")
      .optional()
      .nullable(),
    maxUnitsCapacity: z
      .number()
      .int()
      .positive("Capacidad de unidades debe ser mayor a 0")
      .optional()
      .nullable(),

    originAddress: z.preprocess(
      emptyStringToNull,
      z.string().max(500, "Dirección demasiado larga").optional().nullable(),
    ),
    originLatitude: z.preprocess(
      emptyStringToNull,
      z.string().max(20, "Latitud demasiado larga").optional().nullable(),
    ),
    originLongitude: z.preprocess(
      emptyStringToNull,
      z.string().max(20, "Longitud demasiado larga").optional().nullable(),
    ),

    assignedDriverId: z.preprocess(
      emptyStringToNull,
      z.string().uuid("ID de conductor inválido").optional().nullable(),
    ),
    licenseRequired: z.preprocess(
      emptyStringToNull,
      z.enum(LICENSE_CATEGORIES).optional().nullable(),
    ),

    workdayStart: z.preprocess(
      normalizeTime,
      z
        .string()
        .regex(TIME_FORMAT, "Formato de hora inválido (HH:MM)")
        .optional()
        .nullable(),
    ),
    workdayEnd: z.preprocess(
      normalizeTime,
      z
        .string()
        .regex(TIME_FORMAT, "Formato de hora inválido (HH:MM)")
        .optional()
        .nullable(),
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
      z
        .string()
        .regex(TIME_FORMAT, "Formato de hora inválido (HH:MM)")
        .optional()
        .nullable(),
    ),
    breakTimeEnd: z.preprocess(
      normalizeTime,
      z
        .string()
        .regex(TIME_FORMAT, "Formato de hora inválido (HH:MM)")
        .optional()
        .nullable(),
    ),

    insuranceExpiry: z.preprocess(
      dateToDatetime,
      z.string().datetime().optional().nullable(),
    ),
    inspectionExpiry: z.preprocess(
      dateToDatetime,
      z.string().datetime().optional().nullable(),
    ),

    fleetIds: z.array(z.string().uuid()).optional().default([]),

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

export const updateVehicleSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  useNameAsPlate: z.boolean().optional(),
  plate: z.preprocess(emptyToNull, z.string().max(50).optional().nullable()),
  brand: z.preprocess(emptyToNull, z.string().max(100).optional().nullable()),
  model: z.preprocess(emptyToNull, z.string().max(100).optional().nullable()),
  maxOrders: z.number().int().positive().optional(),
  weightCapacity: z.number().positive().optional().nullable(),
  volumeCapacity: z.number().positive().optional().nullable(),
  maxValueCapacity: z.number().int().positive().optional().nullable(),
  maxUnitsCapacity: z.number().int().positive().optional().nullable(),
  originAddress: z.preprocess(
    emptyToNull,
    z.string().max(500).optional().nullable(),
  ),
  originLatitude: z.preprocess(
    emptyToNull,
    z.string().max(20).optional().nullable(),
  ),
  originLongitude: z.preprocess(
    emptyToNull,
    z.string().max(20).optional().nullable(),
  ),
  assignedDriverId: z.preprocess(
    emptyToNull,
    z.string().uuid().optional().nullable(),
  ),
  licenseRequired: nullableEnum(LICENSE_CATEGORIES),
  workdayStart: z.preprocess(
    normalizeTime,
    z.string().regex(TIME_FORMAT).optional().nullable(),
  ),
  workdayEnd: z.preprocess(
    normalizeTime,
    z.string().regex(TIME_FORMAT).optional().nullable(),
  ),
  hasBreakTime: z.boolean().optional(),
  breakDuration: z.number().int().positive().optional().nullable(),
  breakTimeStart: z.preprocess(
    normalizeTime,
    z.string().regex(TIME_FORMAT).optional().nullable(),
  ),
  breakTimeEnd: z.preprocess(
    normalizeTime,
    z.string().regex(TIME_FORMAT).optional().nullable(),
  ),
  insuranceExpiry: z.preprocess(
    (v) => dateToDatetime(emptyToNull(v)),
    z.string().datetime().optional().nullable(),
  ),
  inspectionExpiry: z.preprocess(
    (v) => dateToDatetime(emptyToNull(v)),
    z.string().datetime().optional().nullable(),
  ),
  fleetIds: z.array(z.string().uuid()).optional(),
  status: z.enum(VEHICLE_STATUS).optional(),
  active: z.boolean().optional(),
});

export const vehicleQuerySchema = z.object({
  fleetId: z.string().uuid().optional(),
  status: z.enum(VEHICLE_STATUS).optional(),
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

export const VEHICLE_STATUS_LABELS: Record<
  (typeof VEHICLE_STATUS)[number],
  string
> = {
  AVAILABLE: "Disponible",
  IN_MAINTENANCE: "En Mantenimiento",
  ASSIGNED: "Asignado",
  INACTIVE: "Inactivo",
};
