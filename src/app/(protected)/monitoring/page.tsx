"use client";

import { ProtectedPage } from "@/components/auth/protected-page";
import { MonitoringProvider, MonitoringDashboardView } from "@/components/monitoring";

export default function MonitoringPage() {
  return (
    <ProtectedPage requiredPermission="vehicle:read">
      <MonitoringProvider>
        <MonitoringDashboardView />
      </MonitoringProvider>
    </ProtectedPage>
  );
}
