"use client";

import { cn } from "@/lib/utils";
import { PermissionsProvider } from "@/hooks/use-permissions";
import { Header } from "./header";
import { LayoutProvider, useLayoutContext } from "./layout-context";
import { Sidebar } from "./sidebar";

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
            "flex-1 overflow-y-auto bg-muted/30",
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
    <PermissionsProvider>
      <LayoutProvider>
        <AppShellContent title={title}>{children}</AppShellContent>
      </LayoutProvider>
    </PermissionsProvider>
  );
}
