"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

interface PermissionsContextValue {
  permissions: string[];
  isLoading: boolean;
  error: string | null;
  hasPermission: (entity: string, action: string) => boolean;
  hasAnyPermission: (checks: Array<{ entity: string; action: string }>) => boolean;
  refetch: () => Promise<void>;
}

// Context to share permissions across components (client-swr-dedup pattern)
const PermissionsContext = createContext<PermissionsContextValue | null>(null);

/**
 * Provider component that fetches permissions once and shares them
 */
export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPermissions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/auth/me");
      if (!response.ok) {
        throw new Error("No autorizado");
      }

      const data = await response.json();

      // If user has permissions array from roles
      if (data.permissions) {
        setPermissions(data.permissions);
      } else {
        // Fall back to empty permissions
        setPermissions([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar permisos");
      setPermissions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

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

  // React Compiler handles memoization of context value automatically
  const value = {
    permissions,
    isLoading,
    error,
    hasPermission,
    hasAnyPermission,
    refetch: fetchPermissions,
  };

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

/**
 * Hook to access permissions from context
 * Falls back to standalone behavior if no provider exists
 */
export function usePermissions(): PermissionsContextValue {
  const context = useContext(PermissionsContext);

  // If context exists, use it (single fetch shared across components)
  if (context) {
    return context;
  }

  // Fallback for components outside provider - will log warning in dev
  if (process.env.NODE_ENV === "development") {
    console.warn(
      "usePermissions: No PermissionsProvider found. Consider wrapping your app with PermissionsProvider for better performance.",
    );
  }

  // Return a minimal implementation that still works
  // This prevents breaking existing code but won't dedupe fetches
  return {
    permissions: [],
    isLoading: true,
    error: null,
    hasPermission: () => false,
    hasAnyPermission: () => false,
    refetch: async () => {},
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
