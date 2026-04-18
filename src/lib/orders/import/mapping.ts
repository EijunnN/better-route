import { DEFAULT_COLUMN_MAPPING } from "./parse";
import type { CSVRow } from "./types";

/**
 * Map CSV row to order input (legacy function for backward compatibility)
 * @deprecated Use mapCSVRow from @/lib/orders/csv-column-mapping instead
 */
export function mapCSVRowToOrder(
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
