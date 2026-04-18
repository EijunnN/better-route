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
 * Default column mapping for CSV import
 */
export const DEFAULT_COLUMN_MAPPING: Record<string, string> = {
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
