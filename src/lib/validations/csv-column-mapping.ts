import { z } from "zod";

// Available system fields that CSV columns can be mapped to
export const CSV_SYSTEM_FIELDS = [
  "trackingId",
  "customerName",
  "customerPhone",
  "customerEmail",
  "address",
  "latitude",
  "longitude",
  "timeWindowPresetId",
  "strictness",
  "promisedDate",
  "weightRequired",
  "volumeRequired",
  "requiredSkills",
  "notes",
] as const;

// Required fields for order import
export const CSV_REQUIRED_FIELDS = [
  "trackingId",
  "address",
  "latitude",
  "longitude",
] as const;

// Column mapping entry schema
const columnMappingEntrySchema = z.object({
  csvColumn: z.string().min(1, "CSV column name is required"),
  systemField: z.enum(CSV_SYSTEM_FIELDS, {
    message: `Must be one of: ${CSV_SYSTEM_FIELDS.join(", ")}`,
  }),
});

// Create schema
export const csvColumnMappingTemplateSchema = z.object({
  name: z
    .string()
    .min(1, "Template name is required")
    .max(255, "Template name too long"),
  description: z.string().optional(),
  columnMapping: z.record(
    z.string().min(1, "CSV column name is required"),
    z.enum(CSV_SYSTEM_FIELDS, {
      message: `Must be one of: ${CSV_SYSTEM_FIELDS.join(", ")}`,
    }),
  ),
  requiredFields: z
    .array(z.enum(CSV_SYSTEM_FIELDS))
    .default([...CSV_REQUIRED_FIELDS]),
  active: z.boolean().default(true),
});

// Update schema (all optional)
export const updateCsvColumnMappingTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  columnMapping: z
    .record(z.string().min(1), z.enum(CSV_SYSTEM_FIELDS))
    .optional(),
  requiredFields: z.array(z.enum(CSV_SYSTEM_FIELDS)).optional(),
  active: z.boolean().optional(),
});

// Column mapping suggestion request schema
export const columnMappingSuggestionRequestSchema = z.object({
  csvHeaders: z
    .array(z.string().min(1))
    .min(1, "At least one CSV header is required"),
  templateId: z.string().uuid("Invalid template ID").optional(),
});

// Column mapping suggestion response schema
export const columnMappingSuggestionResponseSchema = z.object({
  suggestedMapping: z.record(z.string(), z.enum(CSV_SYSTEM_FIELDS)),
  confidence: z.record(z.string(), z.number()), // confidence score for each mapping
  unmappedRequiredFields: z.array(z.enum(CSV_SYSTEM_FIELDS)),
  unmappedOptionalFields: z.array(z.enum(CSV_SYSTEM_FIELDS)),
  autoMappedCount: z.number(),
  manualMappingRequired: z.boolean(),
});

// Validate CSV import with column mapping
export const csvImportWithMappingSchema = z
  .object({
    csvContent: z.string().min(1, "CSV content is required"),
    columnMapping: z.record(z.string(), z.enum(CSV_SYSTEM_FIELDS)).optional(),
    templateId: z.string().uuid("Invalid template ID").optional(),
    process: z.boolean().default(false),
  })
  .refine(
    (data) => !(data.columnMapping && data.templateId),
    "Cannot provide both columnMapping and templateId. Use one or the other.",
  );

// Type exports
export type CsvColumnMappingTemplateInput = z.infer<
  typeof csvColumnMappingTemplateSchema
>;
export type UpdateCsvColumnMappingTemplateInput = z.infer<
  typeof updateCsvColumnMappingTemplateSchema
>;
export type ColumnMappingSuggestionRequest = z.infer<
  typeof columnMappingSuggestionRequestSchema
>;
export type ColumnMappingSuggestionResponse = z.infer<
  typeof columnMappingSuggestionResponseSchema
>;
export type CsvImportWithMappingInput = z.infer<
  typeof csvImportWithMappingSchema
>;
