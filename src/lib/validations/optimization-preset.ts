import { z } from "zod";

/**
 * Where a route ends after the last stop. The DB column is a varchar
 * with a default of `DRIVER_ORIGIN`; keeping the values exhaustive
 * here turns the API into the contract that the column actually
 * cares about.
 */
export const ROUTE_END_MODES = [
  "DRIVER_ORIGIN",
  "SPECIFIC_DEPOT",
  "OPEN_END",
] as const;
export type RouteEndMode = (typeof ROUTE_END_MODES)[number];

const coordinate = z
  .string()
  .regex(/^-?\d+\.?\d*$/, "Invalid coordinate format")
  .max(50);

/**
 * Single source of truth for the preset shape. Every column on
 * `optimizationPresets` should appear here — when a column is added
 * to the schema and forgotten in this file, TypeScript surfaces it
 * via the `parsed` spread inside the route handlers (the property
 * doesn't exist on the parsed type and the insert/update fails to
 * type-check). That guard is what was missing when `routeEndMode`
 * silently fell off the update payload.
 */
const presetFields = {
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(1000).nullable().optional(),
  balanceVisits: z.boolean(),
  minimizeVehicles: z.boolean(),
  openStart: z.boolean(),
  oneRoutePerVehicle: z.boolean(),
  flexibleTimeWindows: z.boolean(),
  groupSameLocation: z.boolean(),
  maxDistanceKm: z.number().int().positive().nullable().optional(),
  trafficFactor: z.number().int().min(0).max(100).nullable().optional(),
  routeEndMode: z.enum(ROUTE_END_MODES),
  endDepotLatitude: coordinate.nullable().optional(),
  endDepotLongitude: coordinate.nullable().optional(),
  endDepotAddress: z.string().max(500).nullable().optional(),
  isDefault: z.boolean(),
};

const requireDepotIfSpecific = <
  T extends {
    routeEndMode?: RouteEndMode;
    endDepotLatitude?: string | null;
    endDepotLongitude?: string | null;
  },
>(
  data: T,
  ctx: z.RefinementCtx,
) => {
  if (data.routeEndMode !== "SPECIFIC_DEPOT") return;
  if (!data.endDepotLatitude || !data.endDepotLongitude) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "endDepotLatitude and endDepotLongitude are required when routeEndMode is SPECIFIC_DEPOT",
      path: ["endDepotLatitude"],
    });
  }
};

export const createPresetSchema = z
  .object(presetFields)
  .partial({
    description: true,
    maxDistanceKm: true,
    trafficFactor: true,
    endDepotLatitude: true,
    endDepotLongitude: true,
    endDepotAddress: true,
  })
  .extend({
    balanceVisits: presetFields.balanceVisits.default(false),
    minimizeVehicles: presetFields.minimizeVehicles.default(false),
    openStart: presetFields.openStart.default(false),
    oneRoutePerVehicle: presetFields.oneRoutePerVehicle.default(true),
    flexibleTimeWindows: presetFields.flexibleTimeWindows.default(false),
    groupSameLocation: presetFields.groupSameLocation.default(true),
    routeEndMode: presetFields.routeEndMode.default("DRIVER_ORIGIN"),
    isDefault: presetFields.isDefault.default(false),
  })
  .superRefine(requireDepotIfSpecific);

export const updatePresetSchema = z
  .object(presetFields)
  .partial()
  .superRefine(requireDepotIfSpecific);

export type CreatePresetInput = z.infer<typeof createPresetSchema>;
export type UpdatePresetInput = z.infer<typeof updatePresetSchema>;
