import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import {
  companyOptimizationProfiles,
  csvColumnMappingTemplates,
  orders,
  timeWindowPresets,
} from "@/db/schema";
import {
  batchInsertOrders,
  updateTableStatistics,
} from "@/lib/orders/batch-operations";
import { parseProfile, type CompanyOptimizationProfile } from "@/lib/optimization/capacity-mapper";
import { mapCSVRow, suggestColumnMapping } from "@/lib/orders/csv-column-mapping";
import { validateCsvRow, getCsvFieldsForProfile } from "@/lib/orders/dynamic-csv-fields";
import { requireTenantContext, setTenantContext } from "@/lib/infra/tenant";
import { orderSchema } from "@/lib/validations/order";

// CSV import request schema (updated to support templates)
const csvImportRequestSchema = z
  .object({
    // CSV content as base64 encoded string
    csvContent: z.string().min(1, "CSV content is required"),
    // Optional column mapping (maps CSV columns to order fields)
    columnMapping: z.record(z.string(), z.string()).optional(),
    // Optional template ID to use for column mapping
    templateId: z.string().uuid().optional(),
    // Whether to actually process (true) or just validate/preview (false)
    process: z.boolean().default(false),
  })
  .refine(
    (data) => !(data.columnMapping && data.templateId),
    "Cannot provide both columnMapping and templateId. Use one or the other.",
  );

// Error severity levels for better categorization
const ERROR_SEVERITY = ["critical", "warning", "info"] as const;

// CSV validation error schema
const csvValidationErrorSchema = z.object({
  row: z.number(),
  field: z.string(),
  message: z.string(),
  severity: z.enum(ERROR_SEVERITY).default("critical"),
  errorType: z.string().default("validation"),
  value: z.any().optional(),
});

// Valid/invalid record separation schema
const csvRecordValidationResultSchema = z.object({
  row: z.number(),
  valid: z.boolean(),
  trackingId: z.string().optional(),
  errors: z.array(csvValidationErrorSchema),
});

// CSV import result schema
const _csvImportResultSchema = z.object({
  success: z.boolean(),
  totalRows: z.number(),
  validRows: z.number(),
  invalidRows: z.number(),
  importedRows: z.number(),
  errors: z.array(csvValidationErrorSchema),
  validRecords: z.array(csvRecordValidationResultSchema),
  invalidRecords: z.array(csvRecordValidationResultSchema),
  preview: z.array(z.any()),
  duplicateTrackingIds: z.array(z.string()),
  summary: z.object({
    byField: z.record(z.string(), z.number()),
    bySeverity: z.record(z.string(), z.number()),
    byErrorType: z.record(z.string(), z.number()),
  }),
});

type CSVValidationError = z.infer<typeof csvValidationErrorSchema>;
type CSVRecordValidationResult = z.infer<
  typeof csvRecordValidationResultSchema
>;
type CSVRow = Record<string, string>;

// Error type constants for categorization
const ERROR_TYPES = {
  REQUIRED_FIELD: "required_field",
  FORMAT: "format",
  RANGE: "range",
  DUPLICATE: "duplicate",
  REFERENCE: "reference",
  VALIDATION: "validation",
} as const;

/**
 * Create a validation error with proper categorization
 */
function createValidationError(
  row: number,
  field: string,
  message: string,
  severity: "critical" | "warning" | "info" = "critical",
  errorType: string = ERROR_TYPES.VALIDATION,
  value?: unknown,
): CSVValidationError {
  return { row, field, message, severity, errorType, value };
}

/**
 * Calculate error summary statistics
 */
function calculateErrorSummary(errors: CSVValidationError[]) {
  const byField: Record<string, number> = {};
  const bySeverity: Record<string, number> = {
    critical: 0,
    warning: 0,
    info: 0,
  };
  const byErrorType: Record<string, number> = {};

  for (const error of errors) {
    byField[error.field] = (byField[error.field] || 0) + 1;
    bySeverity[error.severity] = (bySeverity[error.severity] || 0) + 1;
    byErrorType[error.errorType] = (byErrorType[error.errorType] || 0) + 1;
  }

  return { byField, bySeverity, byErrorType };
}

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

/**
 * Detect CSV delimiter (comma or semicolon)
 */
