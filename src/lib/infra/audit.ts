import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { getAuditLogContext } from "@/db/tenant-aware";

export interface AuditLogEntry {
  entityType: string;
  entityId: string;
  action: string;
  changes?: unknown;
}

export async function createAuditLog(entry: AuditLogEntry) {
  const context = getAuditLogContext();

  const [log] = await db
    .insert(auditLogs)
    .values({
      ...entry,
      ...context,
    })
    .returning();

  return log;
}

export async function logCreate(
  entityType: string,
  entityId: string,
  data: unknown,
) {
  return createAuditLog({
    entityType,
    entityId,
    action: "CREATE",
    changes: data,
  });
}

export async function logUpdate(
  entityType: string,
  entityId: string,
  changes: unknown,
) {
  return createAuditLog({
    entityType,
    entityId,
    action: "UPDATE",
    changes,
  });
}

export async function logDelete(
  entityType: string,
  entityId: string,
  data?: unknown,
) {
  return createAuditLog({
    entityType,
    entityId,
    action: "DELETE",
    changes: data ?? undefined,
  });
}
