"use client";

import { SWRConfig } from "swr";
import { AUTH_ME_KEY, type AuthUser } from "@/hooks/use-auth";
import { PermissionsProvider } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";
import { CompanyProvider } from "./company-context";
import { LayoutProvider, useLayoutContext } from "./layout-context";
import { Sidebar } from "./sidebar";
import { ThemeProvider } from "./theme-context";

interface AppShellProps {
  children: React.ReactNode;
}

interface AppShellRootProps extends AppShellProps {
  /**
   * Sesión resuelta en el servidor por el layout. Va como `fallback` de SWR
   * para que el chrome —sidebar incluido— salga pintado en el primer HTML.
   *
   * Sin esto el sidebar se queda en skeleton hasta que responde
   * `/api/auth/me`, que verifica el JWT y pega tres queries contra Neon: en
   * producción eran ~1,5 s de función fría, y el usuario veía la app entera
   * cargando en cada recarga. Ese endpoint sigue existiendo para revalidar y
   * para la app móvil; lo que se saca es del camino crítico del primer render.
   */
  initialUser: AuthUser | null;
}

function AppShellContent({ children }: AppShellProps) {
  const { fullWidth } = useLayoutContext();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div
        className={cn(
          "flex flex-1 flex-col overflow-hidden",
          !fullWidth &&
            "my-3 mr-3 rounded-xl border border-border bg-muted/30 shadow-xl",
        )}
      >
        <main
          className={cn(
            "flex flex-1 flex-col overflow-y-auto",
            fullWidth ? "p-0" : "p-4",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export function AppShell({ children, initialUser }: AppShellRootProps) {
  return (
    <SWRConfig
      value={initialUser ? { fallback: { [AUTH_ME_KEY]: initialUser } } : {}}
    >
      <ThemeProvider>
        <PermissionsProvider>
          <CompanyProvider>
            <LayoutProvider>
              <AppShellContent>{children}</AppShellContent>
            </LayoutProvider>
          </CompanyProvider>
        </PermissionsProvider>
      </ThemeProvider>
    </SWRConfig>
  );
}
