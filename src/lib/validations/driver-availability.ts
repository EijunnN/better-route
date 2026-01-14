import { z } from "zod";
import { DAYS_OF_WEEK } from "@/db/schema";

export const DAYS_OF_WEEK_LIST = Object.values(DAYS_OF_WEEK);

// Helper function to check if time is in HH:MM format
const isValidTime = (timeString: string) => {
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  return timeRegex.test(timeString);
};

// Helper function to check if end time is after start time
const isTimeRangeValid = (data: { startTime: string; endTime: string }) => {
  return data.endTime > data.startTime;
};

export const driverAvailabilitySchema = z
  .object({
    driverId: z.string().uuid("ID de conductor inválido"),
    dayOfWeek: z.enum(DAYS_OF_WEEK_LIST, {
      message:
        "Día de la semana debe ser MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY o SUNDAY",
    }),
    startTime: z.string().refine((val) => isValidTime(val), {
      message: "Hora de inicio debe estar en formato HH:MM",
    }),
    endTime: z.string().refine((val) => isValidTime(val), {
      message: "Hora de fin debe estar en formato HH:MM",
    }),
    isDayOff: z.boolean().default(false),
    active: z.boolean().default(true),
  })
  .refine((data) => isTimeRangeValid(data), {
    message: "La hora de fin debe ser posterior a la hora de inicio",
    path: ["endTime"],
  })
  .refine(
    (data) => {
      // If it's a day off, time ranges should still be valid but may be ignored
      if (data.isDayOff) {
        return true;
      }
      return isTimeRangeValid(data);
    },
    {
      message:
        "Para días laborales, la hora de fin debe ser posterior a la hora de inicio",
    },
  );

export const updateDriverAvailabilitySchema = z.object({
  id: z.string().uuid(),
  dayOfWeek: z.enum(DAYS_OF_WEEK_LIST).optional(),
  startTime: z
    .string()
    .refine((val) => isValidTime(val), {
      message: "Hora de inicio debe estar en formato HH:MM",
    })
    .optional(),
  endTime: z
    .string()
    .refine((val) => isValidTime(val), {
      message: "Hora de fin debe estar en formato HH:MM",
    })
    .optional(),
  isDayOff: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const driverAvailabilityQuerySchema = z.object({
  driverId: z.string().uuid().optional(),
  dayOfWeek: z.enum(DAYS_OF_WEEK_LIST).optional(),
  isDayOff: z.coerce.boolean().optional(),
  active: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

// Schema for checking availability at a specific time
export const availabilityCheckSchema = z.object({
  driverId: z.string().uuid("ID de conductor inválido"),
  date: z.string().datetime("Fecha debe ser un datetime ISO 8601 válido"),
  time: z.string().refine((val) => isValidTime(val), {
    message: "Hora debe estar en formato HH:MM",
  }),
});

export type DriverAvailabilityInput = z.infer<typeof driverAvailabilitySchema>;
export type UpdateDriverAvailabilityInput = z.infer<
  typeof updateDriverAvailabilitySchema
>;
export type DriverAvailabilityQuery = z.infer<
  typeof driverAvailabilityQuerySchema
>;
export type AvailabilityCheck = z.infer<typeof availabilityCheckSchema>;

// Helper function to get day of week from date
export function getDayOfWeek(date: Date): keyof typeof DAYS_OF_WEEK {
  const days: (keyof typeof DAYS_OF_WEEK)[] = [
    "SUNDAY",
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
  ];
  return days[date.getDay()];
}

// Helper function to check if a time is within a range
export function isTimeInRange(
  time: string,
  startTime: string,
  endTime: string,
): boolean {
  return time >= startTime && time <= endTime;
}
