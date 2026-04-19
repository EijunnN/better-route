"use client";

import { ProtectedPage } from "@/components/auth/protected-page";
import { WorkflowProvider, WorkflowDashboardView } from "@/components/workflow";

export default function WorkflowPage() {
  return (
    <ProtectedPage requiredPermission="company:read">
      <WorkflowProvider>
        <WorkflowDashboardView />
      </WorkflowProvider>
    </ProtectedPage>
  );
}
