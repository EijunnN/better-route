import { NextRequest, NextResponse } from "next/server";
import { setTenantContext, requireTenantContext } from "@/lib/tenant";
import { db } from "@/db";
import { orders, timeWindowPresets } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { orderSchema } from "@/lib/validations/order";
import { z } from "zod";

// CSV import request schema
const csvImportRequestSchema = z.object({
  // CSV content as base64 encoded string
  csvContent: z.string().min(1, "CSV content is required"),
  // Optional column mapping (maps CSV columns to order fields)
  columnMapping: z.record(z.string(), z.string()).optional(),
  // Whether to actually process (true) or just validate/preview (false)
  process: z.boolean().default(false),
});

// CSV validation error schema
const csvValidationErrorSchema = z.object({
  row: z.number(),
  field: z.string(),
  message: z.string(),
  value: z.any().optional(),
});

// CSV import result schema
const csvImportResultSchema = z.object({
  success: z.boolean(),
  totalRows: z.number(),
  validRows: z.number(),
  invalidRows: z.number(),
  importedRows: z.number(),
  errors: z.array(csvValidationErrorSchema),
  preview: z.array(z.any()),
  duplicateTrackingIds: z.array(z.string()),
});

type CSVValidationError = z.infer<typeof csvValidationErrorSchema>;
type CSVRow = Record<string, string>;

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
  customer_name: "customerName",
  "customer name": "customerName",
  customername: "customerName",
  customer_phone: "customerPhone",
  "customer phone": "customerPhone",
  customerphone: "customerPhone",
  phone: "customerPhone",
  customer_email: "customerEmail",
  "customer email": "customerEmail",
  customeremail: "customerEmail",
  email: "customerEmail",
  address: "address",
  direccion: "address",
  latitude: "latitude",
  lat: "latitude",
  longitude: "longitude",
  lng: "longitude",
  lon: "longitude",
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
  volume_required: "volumeRequired",
  "volume required": "volumeRequired",
  volumerequired: "volumeRequired",
  volume: "volumeRequired",
  required_skills: "requiredSkills",
  "required skills": "requiredSkills",
  requiredskills: "requiredSkills",
  skills: "requiredSkills",
  notes: "notes",
  notas: "notes",
};

/**
 * Map CSV row to order input
 */
function mapCSVRowToOrder(row: CSVRow, customMapping?: Record<string, string>): any {
  const mapping = { ...DEFAULT_COLUMN_MAPPING, ...customMapping };
  const result: any = {};

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
 * Validate order data from CSV row
 */
function validateOrderRow(
  row: CSVRow,
  rowIndex: number,
  existingTrackingIds: Set<string>
): CSVValidationError[] {
  const errors: CSVValidationError[] = [];
  const orderData = mapCSVRowToOrder(row);

  try {
    // Parse and validate with Zod schema
    orderSchema.parse(orderData);

    // Check for duplicate tracking IDs
    if (existingTrackingIds.has(orderData.trackingId)) {
      errors.push({
        row: rowIndex,
        field: "trackingId",
        message: `Duplicate tracking ID: ${orderData.trackingId}`,
        value: orderData.trackingId,
      });
    } else {
      existingTrackingIds.add(orderData.trackingId);
    }

    // Validate coordinates are not (0, 0)
    if (orderData.latitude === "0" && orderData.longitude === "0") {
      errors.push({
        row: rowIndex,
        field: "latitude",
        message: "Coordinates (0, 0) are likely invalid",
        value: "0, 0",
      });
    }

    // Check for missing required fields
    if (!orderData.trackingId) {
      errors.push({
        row: rowIndex,
        field: "trackingId",
        message: "Tracking ID is required",
      });
    }

    if (!orderData.address) {
      errors.push({
        row: rowIndex,
        field: "address",
        message: "Address is required",
      });
    }

    if (!orderData.latitude) {
      errors.push({
        row: rowIndex,
        field: "latitude",
        message: "Latitude is required",
      });
    }

    if (!orderData.longitude) {
      errors.push({
        row: rowIndex,
        field: "longitude",
        message: "Longitude is required",
      });
    }

    // Validate coordinate ranges
    const lat = parseFloat(orderData.latitude);
    const lng = parseFloat(orderData.longitude);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      errors.push({
        row: rowIndex,
        field: "latitude",
        message: "Latitude must be between -90 and 90",
        value: orderData.latitude,
      });
    }

    if (isNaN(lng) || lng < -180 || lng > 180) {
      errors.push({
        row: rowIndex,
        field: "longitude",
        message: "Longitude must be between -180 and 180",
        value: orderData.longitude,
      });
    }

    // Validate email format if provided
    if (orderData.customerEmail && orderData.customerEmail !== "") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(orderData.customerEmail)) {
        errors.push({
          row: rowIndex,
          field: "customerEmail",
          message: "Invalid email format",
          value: orderData.customerEmail,
        });
      }
    }

    // Validate numeric fields
    if (orderData.weightRequired) {
      const weight = parseFloat(orderData.weightRequired);
      if (isNaN(weight) || weight <= 0) {
        errors.push({
          row: rowIndex,
          field: "weightRequired",
          message: "Weight must be a positive number",
          value: orderData.weightRequired,
        });
      }
    }

    if (orderData.volumeRequired) {
      const volume = parseFloat(orderData.volumeRequired);
      if (isNaN(volume) || volume <= 0) {
        errors.push({
          row: rowIndex,
          field: "volumeRequired",
          message: "Volume must be a positive number",
          value: orderData.volumeRequired,
        });
      }
    }

    // Validate strictness if provided
    if (orderData.strictness && orderData.strictness !== "HARD" && orderData.strictness !== "SOFT") {
      errors.push({
        row: rowIndex,
        field: "strictness",
        message: "Strictness must be HARD or SOFT",
        value: orderData.strictness,
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      error.issues.forEach((err) => {
        errors.push({
          row: rowIndex,
          field: err.path.join("."),
          message: err.message,
          value: err.path.join(".") === "latitude" ? orderData.latitude :
                 err.path.join(".") === "longitude" ? orderData.longitude :
                 undefined,
        });
      });
    } else {
      errors.push({
        row: rowIndex,
        field: "general",
        message: error instanceof Error ? error.message : "Unknown validation error",
      });
    }
  }

  return errors;
}

