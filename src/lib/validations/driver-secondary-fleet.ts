import { z } from "zod";

export const driverSecondaryFleetSchema = z.object({
  driverId: z.string().uuid("ID de conductor inválido"),
  fleetId: z.string().uuid("ID de flota inválido"),
  active: z.boolean().default(true),
});

export const updateDriverSecondaryFleetSchema = z.object({
  id: z.string().uuid(),
  fleetId: z.string().uuid().optional(),
  active: z.boolean().optional(),
});

export const driverSecondaryFleetQuerySchema = z.object({
  driverId: z.string().uuid().optional(),
  fleetId: z.string().uuid().optional(),
  active: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type DriverSecondaryFleetInput = z.infer<
  typeof driverSecondaryFleetSchema
>;
export type UpdateDriverSecondaryFleetInput = z.infer<
  typeof updateDriverSecondaryFleetSchema
>;
export type DriverSecondaryFleetQuery = z.infer<
  typeof driverSecondaryFleetQuerySchema
>;