function detectCSVDelimiter(content: string): string {
  const firstLine = content.split("\n")[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

/**
 * Parse CSV content into array of objects
 */
function parseCSV(content: string, delimiter: string): CSVRow[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    return [];
  }

  // Parse header
  const header = parseCSVLine(lines[0], delimiter);
  const rows: CSVRow[] = [];

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], delimiter);
    if (values.length === header.length) {
      const row: CSVRow = {};
      header.forEach((key, index) => {
        row[key.trim()] = values[index]?.trim() || "";
      });
      rows.push(row);
    }
  }

  return rows;
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      // Field separator
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

/**
 * Default column mapping for CSV import
 */
const DEFAULT_COLUMN_MAPPING: Record<string, string> = {
  tracking_id: "trackingId",
  "tracking id": "trackingId",
  trackingid: "trackingId",
  "id de seguimiento": "trackingId",
  customer_name: "customerName",
  "customer name": "customerName",
  customername: "customerName",
  "nombre del cliente": "customerName",
  customer_phone: "customerPhone",
  "customer phone": "customerPhone",
  customerphone: "customerPhone",
  phone: "customerPhone",
  "telefono del cliente": "customerPhone",
  customer_email: "customerEmail",
  "customer email": "customerEmail",
  customeremail: "customerEmail",
  email: "customerEmail",
  "email del cliente": "customerEmail",
  address: "address",
  direccion: "address",
  latitude: "latitude",
  lat: "latitude",
  latitud: "latitude",
  longitude: "longitude",
  lng: "longitude",
  lon: "longitude",
  longitud: "longitude",
  time_window_preset_id: "timeWindowPresetId",
  "time window preset id": "timeWindowPresetId",
  timewindowpresetid: "timeWindowPresetId",
  preset_id: "timeWindowPresetId",
  strictness: "strictness",
  promised_date: "promisedDate",
  "promised date": "promisedDate",
  promiseddate: "promisedDate",
  weight_required: "weightRequired",
  "weight required": "weightRequired",
  weightrequired: "weightRequired",
  weight: "weightRequired",
  peso: "weightRequired",
  "peso (g)": "weightRequired",
  volume_required: "volumeRequired",
  "volume required": "volumeRequired",
  volumerequired: "volumeRequired",
  volume: "volumeRequired",
  volumen: "volumeRequired",
  "volumen (l)": "volumeRequired",
  // New fields for multi-company support
  order_value: "orderValue",
  "order value": "orderValue",
  ordervalue: "orderValue",
  value: "orderValue",
  valorizado: "orderValue",
  "valorizado (centimos)": "orderValue",
  units_required: "unitsRequired",
  "units required": "unitsRequired",
  unitsrequired: "unitsRequired",
  units: "unitsRequired",
  unidades: "unitsRequired",
  order_type: "orderType",
  "order type": "orderType",
  ordertype: "orderType",
  "tipo de pedido": "orderType",
  tipo: "orderType",
  priority: "priority",
  prioridad: "priority",
  time_window_start: "timeWindowStart",
  "time window start": "timeWindowStart",
  timewindowstart: "timeWindowStart",
  "ventana horaria inicio": "timeWindowStart",
  time_window_end: "timeWindowEnd",
  "time window end": "timeWindowEnd",
  timewindowend: "timeWindowEnd",
  "ventana horaria fin": "timeWindowEnd",
  required_skills: "requiredSkills",
  "required skills": "requiredSkills",
  requiredskills: "requiredSkills",
  skills: "requiredSkills",
  habilidades: "requiredSkills",
  "habilidades requeridas": "requiredSkills",
  notes: "notes",
  notas: "notes",
};

/**
 * Map CSV row to order input (legacy function for backward compatibility)
 * @deprecated Use mapCSVRow from @/lib/orders/csv-column-mapping instead
 */
function mapCSVRowToOrder(
  row: CSVRow,
  customMapping?: Record<string, string>,
): Record<string, string> {
  const mapping = { ...DEFAULT_COLUMN_MAPPING, ...customMapping };
  const result: Record<string, string> = {};

  for (const [csvKey, csvValue] of Object.entries(row)) {
    const normalizedKey = csvKey.toLowerCase().trim();
    const targetField = mapping[normalizedKey];

    if (targetField && csvValue) {
      result[targetField] = csvValue;
    }
  }

  return result;
}

