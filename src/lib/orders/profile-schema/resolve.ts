import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  companyFieldDefinitions,
  companyOptimizationProfiles,
  timeWindowPresets,
} from "@/db/schema";
import { safeParseJson } from "@/lib/utils/safe-json";
import {
  asSystemField,
  CAPACITY_FIELD_BY_DIM,
  FIELD_KIND_OF_CUSTOM_TYPE,
  ORDER_TYPE_FIELD,
  PRIORITY_FIELD,
  SYSTEM_FIELD_SECTIONS,
} from "./system-fields";
import type {
  CapacityDimension,
  PriorityMap,
  ProfileField,
  ProfileSchema,
  TimeWindowPresetRef,
} from "./types";

const DEFAULT_DIMENSIONS: CapacityDimension[] = ["WEIGHT", "VOLUME"];
const DEFAULT_PRIORITY_MAPPING: PriorityMap = {
  NEW: 50,
  RESCHEDULED: 80,
  URGENT: 100,
};

/**
 * Synthesize a ProfileSchema without hitting the database. Useful as a fallback
 * when legacy callers pass `undefined` as the profile (so the solver still has
 * a vector layout) and inside tests that don't need a real company.
 */
export function defaultProfileSchema(
  companyId = "__default__",
): ProfileSchema {
  return {
    companyId,
    profileId: "default",
    activeDimensions: DEFAULT_DIMENSIONS,
    priorityMapping: DEFAULT_PRIORITY_MAPPING,
    requireOrderType: false,
    fields: [],
    timeWindowPresets: [],
    defaults: {},
    resolvedAt: new Date().toISOString(),
  };
}

/**
 * Resolve the full CSV / domain profile schema for one company.
 * One DB round trip per resource (profile, custom fields, TW presets), in parallel.
 *
 * Pure of HTTP concerns — safe to call from route handlers, the pipeline, or
 * unit tests (via a mocked db).
 */
export async function resolveProfileSchema(
  companyId: string,
): Promise<ProfileSchema> {
  const [profileRows, fieldDefs, twPresetRows] = await Promise.all([
    db
      .select()
      .from(companyOptimizationProfiles)
      .where(
        and(
          eq(companyOptimizationProfiles.companyId, companyId),
          eq(companyOptimizationProfiles.active, true),
        ),
      )
      .limit(1),
    db
      .select()
      .from(companyFieldDefinitions)
      .where(
        and(
          eq(companyFieldDefinitions.companyId, companyId),
          eq(companyFieldDefinitions.entity, "orders"),
          eq(companyFieldDefinitions.active, true),
        ),
      ),
    db
      .select()
      .from(timeWindowPresets)
      .where(
        and(
          eq(timeWindowPresets.companyId, companyId),
          eq(timeWindowPresets.active, true),
        ),
      ),
  ]);

  const profileRow = profileRows[0];

  const activeDimensions = (() => {
    if (!profileRow) return DEFAULT_DIMENSIONS;
    try {
      const parsed = safeParseJson<unknown>(profileRow.activeDimensions);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter((d): d is CapacityDimension =>
          d === "WEIGHT" || d === "VOLUME" || d === "VALUE" || d === "UNITS",
        );
      }
    } catch {
      /* fall through */
    }
    return DEFAULT_DIMENSIONS;
  })();

  const priorityMapping = (() => {
    if (!profileRow) return DEFAULT_PRIORITY_MAPPING;
    try {
      return safeParseJson<PriorityMap>(profileRow.priorityMapping) ?? DEFAULT_PRIORITY_MAPPING;
    } catch {
      return DEFAULT_PRIORITY_MAPPING;
    }
  })();

  const requireOrderType = profileRow?.enableOrderType ?? false;

  const fields: ProfileField[] = [];
  fields.push(...SYSTEM_FIELD_SECTIONS.BASE);
  fields.push(...SYSTEM_FIELD_SECTIONS.CUSTOMER);

  // Capacity fields injected in the order declared by activeDimensions, each
  // marked required because the company explicitly opted in.
  for (const dim of activeDimensions) {
    fields.push(asSystemField(CAPACITY_FIELD_BY_DIM[dim], { required: true }));
  }

  // Priority / order type fields (orderType required when enabled, priority always optional).
  if (requireOrderType) {
    fields.push(asSystemField(ORDER_TYPE_FIELD, { required: true }));
    fields.push(asSystemField(PRIORITY_FIELD));
  }

  fields.push(...SYSTEM_FIELD_SECTIONS.TIME_WINDOWS);
  fields.push(...SYSTEM_FIELD_SECTIONS.LOCATION_DETAILS);
  fields.push(...SYSTEM_FIELD_SECTIONS.EXTRAS);

  // Company-defined custom fields tacked on last.
  for (const def of fieldDefs) {
    const kind = FIELD_KIND_OF_CUSTOM_TYPE[def.fieldType] ?? "string";
    const rules = (() => {
      const raw = def.validationRules;
      if (!raw) return undefined;
      try {
        const parsed =
          typeof raw === "string" ? safeParseJson<Record<string, unknown>>(raw) : (raw as Record<string, unknown>);
        return parsed
          ? {
              minLength: typeof parsed.minLength === "number" ? parsed.minLength : undefined,
              maxLength: typeof parsed.maxLength === "number" ? parsed.maxLength : undefined,
              min: typeof parsed.min === "number" ? parsed.min : undefined,
              max: typeof parsed.max === "number" ? parsed.max : undefined,
              pattern: typeof parsed.pattern === "string" ? parsed.pattern : undefined,
            }
          : undefined;
      } catch {
        return undefined;
      }
    })();

    const options = Array.isArray(def.options)
      ? (def.options as string[])
      : typeof def.options === "string"
        ? safeParseJson<string[]>(def.options)
        : null;

    fields.push({
      key: def.code,
      label: def.label,
      labelEn: def.label,
      required: def.required,
      kind,
      description: def.label,
      example: def.defaultValue ?? "",
      enumValues: kind === "enum" && options ? options : undefined,
      rules,
      aliases: [def.code, def.label],
      defaultValue: def.defaultValue ?? undefined,
      origin: "custom",
      customFieldId: def.id,
    });
  }

  const defaultTimeWindowPresetId = (() => {
    if (!profileRow?.defaultTimeWindows) return undefined;
    try {
      const parsed = safeParseJson<unknown>(profileRow.defaultTimeWindows);
      if (typeof parsed === "string") return parsed;
      if (Array.isArray(parsed) && typeof parsed[0] === "string") return parsed[0];
    } catch {
      /* ignore */
    }
    return undefined;
  })();

  const twPresets: TimeWindowPresetRef[] = twPresetRows.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type as TimeWindowPresetRef["type"],
    startTime: p.startTime,
    endTime: p.endTime,
    exactTime: p.exactTime,
    toleranceMinutes: p.toleranceMinutes,
    strictness: p.strictness as "HARD" | "SOFT",
  }));

  return {
    companyId,
    profileId: profileRow?.id ?? "default",
    activeDimensions,
    priorityMapping,
    requireOrderType,
    fields,
    timeWindowPresets: twPresets,
    defaults: {
      defaultTimeWindowPresetId,
    },
    resolvedAt: new Date().toISOString(),
  };
}
