import type {
  HeaderValidationResult,
  ProfileField,
  ProfileSchema,
  RowValidationResult,
} from "./types";

/** Lowercase + trim + remove surrounding quotes. */
function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/^"|"$/g, "");
}

/** Build a lookup table: any recognized header (normalized) → field.key. */
function buildHeaderIndex(
  schema: ProfileSchema,
): Map<string, { key: string; confidence: "exact" | "alias" }> {
  const idx = new Map<string, { key: string; confidence: "exact" | "alias" }>();
  for (const field of schema.fields) {
    // Canonical label wins (exact match).
    idx.set(normalizeHeader(field.label), { key: field.key, confidence: "exact" });
    idx.set(normalizeHeader(field.key), { key: field.key, confidence: "exact" });
    if (field.labelEn) {
      idx.set(normalizeHeader(field.labelEn), { key: field.key, confidence: "exact" });
    }
    for (const alias of field.aliases ?? []) {
      const norm = normalizeHeader(alias);
      // Don't overwrite an exact match with an alias.
      if (!idx.has(norm)) idx.set(norm, { key: field.key, confidence: "alias" });
    }
  }
  return idx;
}

/**
 * Given the header row of an uploaded CSV, decide which fields each header
 * belongs to, what's missing, what's unknown.
 */
export function validateCsvHeaders(
  headers: string[],
  schema: ProfileSchema,
): HeaderValidationResult {
  const index = buildHeaderIndex(schema);
  const mapping: Record<string, string> = {};
  const ambiguous: HeaderValidationResult["ambiguous"] = [];
  const extra: string[] = [];
  const mappedKeys = new Set<string>();

  for (const header of headers) {
    const norm = normalizeHeader(header);
    const direct = index.get(norm);
    if (direct) {
      mapping[header] = direct.key;
      mappedKeys.add(direct.key);
      if (direct.confidence === "alias") {
        ambiguous.push({ header, resolvedKey: direct.key, confidence: "alias" });
      }
      continue;
    }

    // Partial: the header contains a known token or vice versa.
    let partial: { key: string } | null = null;
    for (const [knownNorm, entry] of index) {
      if (norm.includes(knownNorm) || knownNorm.includes(norm)) {
        partial = { key: entry.key };
        break;
      }
    }
    if (partial) {
      mapping[header] = partial.key;
      mappedKeys.add(partial.key);
      ambiguous.push({ header, resolvedKey: partial.key, confidence: "partial" });
    } else {
      extra.push(header);
    }
  }

  const missing = schema.fields
    .filter((f) => f.required && !mappedKeys.has(f.key))
    .map((f) => f.key);

  return { mapping, missing, extra, ambiguous };
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

function coerce(value: string, field: ProfileField): { value: unknown; error: string | null } {
  const raw = value.trim();
  switch (field.kind) {
    case "number":
    case "currency": {
      const n = Number(raw);
      if (!Number.isFinite(n)) return { value: null, error: `${field.label} debe ser un número` };
      return { value: n, error: null };
    }
    case "boolean": {
      if (raw === "true" || raw === "1") return { value: true, error: null };
      if (raw === "false" || raw === "0") return { value: false, error: null };
      return { value: null, error: `${field.label} debe ser verdadero/falso` };
    }
    case "date": {
      const ts = Date.parse(raw);
      if (Number.isNaN(ts)) return { value: null, error: `${field.label} debe ser una fecha válida` };
      return { value: new Date(ts).toISOString(), error: null };
    }
    case "time": {
      if (field.rules?.pattern && !new RegExp(field.rules.pattern).test(raw)) {
        return { value: null, error: `${field.label} debe tener formato HH:MM` };
      }
      return { value: raw, error: null };
    }
    case "enum": {
      if (!field.enumValues || field.enumValues.length === 0) {
        return { value: raw, error: null };
      }
      const match = field.enumValues.find(
        (v) => v.toLowerCase() === raw.toLowerCase(),
      );
      if (!match) {
        return {
          value: null,
          error: `${field.label} debe ser uno de: ${field.enumValues.join(", ")}`,
        };
      }
      return { value: match, error: null };
    }
    case "email": {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
        return { value: null, error: `${field.label} debe ser un email válido` };
      }
      return { value: raw, error: null };
    }
    case "phone":
    case "string":
    default:
      return { value: raw, error: null };
  }
}

