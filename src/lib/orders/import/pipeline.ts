import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  companyFieldDefinitions,
  csvColumnMappingTemplates,
  orders,
} from "@/db/schema";
import {
  batchInsertOrders,
  updateTableStatistics,
} from "@/lib/orders/batch-operations";
import {
  type FieldDefinition,
  applyDefaults,
  validateCustomFields,
} from "@/lib/custom-fields/validation";
import { mapCSVRow, suggestColumnMapping } from "@/lib/orders/csv-column-mapping";
import { safeParseJson } from "@/lib/utils/safe-json";
import { createValidationError, calculateErrorSummary } from "./errors";
import { mapCSVRowToOrder } from "./mapping";
import { decodeCsvBase64, detectCSVDelimiter, parseCSV } from "./parse";
import { resolveTimeWindowPresets } from "./presets";
import {
  type CsvImportRequest,
  type CSVRecordValidationResult,
  type CSVValidationError,
  ERROR_TYPES,
} from "./types";
import { validateOrderRow } from "./validation";

export interface ProcessCsvImportContext {
  companyId: string;
}

/**
 * Discriminated result of the CSV import pipeline. Error cases carry
 * the exact status code the route handler should use, preserving the
 * original HTTP behavior.
 */
export type ProcessCsvImportResult =
  | { kind: "error"; status: number; body: Record<string, unknown> }
  | { kind: "success"; status: number; body: Record<string, unknown> };

/**
 * Orchestrate the full CSV import flow:
 * optional template lookup -> base64 decode -> parse -> validate -> preset resolution ->
 * custom fields -> either return preview (validate-only) or run batch insert.
 *
 * Mirrors the original route handler exactly, including response shapes
 * and HTTP status codes.
 */
