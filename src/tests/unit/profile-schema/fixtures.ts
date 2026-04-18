import type { ProfileSchema } from "@/lib/orders/profile-schema";

/**
 * Minimal schema with only BASE + CUSTOMER fields and weight-only capacity.
 * Good default for tests that don't care about dimensions.
 */
export function baseSchema(overrides: Partial<ProfileSchema> = {}): ProfileSchema {
  return {
    companyId: "test-company",
    profileId: "test-profile",
    activeDimensions: ["WEIGHT"],
    priorityMapping: { NEW: 50, RESCHEDULED: 80, URGENT: 100 },
    requireOrderType: false,
    fields: [
      {
        key: "trackingId",
        label: "trackcode",
        required: true,
        kind: "string",
        description: "",
        example: "",
        origin: "system",
        aliases: ["tracking_id"],
      },
      {
        key: "address",
        label: "direccion",
        required: true,
        kind: "string",
        description: "",
        example: "",
        origin: "system",
        aliases: ["address"],
      },
      {
        key: "latitude",
        label: "latitud",
        required: true,
        kind: "number",
        description: "",
        example: "",
        rules: { min: -90, max: 90 },
        origin: "system",
        aliases: ["lat", "latitude"],
      },
      {
        key: "longitude",
        label: "longitud",
        required: true,
        kind: "number",
        description: "",
        example: "",
        rules: { min: -180, max: 180 },
        origin: "system",
        aliases: ["lng", "longitude"],
      },
      {
        key: "customerName",
        label: "nombre_cliente",
        required: true,
        kind: "string",
        description: "",
        example: "",
        origin: "system",
        aliases: ["customer_name"],
      },
      {
        key: "weightRequired",
        label: "peso",
        required: true,
        kind: "number",
        description: "",
        example: "",
        rules: { min: 0 },
        origin: "system",
        aliases: ["weight"],
      },
    ],
    timeWindowPresets: [],
    defaults: {},
    resolvedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Multi-dimensional schema: weight + volume + value + units. Useful for capacity tests. */
export function fullCapacitySchema(): ProfileSchema {
  return baseSchema({
    activeDimensions: ["WEIGHT", "VOLUME", "VALUE", "UNITS"],
    fields: [
      ...baseSchema().fields,
      {
        key: "volumeRequired",
        label: "volumen",
        required: true,
        kind: "number",
        description: "",
        example: "",
        rules: { min: 0 },
        origin: "system",
      },
      {
        key: "orderValue",
        label: "valorizado",
        required: true,
        kind: "currency",
        description: "",
        example: "",
        rules: { min: 0 },
        origin: "system",
      },
      {
        key: "unitsRequired",
        label: "unidades",
        required: true,
        kind: "number",
        description: "",
        example: "",
        rules: { min: 1 },
        origin: "system",
      },
    ],
  });
}
