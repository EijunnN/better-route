"use client";

import { PermissionsProvider } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";
import { CompanyProvider } from "./company-context";
import { LayoutProvider, useLayoutContext } from "./layout-context";
import { Sidebar } from "./sidebar";
import { ThemeProvider } from "./theme-context";

interface AppShellProps {
  children: React.ReactNode;
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

export function AppShell({ children }: AppShellProps) {
  return (
    <ThemeProvider>
      <PermissionsProvider>
        <CompanyProvider>
          <LayoutProvider>
            <AppShellContent>{children}</AppShellContent>
          </LayoutProvider>
        </CompanyProvider>
      </PermissionsProvider>
    </ThemeProvider>
  );
}
