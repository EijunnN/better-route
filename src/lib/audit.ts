import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { getAuditLogContext } from "@/db/tenant-aware";

export interface AuditLogEntry {
  entityType: string;
  entityId: string;
  action: string;
  changes?: string;
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
  data: any,
) {
  return createAuditLog({
    entityType,
    entityId,
    action: "CREATE",
    changes: JSON.stringify(data),
  });
}

export async function logUpdate(
  entityType: string,
  entityId: string,
  changes: any,
) {
  return createAuditLog({
    entityType,
    entityId,
    action: "UPDATE",
    changes: JSON.stringify(changes),
  });
}

export async function logDelete(
  entityType: string,
  entityId: string,
  data?: any,
) {
  return createAuditLog({
    entityType,
    entityId,
    action: "DELETE",
    changes: data ? JSON.stringify(data) : undefined,
  });
}
