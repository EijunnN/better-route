/**
 * ProfileSchema — single source of truth for "what does company X's CSV import look like".
 *
 * Unifies what used to be spread across companyOptimizationProfiles,
 * companyFieldDefinitions, csvColumnMappingTemplates, capacity-mapper,
 * dynamic-csv-fields and csv-column-mapping.
 *
 * The resolver (resolve.ts) produces ONE ProfileSchema per company. Every
 * downstream concern (CSV template, validation, capacity vector, UI preview)
 * reads only from this object — no more scattered DB queries per request.
 */

import type { ORDER_TYPES } from "@/db/schema";

/** Capacity dimensions a company may activate. Order determines solver vector layout. */
export type CapacityDimension = "WEIGHT" | "VOLUME" | "VALUE" | "UNITS";

/** Kind of CSV field. Drives parser + live validation. */
export type FieldKind =
  | "string"
  | "number"
  | "enum"
  | "time"
  | "date"
  | "boolean"
  | "currency"
  | "phone"
  | "email";

/** One field the import expects (or allows) in the CSV. */
export interface ProfileField {
  /** Canonical internal key (camelCase). Used by downstream code. */
  key: string;
  /** Display label in Spanish — also the default CSV header. */
  label: string;
  /** Display label in English for i18n. */
  labelEn?: string;
  /** When true, this column MUST be present AND non-empty. */
  required: boolean;
  kind: FieldKind;
  /** Short help text for the UI. */
  description: string;
  /** An example value (used in the downloadable template). */
  example: string;
  /** For `enum` fields, the list of accepted values (case-insensitive). */
  enumValues?: string[];
  /** Value constraints checked against parsed values. */
  rules?: {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
  };
  /** Alternative header names the auto-mapper will recognize. Always includes the canonical label. */
  aliases?: string[];
  /** Optional default applied when the column is absent/empty. */
  defaultValue?: string | number | boolean;
  /** Origin of this field: built-in vs per-company custom. */
  origin: "system" | "custom";
  /** For custom fields only — the definition ID in companyFieldDefinitions. */
  customFieldId?: string;
}

/** Priority score mapping per orderType. */
export type PriorityMap = Partial<Record<keyof typeof ORDER_TYPES, number>>;

/**
 * A time-window preset the company has configured. Used by the pipeline to
 * resolve `timeWindowPresetId` references in incoming CSV rows.
 */
export interface TimeWindowPresetRef {
  id: string;
  name: string;
  type: "SHIFT" | "RANGE" | "EXACT";
  startTime?: string | null;
  endTime?: string | null;
  exactTime?: string | null;
  toleranceMinutes?: number | null;
  strictness: "HARD" | "SOFT";
}

/**
 * Resolved profile schema for a company. Immutable snapshot.
 */
export interface ProfileSchema {
  companyId: string;
  /** Database profile id (or "default" if the company has none saved). */
  profileId: string;
  /** Capacity dimensions active for this company in solver-vector order. */
  activeDimensions: CapacityDimension[];
  /** Priority score by order type. Used when enableOrderType is on. */
  priorityMapping: PriorityMap;
  /** When true, CSV must include an orderType column. */
  requireOrderType: boolean;
  /** System + custom fields the CSV may/must include. Order matters for templates. */
  fields: ProfileField[];
  /** Pre-configured time-window presets reachable by id or name. */
  timeWindowPresets: TimeWindowPresetRef[];
  /** Defaults applied by the company profile (not per-field). */
  defaults: {
    /** Default time-window preset id applied when CSV row omits a time window. */
    defaultTimeWindowPresetId?: string;
  };
  /** Timestamp the schema was resolved — useful for UI caching. */
  resolvedAt: string;
}

/** Outcome of matching CSV headers to a schema. */
export interface HeaderValidationResult {
  /** Headers mapped to ProfileField.key. */
  mapping: Record<string, string>;
  /** Required field keys that couldn't be mapped from any header. */
  missing: string[];
  /** Headers present in the CSV that didn't map to any known field. */
  extra: string[];
  /** Headers mapped via fuzzy/alias match — caller may want to confirm. */
  ambiguous: Array<{ header: string; resolvedKey: string; confidence: "exact" | "alias" | "partial" }>;
}

/** Per-row validation outcome. */
export interface RowValidationResult {
  ok: boolean;
  errors: Array<{
    fieldKey: string;
    label: string;
    message: string;
  }>;
  /** Normalized values (type-coerced, defaults applied). */
  normalized: Record<string, unknown>;
}