/**
 * Validate order data from CSV row with enhanced error categorization
 */
function validateOrderRow(
  row: CSVRow,
  rowIndex: number,
  existingTrackingIds: Set<string>,
  mapping: Record<string, string> = {},
): CSVValidationError[] {
  const errors: CSVValidationError[] = [];
  // Use the provided mapping or fall back to default
  const orderData =
    Object.keys(mapping).length > 0
      ? mapCSVRow(row, mapping)
      : mapCSVRowToOrder(row);

  try {
    // Check for missing required fields first (highest priority errors)
    if (!orderData.trackingId) {
      errors.push(
        createValidationError(
          rowIndex,
          "trackingId",
          "Tracking ID is required",
          "critical",
          ERROR_TYPES.REQUIRED_FIELD,
        ),
      );
    }

    if (!orderData.address) {
      errors.push(
        createValidationError(
          rowIndex,
          "address",
          "Address is required",
          "critical",
          ERROR_TYPES.REQUIRED_FIELD,
        ),
      );
    }

    if (!orderData.latitude) {
      errors.push(
        createValidationError(
          rowIndex,
          "latitude",
          "Latitude is required",
          "critical",
          ERROR_TYPES.REQUIRED_FIELD,
        ),
      );
    }

    if (!orderData.longitude) {
      errors.push(
        createValidationError(
          rowIndex,
          "longitude",
          "Longitude is required",
          "critical",
          ERROR_TYPES.REQUIRED_FIELD,
        ),
      );
    }

    // Parse and validate with Zod schema for format validation
    try {
      orderSchema.parse(orderData);
    } catch (zodError) {
      if (zodError instanceof z.ZodError) {
        zodError.issues.forEach((err) => {
          const field = err.path.join(".") as string;
          // Determine error type based on field
          let errorType: string = ERROR_TYPES.VALIDATION;
          if (field === "customerEmail") errorType = ERROR_TYPES.FORMAT;
          if (field === "latitude" || field === "longitude")
            errorType = ERROR_TYPES.RANGE;

          errors.push(
            createValidationError(
              rowIndex,
              field,
              err.message,
              "critical",
              errorType,
              field === "latitude"
                ? orderData.latitude
                : field === "longitude"
                  ? orderData.longitude
                  : undefined,
            ),
          );
        });
      }
    }

    // Only continue validation if required fields are present
    if (
      orderData.trackingId &&
      orderData.address &&
      orderData.latitude &&
      orderData.longitude
    ) {
      // Check for duplicate tracking IDs (within CSV)
      if (existingTrackingIds.has(orderData.trackingId)) {
        errors.push(
          createValidationError(
            rowIndex,
            "trackingId",
            `Duplicate tracking ID within CSV: ${orderData.trackingId}`,
            "critical",
            ERROR_TYPES.DUPLICATE,
            orderData.trackingId,
          ),
        );
      } else {
        existingTrackingIds.add(orderData.trackingId);
      }

      // Validate coordinate ranges (explicit checks for clarity)
      const lat = parseFloat(orderData.latitude);
      const lng = parseFloat(orderData.longitude);

      if (Number.isNaN(lat) || lat < -90 || lat > 90) {
        errors.push(
          createValidationError(
            rowIndex,
            "latitude",
            "Latitude must be between -90 and 90",
            "critical",
            ERROR_TYPES.RANGE,
            orderData.latitude,
          ),
        );
      }

      if (Number.isNaN(lng) || lng < -180 || lng > 180) {
        errors.push(
          createValidationError(
            rowIndex,
            "longitude",
            "Longitude must be between -180 and 180",
            "critical",
            ERROR_TYPES.RANGE,
            orderData.longitude,
          ),
        );
      }

      // Validate coordinates are not (0, 0) - treat as warning (can be overridden)
      if (orderData.latitude === "0" && orderData.longitude === "0") {
        errors.push(
          createValidationError(
            rowIndex,
            "latitude",
            "Coordinates (0, 0) are likely invalid. Please verify the address.",
            "warning",
            ERROR_TYPES.RANGE,
            "0, 0",
          ),
        );
      }

      // Validate email format if provided
      if (orderData.customerEmail && orderData.customerEmail !== "") {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(orderData.customerEmail)) {
          errors.push(
            createValidationError(
              rowIndex,
              "customerEmail",
              "Invalid email format",
              "warning",
              ERROR_TYPES.FORMAT,
              orderData.customerEmail,
            ),
          );
        }
      }

      // Validate numeric fields
      if (orderData.weightRequired) {
        const weight = parseFloat(orderData.weightRequired);
        if (Number.isNaN(weight) || weight <= 0) {
          errors.push(
            createValidationError(
              rowIndex,
              "weightRequired",
              "Weight must be a positive number",
              "critical",
              ERROR_TYPES.RANGE,
              orderData.weightRequired,
            ),
          );
        }
      }

      if (orderData.volumeRequired) {
        const volume = parseFloat(orderData.volumeRequired);
        if (Number.isNaN(volume) || volume <= 0) {
          errors.push(
            createValidationError(
              rowIndex,
              "volumeRequired",
              "Volume must be a positive number",
              "critical",
              ERROR_TYPES.RANGE,
              orderData.volumeRequired,
            ),
          );
        }
      }

      // Validate strictness if provided
      if (
        orderData.strictness &&
        orderData.strictness !== "HARD" &&
        orderData.strictness !== "SOFT"
      ) {
        errors.push(
          createValidationError(
            rowIndex,
            "strictness",
            "Strictness must be HARD or SOFT",
            "critical",
            ERROR_TYPES.FORMAT,
            orderData.strictness,
          ),
        );
      }
    }
  } catch (error) {
    errors.push(
      createValidationError(
        rowIndex,
        "general",
        error instanceof Error ? error.message : "Unknown validation error",
        "critical",
        ERROR_TYPES.VALIDATION,
      ),
    );
  }

  return errors;
}

