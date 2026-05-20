"use client";

import { PermissionsProvider } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";
import { CompanyProvider } from "./company-context";
import { LayoutProvider, useLayoutContext } from "./layout-context";
import { Sidebar } from "./sidebar";
import { ThemeProvider } from "./theme-context";

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
}

function AppShellContent({ children, title }: AppShellProps) {
  const { hideHeader, fullWidth } = useLayoutContext();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* {!hideHeader && <Header title={title} />} */}
        <main
          className={cn(
            "flex flex-1 flex-col overflow-y-auto bg-muted/30",
            fullWidth ? "p-0" : "p-4",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export function AppShell({ children, title }: AppShellProps) {
  return (
    <ThemeProvider>
      <PermissionsProvider>
        <CompanyProvider>
          <LayoutProvider>
            <AppShellContent title={title}>{children}</AppShellContent>
          </LayoutProvider>
        </CompanyProvider>
      </PermissionsProvider>
    </ThemeProvider>
  );
}
