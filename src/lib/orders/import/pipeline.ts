import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { csvColumnMappingTemplates, orders } from "@/db/schema";
import {
  batchInsertOrders,
  updateTableStatistics,
} from "@/lib/orders/batch-operations";
import {
  resolveProfileSchema,
  validateCsvHeaders,
  validateCsvRow,
  type ProfileSchema,
  type TimeWindowPresetRef,
} from "@/lib/orders/profile-schema";
import { safeParseJson } from "@/lib/utils/safe-json";
import { calculateErrorSummary, createValidationError } from "./errors";
import { decodeCsvBase64, detectCSVDelimiter, parseCSV } from "./parse";
import {
  ERROR_TYPES,
  type CSVRecordValidationResult,
  type CSVValidationError,
  type CsvImportRequest,
} from "./types";

export interface ProcessCsvImportContext {
  companyId: string;
}

export type ProcessCsvImportResult =
  | { kind: "error"; status: number; body: Record<string, unknown> }
  | { kind: "success"; status: number; body: Record<string, unknown> };

// ── internal helpers ────────────────────────────────────────────────────────

/**
 * Load a saved column-mapping template when the caller passes a templateId.
 * Returns the mapping or an error discriminated result.
 */
async function loadTemplateMapping(
  templateId: string,
  companyId: string,
): Promise<
  | { ok: true; mapping: Record<string, string> }
  | { ok: false; response: ProcessCsvImportResult }
> {
  const rows = await db
    .select()
    .from(csvColumnMappingTemplates)
    .where(
      and(
        eq(csvColumnMappingTemplates.id, templateId),
        eq(csvColumnMappingTemplates.companyId, companyId),
        eq(csvColumnMappingTemplates.active, true),
      ),
    );
  if (rows.length === 0) {
    return {
      ok: false,
      response: {
        kind: "error",
        status: 404,
        body: { error: "Template not found or inactive" },
      },
    };
  }
  return { ok: true, mapping: safeParseJson(rows[0].columnMapping) ?? {} };
}

/**
 * Rewrite a raw CSV row (keyed by original headers) using the header→fieldKey
 * mapping decided upfront. Headers not in the mapping are dropped.
 */
function remapRow(
  row: Record<string, string>,
  mapping: Record<string, string>,
): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [header, fieldKey] of Object.entries(mapping)) {
    const value = row[header];
    if (value !== undefined) mapped[fieldKey] = value;
  }
  return mapped;
}

/**
 * Resolve timeWindowPresetId (either a UUID or a preset name) against the
 * schema's bundled presets, in place. No DB call — the schema already carries
 * the presets. Returns any validation errors it encounters.
 */
function resolvePresetsInPlace(
  normalized: Record<string, unknown>,
  rowIndex: number,
  presets: TimeWindowPresetRef[],
): CSVValidationError[] {
  const errors: CSVValidationError[] = [];

  // Direct time windows take precedence.
  if (normalized.timeWindowStart && normalized.timeWindowEnd) return errors;

  const rawRef = normalized.timeWindowPresetId;
  if (typeof rawRef !== "string" || rawRef.trim() === "") return errors;
  const ref = rawRef.trim();

  const preset =
    presets.find((p) => p.id === ref) ||
    presets.find((p) => p.name.toUpperCase() === ref.toUpperCase());

  if (!preset) {
    errors.push(
      createValidationError(
        rowIndex,
        "timeWindowPresetId",
        `Preset de ventana horaria no encontrado: ${ref}. ` +
          `Disponibles: ${presets.map((p) => p.name).join(", ") || "(ninguno)"}`,
        "critical",
        ERROR_TYPES.REFERENCE,
        ref,
      ),
    );
    return errors;
  }

  normalized.timeWindowPresetId = preset.id;
  if (preset.startTime && preset.endTime) {
    normalized.timeWindowStart = String(preset.startTime);
    normalized.timeWindowEnd = String(preset.endTime);
  }
  if (!normalized.strictness && preset.strictness) {
    normalized.strictness = preset.strictness;
  }
  return errors;
}

// ── main pipeline ───────────────────────────────────────────────────────────

/**
 * Orchestrate the full CSV import flow against the unified ProfileSchema.
 *
 * Phases:
 *   1. Resolve the company's ProfileSchema (one DB round trip, parallel queries).
 *   2. Decode + parse the base64 CSV payload.
 *   3. Decide the header → fieldKey mapping (explicit request > saved template
 *      > schema auto-resolution).
 *   4. Validate each row against the schema (types, rules, required).
 *   5. Check tracking_id uniqueness within the file + against the database.
 *   6. Resolve time-window preset references in memory.
 *   7. Either return a validation preview OR run the batch insert.
 */
