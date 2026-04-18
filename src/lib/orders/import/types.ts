import { z } from "zod";

// CSV import request schema (updated to support templates)
export const csvImportRequestSchema = z
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
export const ERROR_SEVERITY = ["critical", "warning", "info"] as const;

// CSV validation error schema
export const csvValidationErrorSchema = z.object({
  row: z.number(),
  field: z.string(),
  message: z.string(),
  severity: z.enum(ERROR_SEVERITY).default("critical"),
  errorType: z.string().default("validation"),
  value: z.any().optional(),
});

// Valid/invalid record separation schema
export const csvRecordValidationResultSchema = z.object({
  row: z.number(),
  valid: z.boolean(),
  trackingId: z.string().optional(),
  errors: z.array(csvValidationErrorSchema),
});

// CSV import result schema
export const _csvImportResultSchema = z.object({
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

export type CSVValidationError = z.infer<typeof csvValidationErrorSchema>;
export type CSVRecordValidationResult = z.infer<
  typeof csvRecordValidationResultSchema
>;
export type CSVRow = Record<string, string>;
export type CsvImportRequest = z.infer<typeof csvImportRequestSchema>;

// Error type constants for categorization
export const ERROR_TYPES = {
  REQUIRED_FIELD: "required_field",
  FORMAT: "format",
  RANGE: "range",
  DUPLICATE: "duplicate",
  REFERENCE: "reference",
  VALIDATION: "validation",
} as const;
