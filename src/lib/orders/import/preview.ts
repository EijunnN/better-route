import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { cacheGet, cacheSet } from "@/lib/infra/cache";
import {
  resolveProfileSchema,
  validateCsvHeaders,
  validateCsvRow,
  type ProfileSchema,
} from "@/lib/orders/profile-schema";
import { calculateErrorSummary, createValidationError } from "./errors";
import { decodeCsvBase64, detectCSVDelimiter, parseCSV } from "./parse";
import {
  ERROR_TYPES,
  type CSVValidationError,
  type CsvImportRequest,
} from "./types";

/**
 * TTL for stored previews. Operators usually confirm within seconds, but
 * we give 30 min for slower review sessions.
 */
const PREVIEW_TTL_SECONDS = 30 * 60;
const PREVIEW_CACHE_PREFIX = "csv-import-preview";

export interface PreviewBucketRow {
  row: number;
  trackingId: string;
  parsed: Record<string, unknown>;
}

export interface PreviewReactivableRow extends PreviewBucketRow {
  existingOrderId: string;
}

export interface PreviewSkippedActiveRow extends PreviewBucketRow {
  existingOrderId: string;
  currentStatus: string;
}

export interface PreviewSkippedCancelledRow extends PreviewBucketRow {
  existingOrderId: string;
}

export interface PreviewInvalidRow {
  row: number;
  trackingId: string | null;
  errors: CSVValidationError[];
}

export interface CsvImportPreview {
  previewId: string;
  totalRows: number;
  new: PreviewBucketRow[];
  reactivable: PreviewReactivableRow[];
  skippedActive: PreviewSkippedActiveRow[];
  skippedCancelled: PreviewSkippedCancelledRow[];
  invalid: PreviewInvalidRow[];
  summary: ReturnType<typeof calculateErrorSummary>;
  columnMapping: Record<string, string>;
  csvHeaders: string[];
  /** ISO expiry, also enforced via TTL on the cache. */
  expiresAt: string;
}

/**
 * Persisted shape — what `confirmCsvImport` reads back. Includes the
 * normalized rows so the confirm step doesn't need to re-parse the CSV.
 */
export interface StoredPreview {
  companyId: string;
  newRows: Array<{ row: number; trackingId: string; data: Record<string, unknown> }>;
  reactivableRows: Array<{
    row: number;
    trackingId: string;
    existingOrderId: string;
    data: Record<string, unknown>;
  }>;
  expiresAt: number;
}

export interface PreviewContext {
  companyId: string;
}

export type PreviewResult =
  | { kind: "error"; status: number; body: Record<string, unknown> }
  | { kind: "success"; preview: CsvImportPreview };

function previewCacheKey(previewId: string): string {
  return `${PREVIEW_CACHE_PREFIX}:${previewId}`;
}

/**
 * Phase 1 of the preview-and-confirm flow (issue 006). Parses the CSV,
 * validates per the company's ProfileSchema, then classifies each row by
 * trackingId collision against the existing orders:
 *
 *  - new: trackingId not present
 *  - reactivable: trackingId matches a FAILED order
 *  - skippedActive: trackingId matches a PENDING/ASSIGNED/IN_PROGRESS/COMPLETED
 *  - skippedCancelled: trackingId matches a CANCELLED order — terminal,
 *    cannot be reactivated through any flow (per ADR-0005)
 *
 * The classified preview is cached server-side under a `previewId` so the
 * confirm step doesn't need to re-upload the CSV.
 */