/**
 * Validate time window preset exists with enhanced error reporting
 */
async function validateTimeWindowPresets(
  orderDataList: Array<{ timeWindowPresetId?: string }>,
  companyId: string,
): Promise<CSVValidationError[]> {
  const errors: CSVValidationError[] = [];
  const presetIds = orderDataList
    .map((data) => data.timeWindowPresetId)
    .filter((id): id is string => !!id);

  if (presetIds.length === 0) {
    return errors;
  }

  const uniquePresetIds = [...new Set(presetIds)];
  const presets = await db
    .select({ id: timeWindowPresets.id })
    .from(timeWindowPresets)
    .where(
      and(
        eq(timeWindowPresets.companyId, companyId),
        eq(timeWindowPresets.active, true),
        inArray(timeWindowPresets.id, uniquePresetIds),
      ),
    );

  const validPresetIds = new Set(presets.map((p) => p.id));

  orderDataList.forEach((data, index) => {
    if (
      data.timeWindowPresetId &&
      !validPresetIds.has(data.timeWindowPresetId)
    ) {
      errors.push(
        createValidationError(
          index + 2, // +2 because index 0 is row 2 (after header)
          "timeWindowPresetId",
          `Time window preset not found or inactive: ${data.timeWindowPresetId}`,
          "critical",
          ERROR_TYPES.REFERENCE,
          data.timeWindowPresetId,
        ),
      );
    }
  });

  return errors;
}

