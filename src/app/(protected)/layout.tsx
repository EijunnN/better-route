import { AppShell } from "@/components/layout";
import { Toaster } from "@/components/ui/toast";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      {children}
      <Toaster />
    </AppShell>
  );
}
