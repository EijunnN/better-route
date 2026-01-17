"use client";

import {
  createContext,
  useCallback,
  useContext,
  type ReactNode,
} from "react";
import { useAuth } from "./use-auth";

interface PermissionsContextValue {
  permissions: string[];
  isLoading: boolean;
  error: string | null;
  hasPermission: (entity: string, action: string) => boolean;
  hasAnyPermission: (checks: Array<{ entity: string; action: string }>) => boolean;
  refetch: () => Promise<void>;
}

// Context to share permissions across components
const PermissionsContext = createContext<PermissionsContextValue | null>(null);

/**
 * Provider component that uses useAuth for permissions (SWR deduplication)
 */
export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { permissions, isLoading, error, refetch } = useAuth();

  // Create Set for O(1) lookups - React Compiler handles memoization automatically
  const permissionsSet = new Set(permissions);

  const hasPermission = useCallback(
    (entity: string, action: string): boolean => {
      // Admin has all permissions
      if (permissionsSet.has("*")) {
        return true;
      }
      return permissionsSet.has(`${entity}:${action}`);
    },
    [permissionsSet],
  );

  const hasAnyPermission = useCallback(
    (checks: Array<{ entity: string; action: string }>): boolean => {
      if (permissionsSet.has("*")) {
        return true;
      }
      return checks.some((check) =>
        permissionsSet.has(`${check.entity}:${check.action}`),
      );
    },
    [permissionsSet],
  );

  const value = {
    permissions,
    isLoading,
    error,
    hasPermission,
    hasAnyPermission,
    refetch,
  };

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

/**
 * Hook to access permissions from context
 * Falls back to useAuth if no provider exists
 */
export function usePermissions(): PermissionsContextValue {
  const context = useContext(PermissionsContext);

  // If context exists, use it
  if (context) {
    return context;
  }

  // Fallback: use useAuth directly (still gets SWR deduplication)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { permissions, isLoading, error, refetch } = useAuth();
  const permissionsSet = new Set(permissions);

  return {
    permissions,
    isLoading,
    error,
    hasPermission: (entity: string, action: string): boolean => {
      if (permissionsSet.has("*")) return true;
      return permissionsSet.has(`${entity}:${action}`);
    },
    hasAnyPermission: (checks: Array<{ entity: string; action: string }>): boolean => {
      if (permissionsSet.has("*")) return true;
      return checks.some((check) => permissionsSet.has(`${check.entity}:${check.action}`));
    },
    refetch,
  };
}

/**
 * Permission check component - shows children only if user has permission
 */
export function RequirePermission({
  entity,
  action,
  children,
  fallback = null,
}: {
  entity: string;
  action: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { hasPermission, isLoading } = usePermissions();

  if (isLoading) {
    return null;
  }

  if (!hasPermission(entity, action)) {
    return fallback;
  }

  return <>{children}</>;
}
