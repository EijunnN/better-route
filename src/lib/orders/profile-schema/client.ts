/**
 * Client-safe entrypoint for profile-schema.
 *
 * The main index.ts re-exports resolveProfileSchema, which pulls in the
 * Drizzle client + postgres driver (server-only). Client components can't
 * import that chain — they just need the type definitions, pure validators,
 * capacity helpers, and the template generator.
 *
 * Import server-only functions (resolveProfileSchema, defaultProfileSchema)
 * from '@/lib/orders/profile-schema' directly.
 */

export type {
  ProfileSchema,
  ProfileField,
  FieldKind,
  CapacityDimension,
  PriorityMap,
  TimeWindowPresetRef,
  HeaderValidationResult,
  RowValidationResult,
} from "./types";

export {
  validateCsvHeaders,
  validateCsvRow,
  validateCustomFieldValues,
  applyCustomFieldDefaults,
} from "./validate";

export {
  buildOrderCapacityVector,
  buildVehicleCapacityVector,
  resolveOrderPriority,
  type OrderCapacityInput,
  type VehicleCapacityInput,
  type CapacityVector,
} from "./capacity";

export { generateCsvTemplate } from "./template";
