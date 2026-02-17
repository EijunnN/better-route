import type { FIELD_TYPES } from "@/db/schema";

export interface FieldDefinition {
  id: string;
  code: string;
  label: string;
  fieldType: string;
  required: boolean;
  options: string[] | null;
  defaultValue: string | null;
  validationRules: ValidationRules | null;
}

export interface ValidationRules {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
}

export interface ValidationError {
  code: string;
  label: string;
  message: string;
}

/**
 * Validates custom field values against their definitions.
 * Returns an array of validation errors (empty = valid).
 */
export function validateCustomFields(
  definitions: FieldDefinition[],
  values: Record<string, unknown>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const def of definitions) {
    const value = values[def.code];
    const isEmpty = value === undefined || value === null || value === "";

    // Required check
    if (def.required && isEmpty) {
      errors.push({
        code: def.code,
        label: def.label,
        message: `${def.label} es requerido`,
      });
      continue;
    }

    // Skip further validation if empty and not required
    if (isEmpty) continue;

    const rules = def.validationRules;

    switch (def.fieldType) {
      case "text":
      case "phone":
      case "email": {
        if (typeof value !== "string") {
          errors.push({ code: def.code, label: def.label, message: `${def.label} debe ser texto` });
          break;
        }
        if (rules?.minLength && value.length < rules.minLength) {
          errors.push({ code: def.code, label: def.label, message: `${def.label} debe tener al menos ${rules.minLength} caracteres` });
        }
        if (rules?.maxLength && value.length > rules.maxLength) {
          errors.push({ code: def.code, label: def.label, message: `${def.label} no puede exceder ${rules.maxLength} caracteres` });
        }
        if (rules?.pattern) {
          const regex = new RegExp(rules.pattern);
          if (!regex.test(value)) {
            errors.push({ code: def.code, label: def.label, message: `${def.label} no tiene un formato válido` });
          }
        }
        if (def.fieldType === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errors.push({ code: def.code, label: def.label, message: `${def.label} debe ser un email válido` });
        }
        break;
      }

      case "number":
      case "currency": {
        const num = typeof value === "number" ? value : Number(value);
        if (isNaN(num)) {
          errors.push({ code: def.code, label: def.label, message: `${def.label} debe ser un número` });
          break;
        }
        if (rules?.min !== undefined && num < rules.min) {
          errors.push({ code: def.code, label: def.label, message: `${def.label} debe ser al menos ${rules.min}` });
        }
        if (rules?.max !== undefined && num > rules.max) {
          errors.push({ code: def.code, label: def.label, message: `${def.label} no puede exceder ${rules.max}` });
        }
        break;
      }

      case "select": {
        if (def.options && Array.isArray(def.options)) {
          if (!def.options.includes(String(value))) {
            errors.push({ code: def.code, label: def.label, message: `${def.label}: valor "${value}" no es una opción válida` });
          }
        }
        break;
      }

      case "boolean": {
        if (typeof value !== "boolean" && value !== "true" && value !== "false") {
          errors.push({ code: def.code, label: def.label, message: `${def.label} debe ser verdadero o falso` });
        }
        break;
      }

      case "date": {
        if (typeof value === "string" && isNaN(Date.parse(value))) {
          errors.push({ code: def.code, label: def.label, message: `${def.label} debe ser una fecha válida` });
        }
        break;
      }
    }
  }

  return errors;
}

/**
 * Applies default values from field definitions to a custom fields object.
 * Only sets defaults for fields that are not already present.
 */
export function applyDefaults(
  definitions: FieldDefinition[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...values };

  for (const def of definitions) {
    if (def.defaultValue !== null && result[def.code] === undefined) {
      switch (def.fieldType) {
        case "number":
        case "currency":
          result[def.code] = Number(def.defaultValue);
          break;
        case "boolean":
          result[def.code] = def.defaultValue === "true";
          break;
        default:
          result[def.code] = def.defaultValue;
      }
    }
  }

  return result;
}
