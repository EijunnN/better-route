"use client";

import { ProtectedPage } from "@/components/auth/protected-page";
import { FleetsProvider, useFleets, FleetsListView, FleetsFormView } from "@/components/fleets";

function FleetsPageContent() {
  const { state, meta } = useFleets();

  if (!meta.isReady) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (state.showForm || state.editingFleet) {
    return <FleetsFormView />;
  }

  return <FleetsListView />;
}

export default function FleetsPage() {
  return (
    <ProtectedPage requiredPermission="fleet:read">
      <FleetsProvider>
        <FleetsPageContent />
      </FleetsProvider>
    </ProtectedPage>
  );
}