// POST - Import orders from CSV
export async function POST(request: NextRequest) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);
    const context = requireTenantContext();

    const body = await request.json();
    const validatedData = csvImportRequestSchema.parse(body);

    // Load template mapping if templateId is provided
    let templateMapping: Record<string, string> | undefined;
    if (validatedData.templateId) {
      const template = await db
        .select()
        .from(csvColumnMappingTemplates)
        .where(
          and(
            eq(csvColumnMappingTemplates.id, validatedData.templateId),
            eq(csvColumnMappingTemplates.companyId, context.companyId),
            eq(csvColumnMappingTemplates.active, true),
          ),
        );

      if (template.length === 0) {
        return NextResponse.json(
          { error: "Template not found or inactive" },
          { status: 404 },
        );
      }

      templateMapping = JSON.parse(template[0].columnMapping);
    }

    // Merge custom mapping with template mapping (custom takes precedence)
    const effectiveMapping = {
      ...templateMapping,
      ...validatedData.columnMapping,
    };

    // Decode base64 content
    let csvContent: string;
    try {
      csvContent = Buffer.from(validatedData.csvContent, "base64").toString(
        "utf-8",
      );
    } catch {
      return NextResponse.json(
        { error: "Invalid base64 encoding" },
        { status: 400 },
      );
    }

    // Verify file extension and encoding
    if (!csvContent || csvContent.trim().length === 0) {
      return NextResponse.json({ error: "CSV file is empty" }, { status: 400 });
    }

    // Detect delimiter and parse CSV
    const delimiter = detectCSVDelimiter(csvContent);
    const rows = parseCSV(csvContent, delimiter);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No data rows found in CSV" },
        { status: 400 },
      );
    }

    // Generate column mapping suggestions if no mapping provided
    const csvHeaders = Object.keys(rows[0]);
    let finalMapping = effectiveMapping;

    if (Object.keys(finalMapping).length === 0) {
      // Auto-generate mapping using similarity algorithm
      const suggestions = suggestColumnMapping(csvHeaders);
      finalMapping = suggestions.suggestedMapping;
    }

    // Debug: Log the column mapping
    console.log("[CSV Import] CSV Headers:", csvHeaders);
    console.log("[CSV Import] Final Mapping:", JSON.stringify(finalMapping, null, 2));
    console.log("[CSV Import] orderValue mapped from:", Object.entries(finalMapping).find(([_, v]) => v === "orderValue")?.[0] || "NOT MAPPED");

    // Check for required headers after mapping
    const normalizedHeaders = Object.keys(rows[0]).map((h) =>
      h.toLowerCase().trim(),
    );
    const hasTrackingId = normalizedHeaders.some((h) =>
      ["tracking_id", "tracking id", "trackingid", "trackingid"].includes(h),
    );

    if (!hasTrackingId) {
      return NextResponse.json(
        {
          error: "Missing required field",
          details: "CSV must contain a tracking ID column",
          requiredFields: ["tracking_id", "address", "latitude", "longitude"],
          foundHeaders: Object.keys(rows[0]),
          suggestedMapping: finalMapping,
        },
        { status: 400 },
      );
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
    const orderDataList = validRecords.map((record) => {
      const row = rows.find((_, i) => i + 2 === record.row);
      if (!row) {
        throw new Error(`Row not found for record at row ${record.row}`);
      }
      return Object.keys(finalMapping).length > 0
        ? mapCSVRow(row, finalMapping)
        : mapCSVRowToOrder(row, validatedData.columnMapping);
    });

    // Validate time window presets (cross-field validation)
    const presetErrors = await validateTimeWindowPresets(
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

    // Calculate summary statistics
    const summary = calculateErrorSummary(allErrors);

    // Generate preview (first 10 rows with mapped field names)
    const preview = rows.slice(0, 10).map((row, index) => ({
      row: index + 2,
      ...(Object.keys(finalMapping).length > 0
        ? mapCSVRow(row, finalMapping)
        : mapCSVRowToOrder(row, validatedData.columnMapping)),
    }));

    // If not processing, return complete validation results
    if (!validatedData.process) {
      return NextResponse.json(
        {
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
          templateId: validatedData.templateId,
        },
        { status: 200 },
      );
    }

    // Process and import valid rows (only if no critical errors)
    const criticalErrors = allErrors.filter((e) => e.severity === "critical");
    let importedCount = 0;
    const importErrors: CSVValidationError[] = [];

    if (validRecords.length > 0 && criticalErrors.length === 0) {
      // Debug: Log first order data to see if orderValue is mapped
      if (orderDataList.length > 0) {
        const firstOrder = orderDataList[0];
        console.log("[CSV Import] First order data:", {
          trackingId: firstOrder.trackingId,
          orderValue: firstOrder.orderValue,
          unitsRequired: firstOrder.unitsRequired,
          weightRequired: firstOrder.weightRequired,
        });
      }

      // Use optimized batch insert for large datasets (Story 17.1)
      try {
        const batchResult = await batchInsertOrders(
          orderDataList.map((data) => ({
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

    return NextResponse.json(
      {
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
        templateId: validatedData.templateId,
      },
      { status: importErrors.length === 0 ? 201 : 207 },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: (error as { errors?: unknown }).errors,
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to import orders",
      },
      { status: 500 },
    );
  }
}
