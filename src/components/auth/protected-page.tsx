"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import {
  type Permission,
  WILDCARD_PERMISSION,
} from "@/lib/auth/permissions";

interface ProtectedPageProps {
  children: React.ReactNode;
  /** Required permission. Typed — TS rejects typos and unknown entities. */
  requiredPermission?: Permission;
  /** Multiple permissions — user needs AT LEAST ONE. */
  requiredPermissions?: Permission[];
  /**
   * Escape hatch for pages that any authenticated user may see (e.g. the
   * dashboard home). Must be set explicitly — there is no permissive
   * default. If neither this nor a permission is provided, access is denied.
   */
  authenticatedOnly?: boolean;
  /** Page to redirect to when access is denied. */
  redirectTo?: string;
  /** Show in-page denial instead of redirecting. */
  showAccessDenied?: boolean;
}

/**
 * Page-level access guard.
 *
 * **Fail-closed by default**: a page without `requiredPermission` /
 * `requiredPermissions` / `authenticatedOnly` denies access. This prevents
 * the historical bug where a developer wrapping a new page in
 * `<ProtectedPage>` and forgetting to pass a permission would still let
 * everyone in.
 *
 * Examples:
 *   <ProtectedPage requiredPermission="role:read">...</ProtectedPage>
 *   <ProtectedPage requiredPermissions={["plan:update", "plan:confirm"]}>...</ProtectedPage>
 *   <ProtectedPage authenticatedOnly>...</ProtectedPage>  // dashboard-style pages
 */
export function ProtectedPage({
  children,
  requiredPermission,
  requiredPermissions,
  authenticatedOnly = false,
  redirectTo = "/dashboard",
  showAccessDenied = true,
}: ProtectedPageProps) {
  const router = useRouter();
  const { user, permissions, isLoading, error } = useAuth();
  const shouldRedirectToLogin = !isLoading && (Boolean(error) || !user);

  const hasAccess =
    shouldRedirectToLogin ||
    permissions.includes(WILDCARD_PERMISSION) ||
    (requiredPermission
      ? permissions.includes(requiredPermission)
      : requiredPermissions && requiredPermissions.length > 0
        ? requiredPermissions.some((perm) => permissions.includes(perm))
        : authenticatedOnly);

  const shouldRedirectNoAccess =
    !isLoading && !shouldRedirectToLogin && !hasAccess && !showAccessDenied;

  useEffect(() => {
    if (shouldRedirectToLogin) {
      router.replace("/login");
      return;
    }

    if (shouldRedirectNoAccess) {
      router.replace(redirectTo);
    }
  }, [redirectTo, router, shouldRedirectNoAccess, shouldRedirectToLogin]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (shouldRedirectToLogin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (!hasAccess) {
    if (shouldRedirectNoAccess) {
      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <div className="rounded-full bg-destructive/10 p-4 mb-4">
          <svg
            className="h-12 w-12 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            role="img"
            aria-label="Acceso denegado"
          >
            <title>Acceso denegado</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Acceso Denegado
        </h2>
        <p className="text-muted-foreground max-w-md mb-4">
          No tienes permisos para acceder a esta página.
          <span className="block mt-2 text-sm">
            Tu rol actual: <strong>{user?.role}</strong>
          </span>
        </p>
        <button
          type="button"
          onClick={() => router.push(redirectTo)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Ir al Dashboard
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
