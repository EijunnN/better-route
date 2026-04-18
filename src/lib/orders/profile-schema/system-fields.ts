/**
 * Built-in system fields. These form the baseline of every company's schema;
 * individual fields are toggled required/optional based on the company profile.
 *
 * Ordering matters: it determines the column order in generated templates and
 * the suggestion priority in the header auto-mapper.
 */

import type { FieldKind, ProfileField } from "./types";

type SystemFieldSeed = Omit<ProfileField, "origin">;

function sys(field: SystemFieldSeed): ProfileField {
  return { ...field, origin: "system" };
}

/** Always-required identity + geo columns. */
const BASE: ProfileField[] = [
  sys({
    key: "trackingId",
    label: "trackcode",
    labelEn: "Tracking ID",
    required: true,
    kind: "string",
    description: "Identificador único del pedido",
    example: "ORD-001",
    aliases: ["tracking_id", "trackingid", "id de seguimiento", "trackcode"],
  }),
  sys({
    key: "address",
    label: "direccion",
    labelEn: "Address",
    required: true,
    kind: "string",
    description: "Dirección de entrega",
    example: "Av. Corrientes 1234",
    aliases: ["direccion", "address", "dirección"],
  }),
  sys({
    key: "latitude",
    label: "latitud",
    labelEn: "Latitude",
    required: true,
    kind: "number",
    description: "Latitud geográfica (-90 a 90)",
    example: "-12.0464",
    rules: { min: -90, max: 90 },
    aliases: ["lat", "latitude", "latitud"],
  }),
  sys({
    key: "longitude",
    label: "longitud",
    labelEn: "Longitude",
    required: true,
    kind: "number",
    description: "Longitud geográfica (-180 a 180)",
    example: "-77.0428",
    rules: { min: -180, max: 180 },
    aliases: ["lng", "lon", "longitude", "longitud"],
  }),
];

/** Customer information. customerName is always required; contact fields optional. */
const CUSTOMER: ProfileField[] = [
  sys({
    key: "customerName",
    label: "nombre_cliente",
    labelEn: "Customer Name",
    required: true,
    kind: "string",
    description: "Nombre completo del cliente",
    example: "Juan Pérez",
    aliases: ["customer_name", "customername", "customer name", "nombre del cliente"],
  }),
  sys({
    key: "customerPhone",
    label: "telefono",
    labelEn: "Customer Phone",
    required: false,
    kind: "phone",
    description: "Teléfono del cliente",
    example: "987654321",
    aliases: ["customer_phone", "phone", "telefono del cliente", "teléfono"],
  }),
  sys({
    key: "customerEmail",
    label: "email",
    labelEn: "Customer Email",
    required: false,
    kind: "email",
    description: "Correo electrónico del cliente",
    example: "cliente@ejemplo.com",
    aliases: ["customer_email", "email del cliente"],
  }),
];

/** Capacity-dimension fields, gated by profile toggles. */
export const WEIGHT_FIELD: SystemFieldSeed = {
  key: "weightRequired",
  label: "peso",
  labelEn: "Weight (g)",
  required: false,
  kind: "number",
  description: "Peso del paquete en gramos",
  example: "500",
  rules: { min: 0 },
  aliases: ["weight", "weight_required", "peso (g)"],
};

export const VOLUME_FIELD: SystemFieldSeed = {
  key: "volumeRequired",
  label: "volumen",
  labelEn: "Volume (L)",
  required: false,
  kind: "number",
  description: "Volumen del paquete en litros",
  example: "5",
  rules: { min: 0 },
  aliases: ["volume", "volume_required", "volumen (l)"],
};

export const VALUE_FIELD: SystemFieldSeed = {
  key: "orderValue",
  label: "valorizado",
  labelEn: "Order Value",
  required: false,
  kind: "currency",
  description: "Valor monetario del pedido (en céntimos)",
  example: "3400",
  rules: { min: 0 },
  aliases: ["order_value", "value", "valorizado (centimos)"],
};

export const UNITS_FIELD: SystemFieldSeed = {
  key: "unitsRequired",
  label: "unidades",
  labelEn: "Units",
  required: false,
  kind: "number",
  description: "Número de unidades/items",
  example: "3",
  rules: { min: 1 },
  aliases: ["units", "units_required"],
};

/** Prioritization fields. */
export const ORDER_TYPE_FIELD: SystemFieldSeed = {
  key: "orderType",
  label: "tipo_pedido",
  labelEn: "Order Type",
  required: false,
  kind: "enum",
  description: "Tipo de pedido (NUEVO, REPROGRAMADO, URGENTE)",
  example: "NUEVO",
  enumValues: [
    "NEW", "RESCHEDULED", "URGENT",
    "NUEVO", "REPROGRAMADO", "URGENTE",
  ],
  aliases: ["order_type", "tipo de pedido", "tipo"],
};

