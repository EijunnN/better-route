import {
  CSV_REQUIRED_FIELDS,
  CSV_SYSTEM_FIELDS,
} from "@/lib/validations/csv-column-mapping";

// Extended default mapping with common variations in multiple languages
const DEFAULT_COLUMN_MAPPING: Record<string, string> = {
  // Tracking ID variations
  tracking_id: "trackingId",
  "tracking id": "trackingId",
  trackingid: "trackingId",
  "tracking-id": "trackingId",
  "tracking number": "trackingId",
  tracking_no: "trackingId",
  "tracking no": "trackingId",
  "nro seguimiento": "trackingId",
  "numero seguimiento": "trackingId",
  id_seguimiento: "trackingId",
  "id seguimiento": "trackingId",

  // Customer name variations
  customer_name: "customerName",
  "customer name": "customerName",
  customername: "customerName",
  "customer-name": "customerName",
  name: "customerName",
  client_name: "customerName",
  "client name": "customerName",
  nombre_cliente: "customerName",
  "nombre cliente": "customerName",

  // Customer phone variations
  customer_phone: "customerPhone",
  "customer phone": "customerPhone",
  customerphone: "customerPhone",
  "customer-phone": "customerPhone",
  phone: "customerPhone",
  telephone: "customerPhone",
  telefono: "customerPhone",
  telefono_cliente: "customerPhone",

  // Customer email variations
  customer_email: "customerEmail",
  "customer email": "customerEmail",
  customeremail: "customerEmail",
  "customer-email": "customerEmail",
  email: "customerEmail",
  correo: "customerEmail",
  correo_electronico: "customerEmail",
  "correo electronico": "customerEmail",
  email_cliente: "customerEmail",

  // Address variations
  address: "address",
  direccion: "address",
  delivery_address: "address",
  "delivery address": "address",
  "direccion entrega": "address",
  street: "address",
  street_address: "address",

  // Latitude variations
  latitude: "latitude",
  lat: "latitude",
  latitud: "latitude",
  y: "latitude",
  coord_y: "latitude",

  // Longitude variations
  longitude: "longitude",
  lng: "longitude",
  lon: "longitude",
  long: "longitude",
  longitud: "longitude",
  x: "longitude",
  coord_x: "longitude",

  // Time window preset variations
  time_window_preset_id: "timeWindowPresetId",
  "time window preset id": "timeWindowPresetId",
  timewindowpresetid: "timeWindowPresetId",
  preset_id: "timeWindowPresetId",
  "preset id": "timeWindowPresetId",
  ventana_horaria_id: "timeWindowPresetId",
  "ventana horaria id": "timeWindowPresetId",

  // Strictness variations
  strictness: "strictness",
  strict: "strictness",
  strict_mode: "strictness",
  "strict mode": "strictness",
  modo_estrictez: "strictness",
  estrictez: "strictness",

  // Promised date variations
  promised_date: "promisedDate",
  "promised date": "promisedDate",
  promiseddate: "promisedDate",
  delivery_date: "promisedDate",
  "delivery date": "promisedDate",
  "fecha entrega": "promisedDate",
  fecha_prometida: "promisedDate",
  "fecha prometida": "promisedDate",

  // Weight variations
  weight_required: "weightRequired",
  "weight required": "weightRequired",
  weightrequired: "weightRequired",
  weight: "weightRequired",
  peso: "weightRequired",
  peso_requerido: "weightRequired",
  "peso requerido": "weightRequired",

  // Volume variations
  volume_required: "volumeRequired",
  "volume required": "volumeRequired",
  volumerequired: "volumeRequired",
  volume: "volumeRequired",
  volumen: "volumeRequired",
  volumen_requerido: "volumeRequired",
  "volumen requerido": "volumeRequired",

  // Skills variations
  required_skills: "requiredSkills",
  "required skills": "requiredSkills",
  requiredskills: "requiredSkills",
  skills: "requiredSkills",
  skill_requirements: "requiredSkills",
  "skill requirements": "requiredSkills",
  habilidades_requeridas: "requiredSkills",
  "habilidades requeridas": "requiredSkills",

  // Notes variations
  notes: "notes",
  note: "notes",
  comments: "notes",
  observations: "notes",
  observaciones: "notes",
  notas: "notes",
};

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching of column names
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= len2; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len1; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1, // deletion
        );
      }
    }
  }

  return matrix[len2][len1];
}

/**
 * Calculate similarity score between two strings (0-1, where 1 is exact match)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1.0;

  // Check for substring match
  if (s1.includes(s2) || s2.includes(s1)) {
    return Math.max(s1.length, s2.length) / Math.max(s1.length, s2.length);
  }

  // Calculate Levenshtein-based similarity
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;

  const distance = levenshteinDistance(s1, s2);
  return 1.0 - distance / maxLen;
}

/**
 * Find best matching system field for a given CSV column
 * Returns the field name and confidence score
 */
