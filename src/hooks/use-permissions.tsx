"use client";

import { createContext, use, type ReactNode } from "react";
import { useAuth } from "./use-auth";
import {
  type Permission,
  WILDCARD_PERMISSION,
} from "@/lib/auth/permissions";

interface PermissionsContextValue {
  permissions: string[];
  isLoading: boolean;
  error: string | null;
  /**
   * Check a single permission. Accepts either the typed `Permission`
   * (preferred) or the legacy `(entity, action)` pair. New code should use
   * `useCan(perm)` from `@/components/auth/can` instead.
   */
  hasPermission: ((perm: Permission) => boolean) &
    ((entity: string, action: string) => boolean);
  hasAnyPermission: (
    checks:
      | Permission[]
      | Array<{ entity: string; action: string }>,
  ) => boolean;
  refetch: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

/**
 * Provider component — fetches permissions once via `useAuth` (SWR
 * deduplication) and shares them with every descendant.
 */
export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { permissions, isLoading, error, refetch } = useAuth();
  const value = buildContextValue(permissions, isLoading, error, refetch);
  return <PermissionsContext value={value}>{children}</PermissionsContext>;
}

/**
 * Access permissions from context. Falls back to a fresh `useAuth` call when
 * no provider is mounted (e.g. unit tests rendering a single component).
 *
 * Both hooks (`use(context)` and `useAuth()`) are called unconditionally on
 * every render to satisfy the rules of hooks; we then pick which result to
 * return. The fallback path costs an SWR cache hit, no extra fetch.
 */
export function usePermissions(): PermissionsContextValue {
  const context = use(PermissionsContext);
  const fallback = useAuth();
  if (context) return context;
  return buildContextValue(
    fallback.permissions,
    fallback.isLoading,
    fallback.error,
    fallback.refetch,
  );
}

function buildContextValue(
  permissions: string[],
  isLoading: boolean,
  error: string | null,
  refetch: () => Promise<void>,
): PermissionsContextValue {
  const permissionsSet = new Set(permissions);
  const isWildcard = permissionsSet.has(WILDCARD_PERMISSION);

  function hasPermission(perm: Permission): boolean;
  function hasPermission(entity: string, action: string): boolean;
  function hasPermission(
    permOrEntity: string | Permission,
    action?: string,
  ): boolean {
    if (isWildcard) return true;
    const perm = action !== undefined ? `${permOrEntity}:${action}` : permOrEntity;
    return permissionsSet.has(perm);
  }

  const hasAnyPermission = (
    checks: Permission[] | Array<{ entity: string; action: string }>,
  ): boolean => {
    if (isWildcard) return true;
    return checks.some((check) => {
      const key = typeof check === "string" ? check : `${check.entity}:${check.action}`;
      return permissionsSet.has(key);
    });
  };

  return {
    permissions,
    isLoading,
    error,
    hasPermission,
    hasAnyPermission,
    refetch,
  };
}

