import { and, eq, type SQL } from "drizzle-orm";
import { requireTenantContext } from "../lib/tenant";
import { companies, users } from "./schema";

export class TenantAccessDeniedError extends Error {
  constructor(
    message: string = "Access denied: cross-tenant access not allowed",
  ) {
    super(message);
    this.name = "TenantAccessDeniedError";
  }
}

// biome-ignore lint/suspicious/noExplicitAny: Drizzle table types are complex and need any for compatibility
type DrizzleTable = Record<string, any>;

/**
 * Apply tenant filtering to a query.
 *
 * IMPORTANT: Pass companyId explicitly when possible. AsyncLocalStorage.enterWith()
 * is unreliable in Next.js App Router and the context may be lost between async operations.
 *
 * @param table - The Drizzle table to filter
 * @param conditions - Additional SQL conditions
 * @param companyId - The company ID to filter by (recommended to pass explicitly). Can be null for ADMIN_SISTEMA.
 */
export function withTenantFilter(
  table: DrizzleTable,
  conditions: SQL[] = [],
  companyId?: string | null,
) {
  // Use explicitly passed companyId, or fall back to context (which may fail)
  const effectiveCompanyId = companyId ?? requireTenantContext().companyId;

  if (table === companies) {
    // For companies table, user can only access their own company
    return and(eq(companies.id, effectiveCompanyId), ...conditions);
  }

  if (table === users) {
    // For users table, filter by companyId
    return and(eq(users.companyId, effectiveCompanyId), ...conditions);
  }

  // For other tables, add tenantId filter
  if (table.tenantId) {
    return and(eq(table.tenantId, effectiveCompanyId), ...conditions);
  }

  // If table has companyId instead of tenantId
  if (table.companyId) {
    return and(eq(table.companyId, effectiveCompanyId), ...conditions);
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export function verifyTenantAccess(entityCompanyId: string) {
  const context = requireTenantContext();
  if (entityCompanyId !== context.companyId) {
    throw new TenantAccessDeniedError();
  }
}

export function getAuditLogContext() {
  const context = requireTenantContext();
  return {
    tenantId: context.companyId,
    companyId: context.companyId,
    userId: context.userId,
  };
}

export function getTenantContext() {
  try {
    return requireTenantContext();
  } catch {
    return { companyId: null, userId: null };
  }
}
