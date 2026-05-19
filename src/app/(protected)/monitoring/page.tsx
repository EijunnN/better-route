"use client";

import { ProtectedPage } from "@/components/auth/protected-page";
import { ChatProvider } from "@/components/chat";
import {
  MonitoringDashboardView,
  MonitoringProvider,
} from "@/components/monitoring";

export default function MonitoringPage() {
  return (
    <ProtectedPage requiredPermission="vehicle:read">
      <MonitoringProvider>
        <ChatProvider>
          <MonitoringDashboardView />
        </ChatProvider>
      </MonitoringProvider>
    </ProtectedPage>
  );
}