export async function previewCsvImport(
  input: CsvImportRequest,
  context: PreviewContext,
): Promise<PreviewResult> {
  const schema: ProfileSchema = await resolveProfileSchema(context.companyId);

  const decoded = decodeCsvBase64(input.csvContent);
  if (!decoded.ok) {
    const msg =
      decoded.error === "too_large"
        ? "CSV file is too large. Maximum size is 10MB."
        : decoded.error === "invalid_base64"
          ? "Invalid base64 encoding"
          : "CSV file is empty";
    return { kind: "error", status: 400, body: { error: msg } };
  }
  const csvContent = decoded.content;
  const delimiter = detectCSVDelimiter(csvContent);
  const rows = parseCSV(csvContent, delimiter);
  if (rows.length === 0) {
    return {
      kind: "error",
      status: 400,
      body: { error: "No data rows found in CSV" },
    };
  }

  const csvHeaders = Object.keys(rows[0]);
  const explicit = input.columnMapping ?? {};
  const autoValidation = validateCsvHeaders(csvHeaders, schema);
  const headerMapping: Record<string, string> = {
    ...autoValidation.mapping,
    ...explicit,
  };

  if (autoValidation.missing.length > 0 && Object.keys(explicit).length === 0) {
    return {
      kind: "error",
      status: 400,
      body: {
        error: "Missing required field",
        details: `Required columns missing: ${autoValidation.missing.join(", ")}`,
        suggestedMapping: headerMapping,
        foundHeaders: csvHeaders,
      },
    };
  }

  // Validate rows + collect tracking ids.
  type ValidRow = {
    row: number;
    trackingId: string;
    data: Record<string, unknown>;
  };
  const validRows: ValidRow[] = [];
  const invalidRows: PreviewInvalidRow[] = [];
  const trackingIdsInCsv: string[] = [];
  const seenTracking = new Set<string>();
  const allErrors: CSVValidationError[] = [];

  rows.forEach((rawRow, i) => {
    const rowIndex = i + 2;
    const remapped: Record<string, string> = {};
    for (const [header, fieldKey] of Object.entries(headerMapping)) {
      const value = rawRow[header];
      if (value !== undefined) remapped[fieldKey] = value;
    }
    const result = validateCsvRow(remapped, schema);
    const trackingId = String(result.normalized.trackingId ?? "").trim();
    const rowErrors: CSVValidationError[] = result.errors.map((e) =>
      createValidationError(
        rowIndex,
        e.fieldKey,
        e.message,
        "critical",
        ERROR_TYPES.VALIDATION,
      ),
    );

    if (trackingId && seenTracking.has(trackingId)) {
      rowErrors.push(
        createValidationError(
          rowIndex,
          "trackingId",
          `Duplicate trackingId within CSV: ${trackingId}`,
          "critical",
          ERROR_TYPES.DUPLICATE,
          trackingId,
        ),
      );
    } else if (trackingId) {
      seenTracking.add(trackingId);
      trackingIdsInCsv.push(trackingId);
    }

    if (rowErrors.length > 0) {
      invalidRows.push({
        row: rowIndex,
        trackingId: trackingId || null,
        errors: rowErrors,
      });
      allErrors.push(...rowErrors);
      return;
    }

    validRows.push({ row: rowIndex, trackingId, data: result.normalized });
  });

  // Classify against DB.
  const existingOrders = trackingIdsInCsv.length
    ? await db
        .select({
          id: orders.id,
          trackingId: orders.trackingId,
          status: orders.status,
        })
        .from(orders)
        .where(
          and(
            eq(orders.companyId, context.companyId),
            eq(orders.active, true),
            inArray(orders.trackingId, trackingIdsInCsv),
          ),
        )
    : [];
  const existingByTracking = new Map(existingOrders.map((o) => [o.trackingId, o]));

  const newBucket: PreviewBucketRow[] = [];
  const reactivable: PreviewReactivableRow[] = [];
  const skippedActive: PreviewSkippedActiveRow[] = [];
  const skippedCancelled: PreviewSkippedCancelledRow[] = [];

  const storedNew: StoredPreview["newRows"] = [];
  const storedReactivable: StoredPreview["reactivableRows"] = [];

  for (const v of validRows) {
    const existing = existingByTracking.get(v.trackingId);
    if (!existing) {
      newBucket.push({ row: v.row, trackingId: v.trackingId, parsed: v.data });
      storedNew.push({ row: v.row, trackingId: v.trackingId, data: v.data });
      continue;
    }
    if (existing.status === "FAILED") {
      reactivable.push({
        row: v.row,
        trackingId: v.trackingId,
        existingOrderId: existing.id,
        parsed: v.data,
      });
      storedReactivable.push({
        row: v.row,
        trackingId: v.trackingId,
        existingOrderId: existing.id,
        data: v.data,
      });
      continue;
    }
    if (existing.status === "CANCELLED") {
      skippedCancelled.push({
        row: v.row,
        trackingId: v.trackingId,
        existingOrderId: existing.id,
        parsed: v.data,
      });
      continue;
    }
    skippedActive.push({
      row: v.row,
      trackingId: v.trackingId,
      existingOrderId: existing.id,
      currentStatus: existing.status,
      parsed: v.data,
    });
  }

  const previewId = randomUUID();
  const expiresAt = Date.now() + PREVIEW_TTL_SECONDS * 1000;

  const stored: StoredPreview = {
    companyId: context.companyId,
    newRows: storedNew,
    reactivableRows: storedReactivable,
    expiresAt,
  };
  await cacheSet(previewCacheKey(previewId), stored, PREVIEW_TTL_SECONDS);

  return {
    kind: "success",
    preview: {
      previewId,
      totalRows: rows.length,
      new: newBucket,
      reactivable,
      skippedActive,
      skippedCancelled,
      invalid: invalidRows,
      summary: calculateErrorSummary(allErrors),
      columnMapping: headerMapping,
      csvHeaders,
      expiresAt: new Date(expiresAt).toISOString(),
    },
  };
}

/** Read a stored preview by id; null if expired or unknown. */
export async function loadStoredPreview(
  previewId: string,
): Promise<StoredPreview | null> {
  return await cacheGet<StoredPreview>(previewCacheKey(previewId));
}

/** Drop the stored preview (called after a successful confirm). */
export async function dropStoredPreview(previewId: string): Promise<void> {
  // Best-effort delete via re-set with 1s TTL (cache.ts has cacheDelete but
  // some test mocks don't implement it). 1s TTL is safe enough.
  await cacheSet(previewCacheKey(previewId), null, 1);
}
