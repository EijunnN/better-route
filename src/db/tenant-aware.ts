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

export function withTenantFilter(table: any, conditions: SQL[] = []) {
  const context = requireTenantContext();

  if (table === companies) {
    // For companies table, user can only access their own company
    return and(eq(companies.id, context.companyId), ...conditions);
  }

  if (table === users) {
    // For users table, filter by companyId
    return and(eq(users.companyId, context.companyId), ...conditions);
  }

  // For other tables, add tenantId filter
  if (table.tenantId) {
    return and(eq(table.tenantId, context.companyId), ...conditions);
  }

  // If table has companyId instead of tenantId
  if (table.companyId) {
    return and(eq(table.companyId, context.companyId), ...conditions);
  }

  return and(...conditions);
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
