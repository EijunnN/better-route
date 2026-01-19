"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";

interface ProtectedPageProps {
  children: React.ReactNode;
  /** Permiso requerido en formato "entity:action" */
  requiredPermission?: string;
  /** Múltiples permisos - usuario necesita AL MENOS UNO */
  requiredPermissions?: string[];
  /** Página a redirigir si no tiene permiso */
  redirectTo?: string;
  /** Mostrar mensaje de acceso denegado en lugar de redirigir */
  showAccessDenied?: boolean;
}

/**
 * Componente que protege una página completa según permisos
 * Úsalo envolviendo el contenido de tu página:
 *
 * ```tsx
 * export default function RolesPage() {
 *   return (
 *     <ProtectedPage requiredPermission="roles:VIEW">
 *       <div>Contenido de la página...</div>
 *     </ProtectedPage>
 *   );
 * }
 * ```
 */
export function ProtectedPage({
  children,
  requiredPermission,
  requiredPermissions,
  redirectTo = "/dashboard",
  showAccessDenied = true,
}: ProtectedPageProps) {
  const router = useRouter();
  const { user, permissions, isLoading, error } = useAuth();

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  // Not authenticated - redirect to login
  if (error || !user) {
    router.push("/login");
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  // Check permissions
  let hasAccess = true;

  // Admin has access to everything
  if (!permissions.includes("*")) {
    // Verificar permiso único
    if (requiredPermission) {
      hasAccess = permissions.includes(requiredPermission);
    }
    // Verificar múltiples permisos (necesita al menos uno)
    else if (requiredPermissions && requiredPermissions.length > 0) {
      hasAccess = requiredPermissions.some((perm) =>
        permissions.includes(perm),
      );
    }
  }

  // No access - redirect or show denied
  if (!hasAccess) {
    if (!showAccessDenied) {
      router.push(redirectTo);
      return null;
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <div className="rounded-full bg-destructive/10 p-4 mb-4">
          <svg
            className="h-12 w-12 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
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
            Tu rol actual: <strong>{user.role}</strong>
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

  // Has access - render children
  return <>{children}</>;
}

/**
 * Mapeo de rutas a permisos requeridos
 * Usado para proteger automáticamente páginas
 */
export const PAGE_PERMISSIONS: Record<string, string> = {
  "/roles": "roles:VIEW",
  "/users": "users:VIEW",
  "/orders": "orders:VIEW",
  "/vehicles": "vehicles:VIEW",
  "/drivers": "drivers:VIEW",
  "/fleets": "fleets:VIEW",
  "/zones": "zones:VIEW",
  "/alerts": "alerts:VIEW",
  "/optimization-presets": "presets:VIEW",
  "/planificacion": "optimization:VIEW",
  "/monitoring": "routes:VIEW",
};
