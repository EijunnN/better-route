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
    labelEs: "trackcode",
    required: true,
    type: "string",
    description: "Unique order identifier",
    descriptionEs: "Identificador único del pedido",
    example: "ORD-001",
  },
  {
    key: "address",
    label: "Address",
    labelEs: "direccion",
    required: true,
    type: "string",
    description: "Delivery address",
    descriptionEs: "Dirección de entrega",
    example: "Av. Corrientes 1234",
  },
  {
    key: "latitude",
    label: "Latitude",
    labelEs: "latitud",
    required: true,
    type: "number",
    description: "Geographic latitude (-90 to 90)",
    descriptionEs: "Latitud geográfica (-90 a 90)",
    example: "-12.0464",
    validation: { min: -90, max: 90 },
  },
  {
    key: "longitude",
    label: "Longitude",
    labelEs: "longitud",
    required: true,
    type: "number",
    description: "Geographic longitude (-180 to 180)",
    descriptionEs: "Longitud geográfica (-180 a 180)",
    example: "-77.0428",
    validation: { min: -180, max: 180 },
  },
];

// Customer fields - customerName is required, others optional
const CUSTOMER_FIELDS: CsvFieldDefinition[] = [
  {
    key: "customerName",
    label: "Customer Name",
    labelEs: "nombre_cliente",
    required: true, // Always required
    type: "string",
    description: "Customer's full name",
    descriptionEs: "Nombre completo del cliente",
    example: "Juan Pérez",
  },
  {
    key: "customerPhone",
    label: "Customer Phone",
    labelEs: "telefono",
    required: false,
    type: "string",
    description: "Customer's phone number",
    descriptionEs: "Número de teléfono del cliente",
    example: "987654321",
  },
  {
    key: "customerEmail",
    label: "Customer Email",
    labelEs: "email",
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
  labelEs: "peso",
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
  labelEs: "volumen",
  required: false,
  type: "number",
  description: "Package volume in liters",
  descriptionEs: "Volumen del paquete en litros",
  example: "5",
  validation: { min: 0 },
};

const VALUE_FIELD: CsvFieldDefinition = {
  key: "orderValue",
  label: "Order Value",
  labelEs: "valorizado",
  required: false,
  type: "number",
  description: "Order monetary value",
  descriptionEs: "Valor monetario del pedido",
  example: "3400",
  validation: { min: 0 },
};

const UNITS_FIELD: CsvFieldDefinition = {
  key: "unitsRequired",
  label: "Units",
  labelEs: "unidades",
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
  labelEs: "tipo_pedido",
  required: false,
  type: "enum",
  description: "Type of order for prioritization (NEW, RESCHEDULED, URGENT)",
  descriptionEs: "Tipo de pedido para priorización (NUEVO, REPROGRAMADO, URGENTE)",
  example: "NUEVO",
  enumValues: ["NEW", "RESCHEDULED", "URGENT", "NUEVO", "REPROGRAMADO", "URGENTE"],
};

// Priority field
const PRIORITY_FIELD: CsvFieldDefinition = {
  key: "priority",
  label: "Priority",
  labelEs: "prioridad",
  required: false,
  type: "number",
  description: "Priority score (0-100, higher = more important)",
  descriptionEs: "Prioridad (0-100, mayor = más importante). Ej: URGENTE=100, REPROGRAMADO=80, NUEVO=50",
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

// Location detail fields (for address building)
const LOCATION_DETAIL_FIELDS: CsvFieldDefinition[] = [
  {
    key: "referencia",
    label: "Reference",
    labelEs: "referencia",
    required: false,
    type: "string",
    description: "Address reference or landmark",
    descriptionEs: "Referencia o punto de referencia",
    example: "Frente al parque",
  },
  {
    key: "departamento",
    label: "Department/State",
    labelEs: "departamento",
    required: false,
    type: "string",
    description: "Department or state",
    descriptionEs: "Departamento",
    example: "LIMA",
  },
  {
    key: "provincia",
    label: "Province",
    labelEs: "provincia",
    required: false,
    type: "string",
    description: "Province",
    descriptionEs: "Provincia",
    example: "LIMA",
  },
  {
    key: "distrito",
    label: "District",
    labelEs: "distrito",
    required: false,
    type: "string",
    description: "District",
    descriptionEs: "Distrito",
    example: "MIRAFLORES",
  },
];

// Additional optional fields
const ADDITIONAL_FIELDS: CsvFieldDefinition[] = [
  {
    key: "notes",
    label: "Notes",
    labelEs: "notas",
    required: false,
    type: "string",
    description: "Additional delivery instructions",
    descriptionEs: "Instrucciones adicionales de entrega",
    example: "Tocar timbre 2A",
  },
  {
    key: "requiredSkills",
    label: "Required Skills",
    labelEs: "habilidades",
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

  // Add location detail fields
  fields.push(...LOCATION_DETAIL_FIELDS);

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

// Custom field info for CSV template generation
export interface CsvCustomFieldInfo {
  code: string;
  label: string;
  fieldType: string;
  required: boolean;
}

/**
 * Generate CSV header row based on profile
 */
export function generateCsvHeader(
  profile?: CompanyOptimizationProfile | null,
  locale: "en" | "es" = "es",
  separator: string = ";",
  customFields?: CsvCustomFieldInfo[],
): string {
  const fields = getCsvFieldsForProfile(profile);
  const headers = fields.map((f) => (locale === "es" ? f.labelEs : f.label));
  if (customFields && customFields.length > 0) {
    for (const cf of customFields) {
      headers.push(cf.code);
    }
  }
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
  customFields?: CsvCustomFieldInfo[],
): string {
  const fields = getCsvFieldsForProfile(profile);
  const headers = fields.map((f) => (locale === "es" ? f.labelEs : f.label));
  const examples = fields.map((f) => f.example);
  // Use semicolon for Spanish locale (Excel default), comma for English
  const separator = locale === "es" ? ";" : ",";

  // Append custom field columns
  if (customFields && customFields.length > 0) {
    for (const cf of customFields) {
      headers.push(cf.code);
      examples.push(getCustomFieldExample(cf));
    }
  }

  return `${UTF8_BOM}${headers.join(separator)}\n${examples.join(separator)}`;
}

/**
 * Generate an example value for a custom field based on its type
 */
function getCustomFieldExample(cf: CsvCustomFieldInfo): string {
  switch (cf.fieldType) {
    case "number":
    case "currency":
      return "0";
    case "boolean":
      return "true";
    case "date":
      return "2025-01-15";
    case "select":
      return "";
    default:
      return "";
  }
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
 * Headers match the labelEs values for Spanish locale compatibility
 */
export const CSV_TEMPLATES = {
  // Traditional logistics: weight + volume
  LOGISTICS: {
    name: "Logística Tradicional",
    description: "Peso y volumen como restricciones principales",
    example: `trackcode;nombre_cliente;direccion;latitud;longitud;peso;volumen
ORD-001;Juan Pérez;Av. Corrientes 1234;-34.6037;-58.3816;500;5
ORD-002;María García;Av. Santa Fe 2000;-34.5955;-58.3911;1000;10`,
  },

  // High-value goods: value-based
  HIGH_VALUE: {
    name: "Productos de Alto Valor",
    description: "Valorizado y tipo de pedido para priorización",
    example: `trackcode;nombre_cliente;direccion;latitud;longitud;valorizado;tipo_pedido;prioridad
ORD-001;Juan Pérez;Av. Corrientes 1234;-34.6037;-58.3816;150000;NUEVO;50
ORD-002;María García;Av. Santa Fe 2000;-34.5955;-58.3911;250000;URGENTE;100`,
  },

  // Simple delivery: units only
  SIMPLE: {
    name: "Entrega Simple",
    description: "Solo conteo de unidades",
    example: `trackcode;nombre_cliente;direccion;latitud;longitud;unidades
ORD-001;Juan Pérez;Av. Corrientes 1234;-34.6037;-58.3816;3
ORD-002;María García;Av. Santa Fe 2000;-34.5955;-58.3911;5`,
  },
} as const;
