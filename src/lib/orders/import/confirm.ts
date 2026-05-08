import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import {
  batchInsertOrders,
  updateTableStatistics,
} from "@/lib/orders/batch-operations";
import { resolveProfileSchema } from "@/lib/orders/profile-schema";
import {
  dropStoredPreview,
  loadStoredPreview,
  type StoredPreview,
} from "./preview";

export interface ConfirmCsvImportInput {
  previewId: string;
  /** Subset of `existingOrderId`s the operator wants to reactivate. */
  reactivableSelections?: string[];
}

export interface ConfirmCsvImportContext {
  companyId: string;
}

export interface ConfirmCsvImportResult {
  inserted: number;
  reactivated: number;
  /**
   * Orders that the preview classified as reactivable but, between
   * preview and confirm, transitioned out of FAILED (e.g. someone
   * else cancelled them). They are silently skipped — the response
   * surfaces them as warnings so the operator knows what happened.
   */
  raceConditions: Array<{
    existingOrderId: string;
    trackingId: string;
    actualStatus: string;
  }>;
}

export type ConfirmResult =
  | { kind: "error"; status: number; body: Record<string, unknown> }
  | { kind: "success"; status: number; body: ConfirmCsvImportResult };

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
};
const str = (v: unknown): string | null =>
  v === null || v === undefined || v === "" ? null : String(v);

/**
 * Phase 2 of preview-and-confirm (issue 006). Reads the cached preview,
 * applies inserts for the new rows, reactivates the operator-selected
 * subset of reactivables, and reports race conditions where an
 * existing order's status changed between phases.
 */
export async function confirmCsvImport(
  input: ConfirmCsvImportInput,
  context: ConfirmCsvImportContext,
): Promise<ConfirmResult> {
  const stored = await loadStoredPreview(input.previewId);
  if (!stored) {
    return {
      kind: "error",
      status: 404,
      body: {
        error:
          "Preview no encontrado o expirado. Vuelve a subir el CSV para regenerar la vista previa.",
      },
    };
  }
  if (stored.companyId !== context.companyId) {
    // Shouldn't happen if cache key isolation works, but defensive.
    return {
      kind: "error",
      status: 403,
      body: { error: "Preview pertenece a otra empresa." },
    };
  }
  if (stored.expiresAt < Date.now()) {
    return {
      kind: "error",
      status: 410,
      body: { error: "Preview expirado. Vuelve a subir el CSV." },
    };
  }

  const schema = await resolveProfileSchema(context.companyId);
  const customFieldKeys = new Set(
    schema.fields.filter((f) => f.origin === "custom").map((f) => f.key),
  );

  // ── Inserts ──────────────────────────────────────────────────────────
  let inserted = 0;
  if (stored.newRows.length > 0) {
    const payload = stored.newRows.map((r) => buildOrderInsert(r.data, customFieldKeys));
    const result = await batchInsertOrders(payload, context.companyId, {
      batchSize: 500,
      timeout: 300000,
    });
    inserted = result.inserted;
    if (result.inserted > 100) await updateTableStatistics("orders");
  }

  // ── Reactivations ─────────────────────────────────────────────────────
  const selectedIds = new Set(input.reactivableSelections ?? []);
  const targets = stored.reactivableRows.filter((r) =>
    selectedIds.has(r.existingOrderId),
  );

  const raceConditions: ConfirmCsvImportResult["raceConditions"] = [];
  let reactivated = 0;

  for (const target of targets) {
    // Re-read status; only proceed if still FAILED (race-safe).
    const current = await db.query.orders.findFirst({
      where: and(
        eq(orders.id, target.existingOrderId),
        eq(orders.companyId, context.companyId),
      ),
    });
    if (!current) {
      raceConditions.push({
        existingOrderId: target.existingOrderId,
        trackingId: target.trackingId,
        actualStatus: "DELETED",
      });
      continue;
    }
    if (current.status !== "FAILED") {
      raceConditions.push({
        existingOrderId: target.existingOrderId,
        trackingId: target.trackingId,
        actualStatus: current.status,
      });
      continue;
    }

    const overrides = buildReactivationOverrides(target.data);
    const [result] = await db
      .update(orders)
      .set({
        ...overrides,
        status: "PENDING",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(orders.id, target.existingOrderId),
          eq(orders.status, "FAILED"),
        ),
      )
      .returning({ id: orders.id });
    if (result) reactivated += 1;
    else {
      raceConditions.push({
        existingOrderId: target.existingOrderId,
        trackingId: target.trackingId,
        actualStatus: "RACE",
      });
    }
  }

  await dropStoredPreview(input.previewId);

  return {
    kind: "success",
    status: 200,
    body: { inserted, reactivated, raceConditions },
  };
}

function buildOrderInsert(
  data: Record<string, unknown>,
  customFieldKeys: Set<string>,
): Parameters<typeof batchInsertOrders>[0][number] {
  const customFields: Record<string, unknown> = {};
  for (const key of customFieldKeys) {
    if (data[key] !== undefined) customFields[key] = data[key];
  }
  return {
    trackingId: String(data.trackingId),
    customerName: str(data.customerName),
    customerPhone: str(data.customerPhone),
    customerEmail: str(data.customerEmail),
    address: String(data.address),
    latitude: String(data.latitude),
    longitude: String(data.longitude),
    timeWindowPresetId: str(data.timeWindowPresetId),
    strictness: (data.strictness === "HARD" || data.strictness === "SOFT"
      ? data.strictness
      : null) as "HARD" | "SOFT" | null,
    promisedDate: data.promisedDate ? new Date(String(data.promisedDate)) : null,
    weightRequired: num(data.weightRequired),
    volumeRequired: num(data.volumeRequired),
    orderValue: num(data.orderValue),
    unitsRequired: num(data.unitsRequired),
    orderType: (data.orderType === "NEW" ||
    data.orderType === "RESCHEDULED" ||
    data.orderType === "URGENT"
      ? data.orderType
      : null) as "NEW" | "RESCHEDULED" | "URGENT" | null,
    priority: num(data.priority),
    timeWindowStart: str(data.timeWindowStart),
    timeWindowEnd: str(data.timeWindowEnd),
    requiredSkills: str(data.requiredSkills),
    notes: str(data.notes),
    customFields: Object.keys(customFields).length > 0 ? customFields : null,
  };
}

function buildReactivationOverrides(
  data: Record<string, unknown>,
): Partial<typeof orders.$inferInsert> {
  const out: Partial<typeof orders.$inferInsert> = {};
  if (typeof data.address === "string" && data.address) out.address = data.address;
  if (typeof data.latitude === "string" && data.latitude)
    out.latitude = data.latitude;
  if (typeof data.longitude === "string" && data.longitude)
    out.longitude = data.longitude;
  if (typeof data.timeWindowStart === "string" && data.timeWindowStart)
    out.timeWindowStart = data.timeWindowStart;
  if (typeof data.timeWindowEnd === "string" && data.timeWindowEnd)
    out.timeWindowEnd = data.timeWindowEnd;
  if (data.promisedDate) {
    const parsed = new Date(String(data.promisedDate));
    if (!Number.isNaN(parsed.getTime())) out.promisedDate = parsed;
  }
  if (typeof data.notes === "string") out.notes = data.notes;
  return out;
}
