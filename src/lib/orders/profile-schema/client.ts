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

export {
  buildOrderCapacityVector,
  buildVehicleCapacityVector,
  type CapacityVector,
  type OrderCapacityInput,
  resolveOrderPriority,
  type VehicleCapacityInput,
} from "./capacity";
export { generateCsvTemplate } from "./template";
export type {
  CapacityDimension,
  FieldKind,
  HeaderValidationResult,
  PriorityMap,
  ProfileField,
  ProfileSchema,
  RowValidationResult,
  TimeWindowPresetRef,
} from "./types";
export {
  applyCustomFieldDefaults,
  validateCsvHeaders,
  validateCsvRow,
  validateCustomFieldValues,
} from "./validate";
