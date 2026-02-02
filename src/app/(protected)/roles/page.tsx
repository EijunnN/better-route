"use client";

import { ProtectedPage } from "@/components/auth/protected-page";
import { RolesProvider, useRoles, RolesListView, RolesFormView } from "@/components/roles";

function RolesPageContent() {
  const { state, meta } = useRoles();

  if (meta.isAuthLoading || (!meta.authCompanyId && !meta.isSystemAdmin)) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (state.showForm) {
    return <RolesFormView />;
  }

  return <RolesListView />;
}

export default function RolesPage() {
  return (
    <ProtectedPage requiredPermission="role:read">
      <RolesProvider>
        <RolesPageContent />
      </RolesProvider>
    </ProtectedPage>
  );
}
