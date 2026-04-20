/**
 * Validation + merge for the `customFields` JSONB column on `route_stops`.
 *
 * Unlike orders (which has a full profile schema via
 * `src/lib/orders/profile-schema`), route_stops only needs a thin check: the
 * keys must match *active* field definitions with `entity="route_stops"` for
 * the calling company. Type coercion is deliberately loose so the driver app
 * doesn't have to pre-format strings vs numbers — we normalize here.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { companyFieldDefinitions } from "@/db/schema";

export type StopFieldDefinition = {
  code: string;
  fieldType: "text" | "number" | "select" | "date" | "currency" | "phone" | "email" | "boolean";
  required: boolean;
  options: string[] | null;
};

export type ValidationError = {
  code: string;
  message: string;
};

export type ValidationResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; errors: ValidationError[] };

export async function loadStopFieldDefinitions(
  companyId: string,
): Promise<StopFieldDefinition[]> {
  const rows = await db
    .select({
      code: companyFieldDefinitions.code,
      fieldType: companyFieldDefinitions.fieldType,
      required: companyFieldDefinitions.required,
      options: companyFieldDefinitions.options,
    })
    .from(companyFieldDefinitions)
    .where(
      and(
        eq(companyFieldDefinitions.companyId, companyId),
        eq(companyFieldDefinitions.entity, "route_stops"),
        eq(companyFieldDefinitions.active, true),
      ),
    );

  return rows.map((r) => ({
    code: r.code,
    fieldType: r.fieldType as StopFieldDefinition["fieldType"],
    required: r.required,
    options: (r.options as string[] | null) ?? null,
  }));
}

/**
 * Coerce and validate a single value against its definition. We keep coercion
 * permissive (e.g. "42" → 42 for numeric types) so driver devices don't all
 * need the same formatting discipline.
 */
function coerce(
  value: unknown,
  def: StopFieldDefinition,
): { ok: true; value: unknown } | { ok: false; message: string } {
  if (value === null || value === undefined || value === "") {
    return { ok: true, value: null };
  }

  switch (def.fieldType) {
    case "number":
    case "currency": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return { ok: false, message: "debe ser un número" };
      return { ok: true, value: n };
    }
    case "boolean": {
      if (typeof value === "boolean") return { ok: true, value };
      if (value === "true" || value === "false") {
        return { ok: true, value: value === "true" };
      }
      return { ok: false, message: "debe ser verdadero o falso" };
    }
    case "select": {
      const s = String(value);
      if (def.options && def.options.length > 0 && !def.options.includes(s)) {
        return {
          ok: false,
          message: `debe ser uno de: ${def.options.join(", ")}`,
        };
      }
      return { ok: true, value: s };
    }
    case "date":
    case "email":
    case "phone":
    case "text":
    default:
      return { ok: true, value: String(value) };
  }
}

/**
 * Validates a partial `customFields` payload from the client. Unknown keys are
 * rejected (to avoid writes through schema gaps). Returns the normalized
 * object to persist, or a list of errors.
 *
 * `enforceRequired` is meant for the completion path (driver marks the stop as
 * done) — when true, required fields missing in BOTH the incoming payload and
 * the `existing` object produce errors.
 */
export function validateStopCustomFields(
  payload: Record<string, unknown>,
  definitions: StopFieldDefinition[],
  existing: Record<string, unknown> | null = null,
  enforceRequired = false,
): ValidationResult {
  const defsByCode = new Map(definitions.map((d) => [d.code, d]));
  const errors: ValidationError[] = [];
  const normalized: Record<string, unknown> = { ...(existing ?? {}) };

  for (const [code, rawValue] of Object.entries(payload)) {
    const def = defsByCode.get(code);
    if (!def) {
      errors.push({
        code,
        message: `campo "${code}" no existe o fue archivado`,
      });
      continue;
    }
    const coerced = coerce(rawValue, def);
    if (!coerced.ok) {
      errors.push({ code, message: coerced.message });
      continue;
    }
    if (coerced.value === null) {
      delete normalized[code];
    } else {
      normalized[code] = coerced.value;
    }
  }

  if (enforceRequired) {
    for (const def of definitions) {
      if (def.required && (normalized[def.code] === undefined || normalized[def.code] === null)) {
        errors.push({
          code: def.code,
          message: `el campo "${def.code}" es obligatorio`,
        });
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: normalized };
}
