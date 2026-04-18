import { parseCSVLine } from "@/lib/csv/parse-csv-line";
import type { CSVRow } from "./types";

/**
 * Detect CSV delimiter (comma or semicolon)
 */
export function detectCSVDelimiter(content: string): string {
  const firstLine = content.split("\n")[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

/**
 * Parse CSV content into array of objects
 */
export function parseCSV(content: string, delimiter: string): CSVRow[] {
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
 * Result of attempting to decode base64 CSV content.
 * Preserves the exact behavior of the original route handler, including
 * size validation and base64 parsing.
 */
export type CsvBase64DecodeResult =
  | { ok: true; content: string }
  | { ok: false; error: "too_large" | "invalid_base64" | "empty" };

/**
 * Decode a base64-encoded CSV payload with size validation.
 * Returns a discriminated union rather than throwing, so the route
 * can map each failure to a specific HTTP status/response body.
 */
export function decodeCsvBase64(base64Content: string): CsvBase64DecodeResult {
  // Validate CSV size before decoding (10MB decoded limit)
  const MAX_CSV_SIZE = 10 * 1024 * 1024; // 10MB decoded limit
  // Base64 is ~33% larger than decoded, so check the base64 length
  if (base64Content.length > MAX_CSV_SIZE * 1.34) {
    return { ok: false, error: "too_large" };
  }

  // Decode base64 content
  let csvContent: string;
  try {
    csvContent = Buffer.from(base64Content, "base64").toString("utf-8");
  } catch {
    return { ok: false, error: "invalid_base64" };
  }

  // Verify file extension and encoding
  if (!csvContent || csvContent.trim().length === 0) {
    return { ok: false, error: "empty" };
  }

  return { ok: true, content: csvContent };
}