export const PRIORITY_FIELD: SystemFieldSeed = {
  key: "priority",
  label: "prioridad",
  labelEn: "Priority",
  required: false,
  kind: "number",
  description: "Prioridad 0-100 (mayor = más importante)",
  example: "50",
  rules: { min: 0, max: 100 },
  aliases: ["priority", "prioridad"],
};

/** Time-window + location + miscellaneous optional columns. */
const TIME_WINDOWS: ProfileField[] = [
  sys({
    key: "timeWindowStart",
    label: "Ventana Horaria Inicio",
    labelEn: "Time Window Start",
    required: false,
    kind: "time",
    description: "Hora más temprana de entrega (HH:MM)",
    example: "09:00",
    rules: { pattern: "^([01]?[0-9]|2[0-3]):[0-5][0-9]$" },
    aliases: ["time_window_start", "time window start", "timewindowstart"],
  }),
  sys({
    key: "timeWindowEnd",
    label: "Ventana Horaria Fin",
    labelEn: "Time Window End",
    required: false,
    kind: "time",
    description: "Hora más tardía de entrega (HH:MM)",
    example: "18:00",
    rules: { pattern: "^([01]?[0-9]|2[0-3]):[0-5][0-9]$" },
    aliases: ["time_window_end", "time window end", "timewindowend"],
  }),
  sys({
    key: "timeWindowPresetId",
    label: "preset_horario",
    labelEn: "Time Window Preset",
    required: false,
    kind: "string",
    description: "Nombre o ID de preset configurado (ej: MAÑANA, TARDE)",
    example: "MAÑANA",
    aliases: ["time_window_preset_id", "preset_id", "preset horario"],
  }),
];

const LOCATION_DETAILS: ProfileField[] = [
  sys({
    key: "referencia",
    label: "referencia",
    labelEn: "Reference",
    required: false,
    kind: "string",
    description: "Referencia o punto de referencia",
    example: "Frente al parque",
    aliases: ["reference"],
  }),
  sys({
    key: "departamento",
    label: "departamento",
    labelEn: "Department/State",
    required: false,
    kind: "string",
    description: "Departamento o estado",
    example: "LIMA",
    aliases: ["department", "state"],
  }),
  sys({
    key: "provincia",
    label: "provincia",
    labelEn: "Province",
    required: false,
    kind: "string",
    description: "Provincia",
    example: "LIMA",
    aliases: ["province"],
  }),
  sys({
    key: "distrito",
    label: "distrito",
    labelEn: "District",
    required: false,
    kind: "string",
    description: "Distrito",
    example: "MIRAFLORES",
    aliases: ["district"],
  }),
];

const EXTRAS: ProfileField[] = [
  sys({
    key: "notes",
    label: "notas",
    labelEn: "Notes",
    required: false,
    kind: "string",
    description: "Instrucciones adicionales de entrega",
    example: "Tocar timbre 2A",
    aliases: ["notes", "observaciones"],
  }),
  sys({
    key: "requiredSkills",
    label: "habilidades",
    labelEn: "Required Skills",
    required: false,
    kind: "string",
    description: "Códigos de habilidades separados por coma",
    example: "REFRIGERADO,FRAGIL",
    aliases: ["required_skills", "skills"],
  }),
];

/** Ordered list of fixed system field sections (capacity/type fields injected by resolver). */
export const SYSTEM_FIELD_SECTIONS = {
  BASE,
  CUSTOMER,
  TIME_WINDOWS,
  LOCATION_DETAILS,
  EXTRAS,
} as const;

/** Map capacity dimension → seed used by the resolver. */
export const CAPACITY_FIELD_BY_DIM: Record<
  "WEIGHT" | "VOLUME" | "VALUE" | "UNITS",
  SystemFieldSeed
> = {
  WEIGHT: WEIGHT_FIELD,
  VOLUME: VOLUME_FIELD,
  VALUE: VALUE_FIELD,
  UNITS: UNITS_FIELD,
};

export function asSystemField(
  seed: SystemFieldSeed,
  overrides: Partial<ProfileField> = {},
): ProfileField {
  return { ...seed, origin: "system", ...overrides };
}

export const FIELD_KIND_OF_CUSTOM_TYPE: Record<string, FieldKind> = {
  text: "string",
  phone: "phone",
  email: "email",
  number: "number",
  currency: "currency",
  select: "enum",
  date: "date",
  boolean: "boolean",
};