/**
 * Validate time window preset exists
 */
async function validateTimeWindowPresets(
  orderDataList: any[],
  companyId: string
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
        inArray(timeWindowPresets.id, uniquePresetIds)
      )
    );

  const validPresetIds = new Set(presets.map((p) => p.id));

  orderDataList.forEach((data, index) => {
    if (data.timeWindowPresetId && !validPresetIds.has(data.timeWindowPresetId)) {
      errors.push({
        row: index + 2, // +2 because index 0 is row 2 (after header)
        field: "timeWindowPresetId",
        message: `Time window preset not found or inactive: ${data.timeWindowPresetId}`,
        value: data.timeWindowPresetId,
      });
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
        { status: 401 }
      );
    }

    setTenantContext(tenantCtx);
    const context = requireTenantContext();

    const body = await request.json();
    const validatedData = csvImportRequestSchema.parse(body);

    // Decode base64 content
    let csvContent: string;
    try {
      csvContent = Buffer.from(validatedData.csvContent, "base64").toString("utf-8");
    } catch {
      return NextResponse.json(
        { error: "Invalid base64 encoding" },
        { status: 400 }
      );
    }

    // Verify file extension and encoding
    if (!csvContent || csvContent.trim().length === 0) {
      return NextResponse.json(
        { error: "CSV file is empty" },
        { status: 400 }
      );
    }

    // Detect delimiter and parse CSV
    const delimiter = detectCSVDelimiter(csvContent);
    const rows = parseCSV(csvContent, delimiter);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No data rows found in CSV" },
        { status: 400 }
      );
    }

    // Check for required headers
    const firstRow = rows[0];
    const normalizedHeaders = Object.keys(firstRow).map((h) => h.toLowerCase().trim());
    const hasTrackingId = normalizedHeaders.some((h) =>
      ["tracking_id", "tracking id", "trackingid", "trackingid"].includes(h)
    );

    if (!hasTrackingId) {
      return NextResponse.json(
        {
          error: "Missing required field",
          details: "CSV must contain a tracking ID column",
          requiredFields: ["tracking_id", "address", "latitude", "longitude"],
          foundHeaders: Object.keys(firstRow),
        },
        { status: 400 }
      );
    }

    // Validate all rows and collect errors
    const allErrors: CSVValidationError[] = [];
    const validRows: CSVRow[] = [];
    const invalidRows: number[] = [];
    const seenTrackingIds = new Set<string>();

    // Check for existing tracking IDs in database
    const trackingIdsInCSV = rows
      .map((row) => mapCSVRowToOrder(row).trackingId)
      .filter((id): id is string => !!id);

    const existingOrders = await db
      .select({ trackingId: orders.trackingId })
      .from(orders)
      .where(
        and(
          eq(orders.companyId, context.companyId),
          eq(orders.active, true),
          inArray(orders.trackingId, trackingIdsInCSV)
        )
      );

    const existingTrackingIds = new Set(existingOrders.map((o) => o.trackingId));

    // Validate each row
    rows.forEach((row, index) => {
      const rowIndex = index + 2; // +1 for 0-based index, +1 for header row
      const rowErrors = validateOrderRow(row, rowIndex, seenTrackingIds);

      // Check for duplicate with existing orders
      const orderData = mapCSVRowToOrder(row);
      if (existingTrackingIds.has(orderData.trackingId)) {
        rowErrors.push({
          row: rowIndex,
          field: "trackingId",
          message: `Tracking ID already exists in database: ${orderData.trackingId}`,
          value: orderData.trackingId,
        });
      }

      if (rowErrors.length > 0) {
        invalidRows.push(rowIndex);
        allErrors.push(...rowErrors);
      } else {
        validRows.push(row);
      }
    });

    // Map valid rows to order data
    const orderDataList = validRows.map((row) => mapCSVRowToOrder(row, validatedData.columnMapping));

    // Validate time window presets
    const presetErrors = await validateTimeWindowPresets(orderDataList, context.companyId);
    allErrors.push(...presetErrors);

    // Generate preview (first 10 rows with mapped field names)
    const preview = rows.slice(0, 10).map((row, index) => ({
      row: index + 2,
      ...mapCSVRowToOrder(row, validatedData.columnMapping),
    }));

    // If not processing, return validation results
    if (!validatedData.process) {
      return NextResponse.json(
        {
          success: true,
          totalRows: rows.length,
          validRows: validRows.length,
          invalidRows: invalidRows.length,
          importedRows: 0,
          errors: allErrors,
          preview,
          duplicateTrackingIds: Array.from(existingTrackingIds),
        },
        { status: 200 }
      );
    }

    // Process and import valid rows
    let importedCount = 0;
    const importErrors: CSVValidationError[] = [];

    if (validRows.length > 0 && allErrors.filter((e) => e.field !== "timeWindowPresetId").length === 0) {
      // Batch insert valid orders
      try {
        const recordsToInsert = orderDataList.map((data) => ({
          companyId: context.companyId,
          trackingId: String(data.trackingId),
          customerName: data.customerName ? String(data.customerName) : null,
          customerPhone: data.customerPhone ? String(data.customerPhone) : null,
          customerEmail: data.customerEmail ? String(data.customerEmail) : null,
          address: String(data.address),
          latitude: String(data.latitude),
          longitude: String(data.longitude),
          timeWindowPresetId: data.timeWindowPresetId || null,
          strictness: (data.strictness === "HARD" || data.strictness === "SOFT" ? data.strictness : null) as "HARD" | "SOFT" | null,
          promisedDate: data.promisedDate ? new Date(data.promisedDate) : null,
          weightRequired: data.weightRequired ? parseInt(String(data.weightRequired), 10) : null,
          volumeRequired: data.volumeRequired ? parseInt(String(data.volumeRequired), 10) : null,
          requiredSkills: data.requiredSkills ? String(data.requiredSkills) : null,
          notes: data.notes ? String(data.notes) : null,
          status: "PENDING" as const,
          active: true,
        }));

        const inserted = await db.insert(orders).values(recordsToInsert).returning();
        importedCount = inserted.length;
      } catch (error) {
        importErrors.push({
          row: 0,
          field: "general",
          message: error instanceof Error ? error.message : "Failed to import orders",
        });
      }
    }

    return NextResponse.json(
      {
        success: importErrors.length === 0,
        totalRows: rows.length,
        validRows: validRows.length,
        invalidRows: invalidRows.length,
        importedRows: importedCount,
        errors: [...allErrors, ...importErrors],
        preview,
        duplicateTrackingIds: Array.from(existingTrackingIds),
      },
      { status: importErrors.length === 0 ? 201 : 207 }
    );
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error.message || "Failed to import orders" },
      { status: 500 }
    );
  }
}
