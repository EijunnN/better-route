/**
 * Generate downloadable CSV templates straight from a resolved ProfileSchema.
 * Semicolon-separated + BOM so Excel in es-PE opens it cleanly.
 */

import type { ProfileSchema } from "./types";

const UTF8_BOM = "\uFEFF";

function defaultExample(example: string, kind: string): string {
  if (example) return example;
  switch (kind) {
    case "number":
    case "currency":
      return "0";
    case "boolean":
      return "true";
    case "date":
      return "2026-01-15";
    default:
      return "";
  }
}

/**
 * Build a CSV template string with:
 * - row 1: headers (canonical Spanish labels from the schema)
 * - row 2: example values
 *
 * Custom fields are included at the end with their example/default.
 */
export function generateCsvTemplate(
  schema: ProfileSchema,
  options: { locale?: "en" | "es"; separator?: string } = {},
): string {
  const { locale = "es", separator = locale === "es" ? ";" : "," } = options;

  const headers: string[] = [];
  const examples: string[] = [];

  for (const field of schema.fields) {
    headers.push(locale === "en" && field.labelEn ? field.labelEn : field.label);
    examples.push(defaultExample(field.example, field.kind));
  }

  return `${UTF8_BOM}${headers.join(separator)}\n${examples.join(separator)}`;
}