function applyRules(
  value: unknown,
  field: ProfileField,
): string | null {
  const rules = field.rules;
  if (!rules) return null;

  if (typeof value === "number") {
    if (rules.min !== undefined && value < rules.min) {
      return `${field.label} debe ser >= ${rules.min}`;
    }
    if (rules.max !== undefined && value > rules.max) {
      return `${field.label} debe ser <= ${rules.max}`;
    }
  }

  if (typeof value === "string") {
    if (rules.minLength !== undefined && value.length < rules.minLength) {
      return `${field.label} requiere al menos ${rules.minLength} caracteres`;
    }
    if (rules.maxLength !== undefined && value.length > rules.maxLength) {
      return `${field.label} excede ${rules.maxLength} caracteres`;
    }
    if (rules.pattern && !new RegExp(rules.pattern).test(value)) {
      return `${field.label} no tiene el formato esperado`;
    }
  }

  return null;
}

/**
 * Validate ONLY the custom-field subset of a pre-typed value map against the
 * schema — useful when orders are created via the JSON API (not CSV) and the
 * caller already has typed values. Returns per-field error list mirroring the
 * row validator output for custom-field definitions.
 */
export function validateCustomFieldValues(
  values: Record<string, unknown>,
  schema: ProfileSchema,
): RowValidationResult["errors"] {
  const errors: RowValidationResult["errors"] = [];
  for (const field of schema.fields) {
    if (field.origin !== "custom") continue;
    const raw = values[field.key];
    const empty = isEmpty(raw);
    if (empty) {
      if (field.required) {
        errors.push({
          fieldKey: field.key,
          label: field.label,
          message: `${field.label} es requerido`,
        });
      }
      continue;
    }
    const { value, error } = coerce(String(raw), field);
    if (error) {
      errors.push({ fieldKey: field.key, label: field.label, message: error });
      continue;
    }
    const ruleError = applyRules(value, field);
    if (ruleError) {
      errors.push({ fieldKey: field.key, label: field.label, message: ruleError });
    }
  }
  return errors;
}

/**
 * Apply default values (from schema custom-field definitions) to a map.
 * Only fills fields that are missing/empty. Pure — does not validate.
 */
export function applyCustomFieldDefaults(
  values: Record<string, unknown>,
  schema: ProfileSchema,
): Record<string, unknown> {
  const out = { ...values };
  for (const field of schema.fields) {
    if (field.origin !== "custom") continue;
    if (field.defaultValue === undefined) continue;
    if (out[field.key] === undefined || out[field.key] === "") {
      out[field.key] = field.defaultValue;
    }
  }
  return out;
}

/**
 * Validate one CSV row (keyed by field.key after mapping) against the schema.
 * Applies defaults, type coercion, and per-field rules.
 */
export function validateCsvRow(
  row: Record<string, string>,
  schema: ProfileSchema,
): RowValidationResult {
  const normalized: Record<string, unknown> = {};
  const errors: RowValidationResult["errors"] = [];

  for (const field of schema.fields) {
    const raw = row[field.key];
    const empty = isEmpty(raw);

    if (empty) {
      if (field.required) {
        errors.push({
          fieldKey: field.key,
          label: field.label,
          message: `${field.label} es requerido`,
        });
        continue;
      }
      if (field.defaultValue !== undefined) {
        normalized[field.key] = field.defaultValue;
      }
      continue;
    }

    const { value, error } = coerce(String(raw), field);
    if (error) {
      errors.push({ fieldKey: field.key, label: field.label, message: error });
      continue;
    }

    const ruleError = applyRules(value, field);
    if (ruleError) {
      errors.push({ fieldKey: field.key, label: field.label, message: ruleError });
      continue;
    }

    normalized[field.key] = value;
  }

  return { ok: errors.length === 0, errors, normalized };
}
