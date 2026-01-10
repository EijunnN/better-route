import { AsyncLocalStorage } from "async_hooks";

export interface TenantContext {
  companyId: string;
  userId?: string;
}

const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function setTenantContext(context: TenantContext) {
  tenantStorage.enterWith(context);
}

export function getTenantContext(): TenantContext | undefined {
  return tenantStorage.getStore();
}

export function requireTenantContext(): TenantContext {
  const context = getTenantContext();
  if (!context) {
    throw new Error("Tenant context is required but not found");
  }
  return context;
}

export function withTenantContext<T>(context: TenantContext, fn: () => T): T {
  return tenantStorage.run(context, fn);
}
