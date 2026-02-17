"use client";

import { ProtectedPage } from "@/components/auth/protected-page";
import { CustomFieldsProvider, CustomFieldsDashboardView } from "@/components/custom-fields";

export default function CustomFieldsPage() {
  return (
    <ProtectedPage requiredPermission="order:read">
      <CustomFieldsProvider>
        <CustomFieldsDashboardView />
      </CustomFieldsProvider>
    </ProtectedPage>
  );
}