export async function processCsvImport(
  input: CsvImportRequest,
  context: ProcessCsvImportContext,
): Promise<ProcessCsvImportResult> {
  // Load template mapping if templateId is provided
  let templateMapping: Record<string, string> | undefined;
  if (input.templateId) {
    const template = await db
      .select()
      .from(csvColumnMappingTemplates)
      .where(
        and(
          eq(csvColumnMappingTemplates.id, input.templateId),
          eq(csvColumnMappingTemplates.companyId, context.companyId),
          eq(csvColumnMappingTemplates.active, true),
        ),
      );

    if (template.length === 0) {
      return {
        kind: "error",
        status: 404,
        body: { error: "Template not found or inactive" },
      };
    }

    templateMapping = safeParseJson(template[0].columnMapping);
  }

  // Merge custom mapping with template mapping (custom takes precedence)
  const effectiveMapping = {
    ...templateMapping,
    ...input.columnMapping,
  };

  // Decode + validate base64 CSV payload
  const decoded = decodeCsvBase64(input.csvContent);
  if (!decoded.ok) {
    if (decoded.error === "too_large") {
      return {
        kind: "error",
        status: 400,
        body: { error: "CSV file is too large. Maximum size is 10MB." },
      };
    }
    if (decoded.error === "invalid_base64") {
      return {
        kind: "error",
        status: 400,
        body: { error: "Invalid base64 encoding" },
      };
    }
    // empty
    return {
      kind: "error",
      status: 400,
      body: { error: "CSV file is empty" },
    };
  }
  const csvContent = decoded.content;

  // Detect delimiter and parse CSV
  const delimiter = detectCSVDelimiter(csvContent);
  const rows = parseCSV(csvContent, delimiter);

  if (rows.length === 0) {
    return {
      kind: "error",
      status: 400,
      body: { error: "No data rows found in CSV" },
    };
  }

  // Generate column mapping suggestions if no mapping provided
  const csvHeaders = Object.keys(rows[0]);
  let finalMapping = effectiveMapping;

  if (Object.keys(finalMapping).length === 0) {
    // Auto-generate mapping using similarity algorithm
    const suggestions = suggestColumnMapping(csvHeaders);
    finalMapping = suggestions.suggestedMapping;
  }

  // Check for required headers after mapping
  const normalizedHeaders = Object.keys(rows[0]).map((h) =>
    h.toLowerCase().trim(),
  );
  const hasTrackingId = normalizedHeaders.some((h) =>
    ["tracking_id", "tracking id", "trackingid", "trackingid"].includes(h),
  );

  if (!hasTrackingId) {
    return {
      kind: "error",
      status: 400,
      body: {
        error: "Missing required field",
        details: "CSV must contain a tracking ID column",
        requiredFields: ["tracking_id", "address", "latitude", "longitude"],
        foundHeaders: Object.keys(rows[0]),
        suggestedMapping: finalMapping,
      },
    };
  }

  // Validate all rows and collect errors with record separation
  const allErrors: CSVValidationError[] = [];
  const validRecords: CSVRecordValidationResult[] = [];
  const invalidRecords: CSVRecordValidationResult[] = [];
  const seenTrackingIds = new Set<string>();

  // Check for existing tracking IDs in database BEFORE any validation
  const trackingIdsInCSV = rows
    .map((row) => {
      const mapped =
        Object.keys(finalMapping).length > 0
          ? mapCSVRow(row, finalMapping)
          : mapCSVRowToOrder(row);
      return mapped.trackingId;
    })
    .filter((id): id is string => !!id);

  const existingOrders = await db
    .select({ trackingId: orders.trackingId })
    .from(orders)
    .where(
      and(
        eq(orders.companyId, context.companyId),
        eq(orders.active, true),
        inArray(orders.trackingId, trackingIdsInCSV),
      ),
    );

  const existingTrackingIds = new Set(
    existingOrders.map((o) => o.trackingId),
  );

  // Validate each row and separate valid/invalid records
  rows.forEach((row, index) => {
    const rowIndex = index + 2; // +1 for 0-based index, +1 for header row
    const rowErrors = validateOrderRow(
      row,
      rowIndex,
      seenTrackingIds,
      finalMapping,
    );
    const orderData =
      Object.keys(finalMapping).length > 0
        ? mapCSVRow(row, finalMapping)
        : mapCSVRowToOrder(row);

    // Check for duplicate with existing orders in database
    if (existingTrackingIds.has(orderData.trackingId)) {
      rowErrors.push(
        createValidationError(
          rowIndex,
          "trackingId",
          `Tracking ID already exists in database: ${orderData.trackingId}`,
          "critical",
          ERROR_TYPES.DUPLICATE,
          orderData.trackingId,
        ),
      );
    }

    // Create record validation result
    const recordResult: CSVRecordValidationResult = {
      row: rowIndex,
      valid: rowErrors.length === 0,
      trackingId: orderData.trackingId,
      errors: rowErrors,
    };

    if (rowErrors.length > 0) {
      invalidRecords.push(recordResult);
      allErrors.push(...rowErrors);
    } else {
      validRecords.push(recordResult);
    }
  });

  // Map valid rows to order data for further validation
  // Use a Map keyed by row number so we can retrieve resolved data later
  const orderDataByRow = new Map<number, Record<string, string>>();
  const orderDataList: Array<Record<string, string>> = [];
  for (const record of validRecords) {
    const row = rows.find((_, i) => i + 2 === record.row);
    if (!row) {
      throw new Error(`Row not found for record at row ${record.row}`);
    }
    const data = Object.keys(finalMapping).length > 0
      ? mapCSVRow(row, finalMapping)
      : mapCSVRowToOrder(row, input.columnMapping);
    orderDataList.push(data);
    orderDataByRow.set(record.row, data);
  }

  // Resolve time window presets (by ID or name) into direct time windows
  const presetErrors = await resolveTimeWindowPresets(
    orderDataList,
    context.companyId,
  );

  // Add preset errors to both allErrors and update affected records
  if (presetErrors.length > 0) {
    allErrors.push(...presetErrors);

    // Move records with preset errors from valid to invalid
    presetErrors.forEach((error) => {
      const validRecordIndex = validRecords.findIndex(
        (r) => r.row === error.row,
      );
      if (validRecordIndex !== -1) {
        const record = validRecords.splice(validRecordIndex, 1)[0];
        record.valid = false;
        record.errors.push(error);
        invalidRecords.push(record);
      }
    });
  }

  // Validate custom fields from CSV columns matching field definitions
  const fieldDefs = await db
    .select({
      id: companyFieldDefinitions.id,
      code: companyFieldDefinitions.code,
      label: companyFieldDefinitions.label,
      fieldType: companyFieldDefinitions.fieldType,
      required: companyFieldDefinitions.required,
      options: companyFieldDefinitions.options,
      defaultValue: companyFieldDefinitions.defaultValue,
      validationRules: companyFieldDefinitions.validationRules,
    })
    .from(companyFieldDefinitions)
    .where(
      and(
        eq(companyFieldDefinitions.companyId, context.companyId),
        eq(companyFieldDefinitions.entity, "orders"),
        eq(companyFieldDefinitions.showInCsv, true),
        eq(companyFieldDefinitions.active, true),
      ),
    )
    .orderBy(asc(companyFieldDefinitions.position));

  const typedFieldDefs: FieldDefinition[] = fieldDefs.map((d) => ({
    ...d,
    options: d.options as string[] | null,
    validationRules: d.validationRules as FieldDefinition["validationRules"],
  }));

  // Extract and validate custom field values per valid record
  const customFieldsByRow = new Map<number, Record<string, unknown>>();
  const fieldCodes = new Set(typedFieldDefs.map((d) => d.code));

  if (typedFieldDefs.length > 0) {
    // Check which valid records have custom field data in CSV columns
    for (let i = validRecords.length - 1; i >= 0; i--) {
      const record = validRecords[i];
      const row = rows.find((_, idx) => idx + 2 === record.row);
      if (!row) continue;

      // Extract custom field values from CSV columns matching definition codes
      const customValues: Record<string, unknown> = {};
      for (const [csvKey, csvValue] of Object.entries(row)) {
        const normalizedKey = csvKey.trim();
        if (fieldCodes.has(normalizedKey) && csvValue !== "") {
          customValues[normalizedKey] = csvValue;
        }
      }

      // Apply defaults for missing fields
      const withDefaults = applyDefaults(typedFieldDefs, customValues);

      // Validate custom fields
      const cfErrors = validateCustomFields(typedFieldDefs, withDefaults);
      if (cfErrors.length > 0) {
        const csvErrors: CSVValidationError[] = cfErrors.map((e) =>
          createValidationError(
            record.row,
            e.code,
            e.message,
            "critical",
            ERROR_TYPES.VALIDATION,
          ),
        );
        allErrors.push(...csvErrors);

        // Move from valid to invalid
        const [removed] = validRecords.splice(i, 1);
        removed.valid = false;
        removed.errors.push(...csvErrors);
        invalidRecords.push(removed);
      } else {
        customFieldsByRow.set(record.row, withDefaults);
      }
    }
  }

  // Calculate summary statistics
  const summary = calculateErrorSummary(allErrors);

  // Generate preview (first 10 rows with mapped field names)
  const preview = rows.slice(0, 10).map((row, index) => ({
    row: index + 2,
    ...(Object.keys(finalMapping).length > 0
      ? mapCSVRow(row, finalMapping)
      : mapCSVRowToOrder(row, input.columnMapping)),
  }));

  // If not processing, return complete validation results
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
        // Include column mapping information in response
        columnMapping: finalMapping,
        csvHeaders,
        templateId: input.templateId,
      },
    };
  }

  // Process and import valid rows (only if no critical errors)
  const criticalErrors = allErrors.filter((e) => e.severity === "critical");
  let importedCount = 0;
  const importErrors: CSVValidationError[] = [];

  if (validRecords.length > 0 && criticalErrors.length === 0) {
    // Use the already-resolved orderDataByRow (with time window presets resolved)
    const finalOrderDataList = validRecords.map((record) => {
      const data = orderDataByRow.get(record.row);
      if (!data) {
        throw new Error(`Order data not found for record at row ${record.row}`);
      }
      return { data, rowNum: record.row };
    });

    // Use optimized batch insert for large datasets (Story 17.1)
    try {
      const batchResult = await batchInsertOrders(
        finalOrderDataList.map(({ data, rowNum }) => ({
          trackingId: String(data.trackingId),
          customerName: data.customerName ? String(data.customerName) : null,
          customerPhone: data.customerPhone
            ? String(data.customerPhone)
            : null,
          customerEmail: data.customerEmail
            ? String(data.customerEmail)
            : null,
          address: String(data.address),
          latitude: String(data.latitude),
          longitude: String(data.longitude),
          timeWindowPresetId: data.timeWindowPresetId || null,
          strictness: (data.strictness === "HARD" ||
          data.strictness === "SOFT"
            ? data.strictness
            : null) as "HARD" | "SOFT" | null,
          promisedDate: data.promisedDate
            ? new Date(data.promisedDate)
            : null,
          weightRequired: data.weightRequired
            ? parseInt(String(data.weightRequired), 10)
            : null,
          volumeRequired: data.volumeRequired
            ? parseInt(String(data.volumeRequired), 10)
            : null,
          // New fields for multi-company support
          orderValue: data.orderValue
            ? parseInt(String(data.orderValue), 10)
            : null,
          unitsRequired: data.unitsRequired
            ? parseInt(String(data.unitsRequired), 10)
            : null,
          orderType: (data.orderType === "NEW" ||
          data.orderType === "RESCHEDULED" ||
          data.orderType === "URGENT"
            ? data.orderType
            : null) as "NEW" | "RESCHEDULED" | "URGENT" | null,
          priority: data.priority
            ? parseInt(String(data.priority), 10)
            : null,
          timeWindowStart: data.timeWindowStart
            ? String(data.timeWindowStart)
            : null,
          timeWindowEnd: data.timeWindowEnd
            ? String(data.timeWindowEnd)
            : null,
          requiredSkills: data.requiredSkills
            ? String(data.requiredSkills)
            : null,
          notes: data.notes ? String(data.notes) : null,
          customFields: customFieldsByRow.get(rowNum) || null,
        })),
        context.companyId,
        {
          batchSize: 500, // Optimized for PostgreSQL
          timeout: 300000, // 5 minutes timeout
        },
      );

      importedCount = batchResult.inserted;

      // Add batch errors to import errors
      if (batchResult.errors.length > 0) {
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
      }

      // Update table statistics for improved query performance (Story 17.1)
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
      // Include column mapping information in response
      columnMapping: finalMapping,
      csvHeaders,
      templateId: input.templateId,
    },
  };
}
