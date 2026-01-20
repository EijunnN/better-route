/**
 * Dynamic CSV Fields - Generate CSV templates and validation based on company profiles
 *
 * This module provides dynamic CSV field definitions that adapt to each company's
 * optimization profile, ensuring users only see relevant fields for their business type.
 */

import type { CompanyOptimizationProfile } from "../optimization/capacity-mapper";
import { DEFAULT_PROFILE } from "../optimization/capacity-mapper";

// CSV field definition
export interface CsvFieldDefinition {
  key: string;
  label: string;
  labelEs: string;
  required: boolean;
  type: "string" | "number" | "date" | "time" | "enum";
  description: string;
  descriptionEs: string;
  example: string;
  enumValues?: string[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}

// Base fields that are always required
const BASE_REQUIRED_FIELDS: CsvFieldDefinition[] = [
  {
    key: "trackingId",
    label: "Tracking ID",
    labelEs: "ID de Seguimiento",
    required: true,
    type: "string",
    description: "Unique order identifier",
    descriptionEs: "Identificador único del pedido",
    example: "ORD-001",
  },
  {
    key: "address",
    label: "Address",
    labelEs: "Dirección",
    required: true,
    type: "string",
    description: "Delivery address",
    descriptionEs: "Dirección de entrega",
    example: "Av. Corrientes 1234, CABA",
  },
  {
    key: "latitude",
    label: "Latitude",
    labelEs: "Latitud",
    required: true,
    type: "number",
    description: "Geographic latitude (-90 to 90)",
    descriptionEs: "Latitud geográfica (-90 a 90)",
    example: "-34.6037",
    validation: { min: -90, max: 90 },
  },
  {
    key: "longitude",
    label: "Longitude",
    labelEs: "Longitud",
    required: true,
    type: "number",
    description: "Geographic longitude (-180 to 180)",
    descriptionEs: "Longitud geográfica (-180 a 180)",
    example: "-58.3816",
    validation: { min: -180, max: 180 },
  },
];

// Customer fields - customerName is required, others optional
const CUSTOMER_FIELDS: CsvFieldDefinition[] = [
  {
    key: "customerName",
    label: "Customer Name",
    labelEs: "Nombre del Cliente",
    required: true, // Always required
    type: "string",
    description: "Customer's full name",
    descriptionEs: "Nombre completo del cliente",
    example: "Juan Pérez",
  },
  {
    key: "customerPhone",
    label: "Customer Phone",
    labelEs: "Teléfono del Cliente",
    required: false,
    type: "string",
    description: "Customer's phone number",
    descriptionEs: "Número de teléfono del cliente",
    example: "+54 11 1234-5678",
  },
  {
    key: "customerEmail",
    label: "Customer Email",
    labelEs: "Email del Cliente",
    required: false,
    type: "string",
    description: "Customer's email address",
    descriptionEs: "Correo electrónico del cliente",
    example: "cliente@ejemplo.com",
  },
];

// Capacity dimension fields
const WEIGHT_FIELD: CsvFieldDefinition = {
  key: "weightRequired",
  label: "Weight (g)",
  labelEs: "Peso (g)",
  required: false,
  type: "number",
  description: "Package weight in grams",
  descriptionEs: "Peso del paquete en gramos",
  example: "500",
  validation: { min: 0 },
};

const VOLUME_FIELD: CsvFieldDefinition = {
  key: "volumeRequired",
  label: "Volume (L)",
  labelEs: "Volumen (L)",
  required: false,
  type: "number",
  description: "Package volume in liters",
  descriptionEs: "Volumen del paquete en litros",
  example: "5",
  validation: { min: 0 },
};

const VALUE_FIELD: CsvFieldDefinition = {
  key: "orderValue",
  label: "Order Value (cents)",
  labelEs: "Valorizado",
  required: false,
  type: "number",
  description: "Order value in cents (e.g., 15000 = $150.00)",
  descriptionEs: "Valor del pedido en céntimos (ej: 15000 = $150.00)",
  example: "15000",
  validation: { min: 0 },
};

const UNITS_FIELD: CsvFieldDefinition = {
  key: "unitsRequired",
  label: "Units",
  labelEs: "Unidades",
  required: false,
  type: "number",
  description: "Number of units/items",
  descriptionEs: "Número de unidades/items",
  example: "3",
  validation: { min: 1 },
};

// Order type field
const ORDER_TYPE_FIELD: CsvFieldDefinition = {
  key: "orderType",
  label: "Order Type",
  labelEs: "Tipo de Pedido",
  required: false,
  type: "enum",
  description: "Type of order for prioritization",
  descriptionEs: "Tipo de pedido para priorización",
  example: "NEW",
  enumValues: ["NEW", "RESCHEDULED", "URGENT"],
};

// Priority field
const PRIORITY_FIELD: CsvFieldDefinition = {
  key: "priority",
  label: "Priority",
  labelEs: "Prioridad",
  required: false,
  type: "number",
  description: "Priority score (0-100, higher = more important)",
  descriptionEs: "Puntuación de prioridad (0-100, mayor = más importante)",
  example: "50",
  validation: { min: 0, max: 100 },
};

// Time window fields
const TIME_WINDOW_FIELDS: CsvFieldDefinition[] = [
  {
    key: "timeWindowStart",
    label: "Time Window Start",
    labelEs: "Ventana Horaria Inicio",
    required: false,
    type: "time",
    description: "Earliest delivery time (HH:MM)",
    descriptionEs: "Hora más temprana de entrega (HH:MM)",
    example: "09:00",
    validation: { pattern: "^([01]?[0-9]|2[0-3]):[0-5][0-9]$" },
  },
  {
    key: "timeWindowEnd",
    label: "Time Window End",
    labelEs: "Ventana Horaria Fin",
    required: false,
    type: "time",
    description: "Latest delivery time (HH:MM)",
    descriptionEs: "Hora más tardía de entrega (HH:MM)",
    example: "18:00",
    validation: { pattern: "^([01]?[0-9]|2[0-3]):[0-5][0-9]$" },
  },
];

// Additional optional fields
const ADDITIONAL_FIELDS: CsvFieldDefinition[] = [
  {
    key: "notes",
    label: "Notes",
    labelEs: "Notas",
    required: false,
    type: "string",
    description: "Additional delivery instructions",
    descriptionEs: "Instrucciones adicionales de entrega",
    example: "Tocar timbre 2A",
  },
  {
    key: "requiredSkills",
    label: "Required Skills",
    labelEs: "Habilidades Requeridas",
    required: false,
    type: "string",
    description: "Comma-separated skill codes",
    descriptionEs: "Códigos de habilidades separados por coma",
    example: "REFRIGERADO,FRAGIL",
  },
];

/**
 * Get CSV field definitions based on company profile
 * When a capacity dimension is enabled in the profile, its CSV field becomes REQUIRED
 */
export function getCsvFieldsForProfile(
  profile?: CompanyOptimizationProfile | null,
): CsvFieldDefinition[] {
  const effectiveProfile = profile || DEFAULT_PROFILE;
  const fields: CsvFieldDefinition[] = [...BASE_REQUIRED_FIELDS];

  // Add customer fields
  fields.push(...CUSTOMER_FIELDS);

  // Add capacity fields based on profile - REQUIRED when enabled
  if (effectiveProfile.enableWeight) {
    fields.push({ ...WEIGHT_FIELD, required: true });
  }

  if (effectiveProfile.enableVolume) {
    fields.push({ ...VOLUME_FIELD, required: true });
  }

  if (effectiveProfile.enableOrderValue) {
    fields.push({ ...VALUE_FIELD, required: true });
  }

  if (effectiveProfile.enableUnits) {
    fields.push({ ...UNITS_FIELD, required: true });
  }

  // Add order type field if enabled - REQUIRED when enabled
  if (effectiveProfile.enableOrderType) {
    fields.push({ ...ORDER_TYPE_FIELD, required: true });
    fields.push(PRIORITY_FIELD); // Priority remains optional even when order type is enabled
  }

  // Add time window fields
  fields.push(...TIME_WINDOW_FIELDS);

  // Add additional fields
  fields.push(...ADDITIONAL_FIELDS);

  return fields;
}

/**
 * Get only required fields for a profile
 */
export function getRequiredFieldsForProfile(
  profile?: CompanyOptimizationProfile | null,
): CsvFieldDefinition[] {
  return getCsvFieldsForProfile(profile).filter((f) => f.required);
}

// BOM UTF-8 para que Excel detecte correctamente la codificación
const UTF8_BOM = "\uFEFF";

/**
 * Generate CSV header row based on profile
 */
export function generateCsvHeader(
  profile?: CompanyOptimizationProfile | null,
  locale: "en" | "es" = "es",
  separator: string = ";",
): string {
  const fields = getCsvFieldsForProfile(profile);
  const headers = fields.map((f) => (locale === "es" ? f.labelEs : f.label));
  return headers.join(separator);
}

/**
 * Generate CSV template with example row
 * Uses semicolon separator for Excel compatibility in Spanish locales
 * Includes UTF-8 BOM for proper encoding detection
 */
export function generateCsvTemplate(
  profile?: CompanyOptimizationProfile | null,
  locale: "en" | "es" = "es",
): string {
  const fields = getCsvFieldsForProfile(profile);
  const headers = fields.map((f) => (locale === "es" ? f.labelEs : f.label));
  const examples = fields.map((f) => f.example);
  // Use semicolon for Spanish locale (Excel default), comma for English
  const separator = locale === "es" ? ";" : ",";

  return `${UTF8_BOM}${headers.join(separator)}\n${examples.join(separator)}`;
}

/**
 * Generate system field keys for CSV mapping
 */
export function getSystemFieldKeys(
  profile?: CompanyOptimizationProfile | null,
): string[] {
  return getCsvFieldsForProfile(profile).map((f) => f.key);
}

/**
 * Validate a CSV row against profile fields
 */
export function validateCsvRow(
  row: Record<string, string>,
  profile?: CompanyOptimizationProfile | null,
  locale: "en" | "es" = "es",
): { valid: boolean; errors: string[] } {
  const fields = getCsvFieldsForProfile(profile);
  const errors: string[] = [];

  for (const field of fields) {
    const value = row[field.key];
    const fieldLabel = locale === "es" ? field.labelEs : field.label;

    // Check required fields
    if (field.required && (!value || value.trim() === "")) {
      errors.push(`${fieldLabel} es requerido`);
      continue;
    }

    // Skip validation for empty optional fields
    if (!value || value.trim() === "") {
      continue;
    }

    // Type-specific validation
    switch (field.type) {
      case "number": {
        const num = parseFloat(value);
        if (isNaN(num)) {
          errors.push(`${fieldLabel} debe ser un número`);
        } else if (field.validation) {
          if (field.validation.min !== undefined && num < field.validation.min) {
            errors.push(`${fieldLabel} debe ser mayor o igual a ${field.validation.min}`);
          }
          if (field.validation.max !== undefined && num > field.validation.max) {
            errors.push(`${fieldLabel} debe ser menor o igual a ${field.validation.max}`);
          }
        }
        break;
      }
      case "enum": {
        if (field.enumValues && !field.enumValues.includes(value.toUpperCase())) {
          errors.push(
            `${fieldLabel} debe ser uno de: ${field.enumValues.join(", ")}`,
          );
        }
        break;
      }
      case "time": {
        if (field.validation?.pattern) {
          const regex = new RegExp(field.validation.pattern);
          if (!regex.test(value)) {
            errors.push(`${fieldLabel} debe tener formato HH:MM`);
          }
        }
        break;
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Map CSV headers to system field keys
 */
export function mapCsvHeadersToFields(
  csvHeaders: string[],
  profile?: CompanyOptimizationProfile | null,
  locale: "en" | "es" = "es",
): Map<string, string> {
  const fields = getCsvFieldsForProfile(profile);
  const mapping = new Map<string, string>();

  for (const header of csvHeaders) {
    const normalizedHeader = header.toLowerCase().trim();

    // Try exact match first
    for (const field of fields) {
      const label = locale === "es" ? field.labelEs : field.label;
      if (label.toLowerCase() === normalizedHeader || field.key.toLowerCase() === normalizedHeader) {
        mapping.set(header, field.key);
        break;
      }
    }

    // Try partial match if no exact match
    if (!mapping.has(header)) {
      for (const field of fields) {
        const label = locale === "es" ? field.labelEs : field.label;
        if (
          normalizedHeader.includes(field.key.toLowerCase()) ||
          normalizedHeader.includes(label.toLowerCase())
        ) {
          mapping.set(header, field.key);
          break;
        }
      }
    }
  }

  return mapping;
}

/**
 * Get field documentation for UI display
 */
export function getFieldDocumentation(
  profile?: CompanyOptimizationProfile | null,
  locale: "en" | "es" = "es",
): Array<{
  key: string;
  label: string;
  required: boolean;
  description: string;
  example: string;
}> {
  const fields = getCsvFieldsForProfile(profile);

  return fields.map((f) => ({
    key: f.key,
    label: locale === "es" ? f.labelEs : f.label,
    required: f.required,
    description: locale === "es" ? f.descriptionEs : f.description,
    example: f.example,
  }));
}

/**
 * Profile-specific CSV templates for common company types
 */
export const CSV_TEMPLATES = {
  // Traditional logistics: weight + volume
  LOGISTICS: {
    name: "Logística Tradicional",
    description: "Peso y volumen como restricciones principales",
    example: `ID de Seguimiento,Dirección,Latitud,Longitud,Peso (g),Volumen (L)
ORD-001,Av. Corrientes 1234,-34.6037,-58.3816,500,5
ORD-002,Av. Santa Fe 2000,-34.5955,-58.3911,1000,10`,
  },

  // High-value goods: value-based
  HIGH_VALUE: {
    name: "Productos de Alto Valor",
    description: "Valorizado y tipo de pedido para priorización",
    example: `ID de Seguimiento,Dirección,Latitud,Longitud,Valorizado,Tipo de Pedido
ORD-001,Av. Corrientes 1234,-34.6037,-58.3816,150000,NEW
ORD-002,Av. Santa Fe 2000,-34.5955,-58.3911,250000,URGENT`,
  },

  // Simple delivery: units only
  SIMPLE: {
    name: "Entrega Simple",
    description: "Solo conteo de unidades",
    example: `ID de Seguimiento,Dirección,Latitud,Longitud,Unidades
ORD-001,Av. Corrientes 1234,-34.6037,-58.3816,3
ORD-002,Av. Santa Fe 2000,-34.5955,-58.3911,5`,
  },
} as const;
