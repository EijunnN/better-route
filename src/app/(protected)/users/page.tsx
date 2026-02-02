"use client";

import { ProtectedPage } from "@/components/auth/protected-page";
import { UsersProvider, useUsers, UsersListView, UsersFormView } from "@/components/users";

function UsersContent() {
  const { state, meta } = useUsers();

  // Show loading state while auth is loading
  if (meta.isAuthLoading || (!meta.authCompanyId && !meta.isSystemAdmin)) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (state.showForm || state.editingUser) {
    return <UsersFormView />;
  }

  return <UsersListView />;
}

/**
 * Users Page - Compound Component Pattern
 *
 * Uses composition to separate:
 * - State management (UsersProvider)
 * - View components (UsersListView, UsersFormView)
 *
 * For custom layouts:
 * ```tsx
 * <UsersProvider>
 *   <UsersListView />
 *   <UsersFormView />
 * </UsersProvider>
 * ```
 */
export default function UsersPage() {
  return (
    <ProtectedPage requiredPermission="user:read">
      <UsersProvider>
        <UsersContent />
      </UsersProvider>
    </ProtectedPage>
  );
}