function findBestMatch(
  csvColumn: string,
  availableFields: readonly string[] = CSV_SYSTEM_FIELDS,
): { field: string | null; confidence: number } {
  const normalizedColumn = csvColumn.toLowerCase().trim();

  // First, check exact match in default mapping
  if (DEFAULT_COLUMN_MAPPING[normalizedColumn]) {
    const field = DEFAULT_COLUMN_MAPPING[normalizedColumn];
    if (availableFields.includes(field)) {
      return { field, confidence: 1.0 };
    }
  }

  // Second, check for similarity with available system fields
  let bestMatch: string | null = null;
  let bestScore = 0.7; // Minimum confidence threshold for auto-mapping

  for (const field of availableFields) {
    // Check against the field name in different formats
    const variations = [
      field,
      field
        .replace(/([A-Z])/g, "_$1")
        .toLowerCase(), // camelCase to snake_case
      field
        .replace(/([A-Z])/g, " $1")
        .toLowerCase(), // camelCase to space-separated
      field.toLowerCase(),
    ];

    for (const variation of variations) {
      const score = calculateSimilarity(normalizedColumn, variation);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = field;
      }
    }
  }

  return { field: bestMatch, confidence: bestScore };
}

/**
 * Generate column mapping suggestions for CSV headers
 * @param csvHeaders Array of CSV column headers
 * @param customMapping Optional custom mapping to merge with suggestions
 * @param templateMapping Optional template mapping to use as base
 */
export function suggestColumnMapping(
  csvHeaders: string[],
  customMapping?: Record<string, string>,
  templateMapping?: Record<string, string>,
): {
  suggestedMapping: Record<string, string>;
  confidence: Record<string, number>;
  unmappedRequiredFields: string[];
  unmappedOptionalFields: string[];
  autoMappedCount: number;
  manualMappingRequired: boolean;
} {
  const suggestedMapping: Record<string, string> = { ...templateMapping };
  const confidence: Record<string, number> = {};
  const alreadyMappedFields = new Set(Object.values(suggestedMapping));
  let autoMappedCount = Object.keys(suggestedMapping).length;

  // Process each CSV header
  for (const header of csvHeaders) {
    // Skip if already mapped by template
    if (suggestedMapping[header]) continue;

    // Check if there's a custom mapping for this header
    if (customMapping && customMapping[header]) {
      suggestedMapping[header] = customMapping[header];
      confidence[header] = 1.0;
      autoMappedCount++;
      continue;
    }

    // Find best match using fuzzy matching
    const availableFields = CSV_SYSTEM_FIELDS.filter(
      (field) => !alreadyMappedFields.has(field),
    );
    const { field, confidence: score } = findBestMatch(header, availableFields);

    if (field && score >= 0.7) {
      suggestedMapping[header] = field;
      confidence[header] = score;
      alreadyMappedFields.add(field);
      autoMappedCount++;
    }
  }

  // Determine unmapped fields
  const mappedFields = new Set(Object.values(suggestedMapping));
  const unmappedRequiredFields = CSV_REQUIRED_FIELDS.filter(
    (field): field is (typeof CSV_REQUIRED_FIELDS)[number] =>
      !mappedFields.has(field),
  );
  const unmappedOptionalFields = CSV_SYSTEM_FIELDS.filter(
    (field) =>
      !CSV_REQUIRED_FIELDS.includes(field as any) && !mappedFields.has(field),
  );

  return {
    suggestedMapping,
    confidence,
    unmappedRequiredFields,
    unmappedOptionalFields,
    autoMappedCount,
    manualMappingRequired: unmappedRequiredFields.length > 0,
  };
}

/**
 * Validate that all required fields are mapped
 */
export function validateRequiredFieldsMapped(
  mapping: Record<string, string>,
  requiredFields: readonly string[] = CSV_REQUIRED_FIELDS,
): {
  valid: boolean;
  missingFields: string[];
} {
  const mappedFields = new Set(Object.values(mapping));
  const missingFields = requiredFields.filter(
    (field) => !mappedFields.has(field),
  );

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Map CSV row to order data using the provided mapping
 */
export function mapCSVRow(
  row: Record<string, string>,
  mapping: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [csvKey, csvValue] of Object.entries(row)) {
    const targetField = mapping[csvKey];

    if (targetField && csvValue) {
      result[targetField] = csvValue;
    }
  }

  return result;
}

/**
 * Get the default column mapping
 */
export function getDefaultColumnMapping(): Record<string, string> {
  return { ...DEFAULT_COLUMN_MAPPING };
}