export async function processCsvImport(
  input: CsvImportRequest,
  context: ProcessCsvImportContext,
): Promise<ProcessCsvImportResult> {
  // 1 — Load the schema up front. Everything downstream reads from it.
  const schema: ProfileSchema = await resolveProfileSchema(context.companyId);

  // 2 — Decode + parse.
  const decoded = decodeCsvBase64(input.csvContent);
  if (!decoded.ok) {
    const msg =
      decoded.error === "too_large"
        ? "CSV file is too large. Maximum size is 10MB."
        : decoded.error === "invalid_base64"
          ? "Invalid base64 encoding"
          : "CSV file is empty";
    return { kind: "error", status: 400, body: { error: msg } };
  }
  const csvContent = decoded.content;
  const delimiter = detectCSVDelimiter(csvContent);
  const rows = parseCSV(csvContent, delimiter);
  if (rows.length === 0) {
    return {
      kind: "error",
      status: 400,
      body: { error: "No data rows found in CSV" },
    };
  }

  const csvHeaders = Object.keys(rows[0]);

  // 3 — Decide the header mapping. Caller may pass a templateId or an explicit
  // columnMapping; otherwise we auto-resolve via the schema.
  let templateMapping: Record<string, string> | undefined;
  if (input.templateId) {
    const templateResult = await loadTemplateMapping(
      input.templateId,
      context.companyId,
    );
    if (!templateResult.ok) return templateResult.response;
    templateMapping = templateResult.mapping;
  }

  const explicit: Record<string, string> = {
    ...(templateMapping ?? {}),
    ...(input.columnMapping ?? {}),
  };

  const autoValidation = validateCsvHeaders(csvHeaders, schema);
  // Caller overrides win, then schema auto-resolution fills the rest.
  const headerMapping: Record<string, string> = {
    ...autoValidation.mapping,
    ...explicit,
  };

  if (autoValidation.missing.length > 0 && Object.keys(explicit).length === 0) {
    return {
      kind: "error",
      status: 400,
      body: {
        error: "Missing required field",
        details: `Required columns missing: ${autoValidation.missing.join(", ")}`,
        requiredFields: schema.fields
          .filter((f) => f.required)
          .map((f) => f.key),
        foundHeaders: csvHeaders,
        suggestedMapping: headerMapping,
      },
    };
  }

  // 4 + 5 — Validate each row and check for duplicates.
  const allErrors: CSVValidationError[] = [];
  const validRecords: CSVRecordValidationResult[] = [];
  const invalidRecords: CSVRecordValidationResult[] = [];
  const seenTrackingIds = new Set<string>();
  const normalizedByRow = new Map<number, Record<string, unknown>>();

  // Pre-fetch existing tracking IDs in the DB so we can flag duplicates.
  const trackingIdsInCsv: string[] = [];
  const tentativeByRow: Array<{
    rowIndex: number;
    normalized: Record<string, unknown>;
    rowErrors: CSVValidationError[];
  }> = [];

  rows.forEach((rawRow, i) => {
    const rowIndex = i + 2; // human row number (1 = header)
    const remapped = remapRow(rawRow, headerMapping);
    const result = validateCsvRow(remapped, schema);

    const rowErrors: CSVValidationError[] = result.errors.map((e) =>
      createValidationError(
        rowIndex,
        e.fieldKey,
        e.message,
        "critical",
        ERROR_TYPES.VALIDATION,
      ),
    );

    const trackingId = String(result.normalized.trackingId ?? "");
    if (trackingId) {
      if (seenTrackingIds.has(trackingId)) {
        rowErrors.push(
          createValidationError(
            rowIndex,
            "trackingId",
            `Duplicate trackingId within CSV: ${trackingId}`,
            "critical",
            ERROR_TYPES.DUPLICATE,
            trackingId,
          ),
        );
      } else {
        seenTrackingIds.add(trackingId);
        trackingIdsInCsv.push(trackingId);
      }
    }

    tentativeByRow.push({
      rowIndex,
      normalized: result.normalized,
      rowErrors,
    });
  });

  const existingOrders = trackingIdsInCsv.length
    ? await db
        .select({ trackingId: orders.trackingId })
        .from(orders)
        .where(
          and(
            eq(orders.companyId, context.companyId),
            eq(orders.active, true),
            inArray(orders.trackingId, trackingIdsInCsv),
          ),
        )
    : [];
  const existingTrackingIds = new Set(
    existingOrders.map((o) => o.trackingId),
  );

  for (const { rowIndex, normalized, rowErrors } of tentativeByRow) {
    const trackingId = String(normalized.trackingId ?? "");
    if (trackingId && existingTrackingIds.has(trackingId)) {
      rowErrors.push(
        createValidationError(
          rowIndex,
          "trackingId",
          `Tracking ID already exists in database: ${trackingId}`,
          "critical",
          ERROR_TYPES.DUPLICATE,
          trackingId,
        ),
      );
    }

    // 6 — Resolve time-window preset references against schema (no DB call).
    const presetErrors = resolvePresetsInPlace(
      normalized,
      rowIndex,
      schema.timeWindowPresets,
    );
    rowErrors.push(...presetErrors);

    const record: CSVRecordValidationResult = {
      row: rowIndex,
      valid: rowErrors.length === 0,
      trackingId: trackingId || undefined,
      errors: rowErrors,
    };

    if (rowErrors.length > 0) {
      invalidRecords.push(record);
      allErrors.push(...rowErrors);
    } else {
      validRecords.push(record);
      normalizedByRow.set(rowIndex, normalized);
    }
  }

  // Preview of first 10 rows (regardless of validity).
  const preview = rows.slice(0, 10).map((rawRow, i) => {
    const remapped = remapRow(rawRow, headerMapping);
    const r = validateCsvRow(remapped, schema);
    return { row: i + 2, ...r.normalized };
  });

  const summary = calculateErrorSummary(allErrors);

  if (!input.process) {
    return {
      kind: "success",
      status: 200,
      body: {
        success: true,
        totalRows: rows.length,
        validRows: validRecords.length,
        invalidRows: invalidRecords.length,
        importedRows: 0,
        errors: allErrors,
        validRecords,
        invalidRecords,
        preview,
        duplicateTrackingIds: Array.from(existingTrackingIds),
        summary,
        columnMapping: headerMapping,
        csvHeaders,
        templateId: input.templateId,
      },
    };
  }

  // 7 — Insert valid rows.
  const customFieldKeys = new Set(
    schema.fields.filter((f) => f.origin === "custom").map((f) => f.key),
  );

  let importedCount = 0;
  const importErrors: CSVValidationError[] = [];

  if (validRecords.length > 0) {
    const insertPayload = validRecords.map((record) => {
      const data = normalizedByRow.get(record.row) ?? {};
      const customFields: Record<string, unknown> = {};
      for (const key of customFieldKeys) {
        if (data[key] !== undefined) customFields[key] = data[key];
      }
      const num = (v: unknown): number | null => {
        if (v === null || v === undefined || v === "") return null;
        const n = typeof v === "number" ? v : Number(v);
        return Number.isFinite(n) ? Math.round(n) : null;
      };
      const str = (v: unknown): string | null =>
        v === null || v === undefined || v === "" ? null : String(v);

      return {
        trackingId: String(data.trackingId),
        customerName: str(data.customerName),
        customerPhone: str(data.customerPhone),
        customerEmail: str(data.customerEmail),
        address: String(data.address),
        latitude: String(data.latitude),
        longitude: String(data.longitude),
        timeWindowPresetId: str(data.timeWindowPresetId),
        strictness: (data.strictness === "HARD" || data.strictness === "SOFT"
          ? data.strictness
          : null) as "HARD" | "SOFT" | null,
        promisedDate: data.promisedDate
          ? new Date(String(data.promisedDate))
          : null,
        weightRequired: num(data.weightRequired),
        volumeRequired: num(data.volumeRequired),
        orderValue: num(data.orderValue),
        unitsRequired: num(data.unitsRequired),
        orderType: (data.orderType === "NEW" ||
        data.orderType === "RESCHEDULED" ||
        data.orderType === "URGENT"
          ? data.orderType
          : null) as "NEW" | "RESCHEDULED" | "URGENT" | null,
        priority: num(data.priority),
        timeWindowStart: str(data.timeWindowStart),
        timeWindowEnd: str(data.timeWindowEnd),
        requiredSkills: str(data.requiredSkills),
        notes: str(data.notes),
        customFields: Object.keys(customFields).length > 0 ? customFields : null,
      };
    });

    try {
      const batchResult = await batchInsertOrders(
        insertPayload,
        context.companyId,
        { batchSize: 500, timeout: 300000 },
      );
      importedCount = batchResult.inserted;

      for (const err of batchResult.errors) {
        importErrors.push(
          createValidationError(
            0,
            "batch",
            `Batch ${err.batch}: ${err.error}`,
            "critical",
            ERROR_TYPES.VALIDATION,
          ),
        );
      }

      if (batchResult.inserted > 100) {
        await updateTableStatistics("orders");
      }
    } catch (error) {
      importErrors.push(
        createValidationError(
          0,
          "general",
          error instanceof Error ? error.message : "Failed to import orders",
          "critical",
          ERROR_TYPES.VALIDATION,
        ),
      );
    }
  }

  return {
    kind: "success",
    status: importErrors.length === 0 ? 201 : 207,
    body: {
      success: importErrors.length === 0,
      totalRows: rows.length,
      validRows: validRecords.length,
      invalidRows: invalidRecords.length,
      importedRows: importedCount,
      errors: [...allErrors, ...importErrors],
      validRecords,
      invalidRecords,
      preview,
      duplicateTrackingIds: Array.from(existingTrackingIds),
      summary,
      columnMapping: headerMapping,
      csvHeaders,
      templateId: input.templateId,
    },
  };
}
