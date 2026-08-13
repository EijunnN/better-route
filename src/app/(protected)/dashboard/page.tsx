import { ProtectedPage } from "@/components/auth/protected-page";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

// El guard de sistema fresco (ADMIN_SISTEMA sin empresas → /onboarding) vive
// en el layout de (protected): acá dentro ya era tarde, el chrome se había
// emitido por streaming antes de que el guard resolviera.
export default function DashboardPage() {
  return (
    <ProtectedPage requiredPermission="metrics:read">
      <DashboardClient />
    </ProtectedPage>
  );
}
