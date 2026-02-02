"use client";

import { ProtectedPage } from "@/components/auth/protected-page";
import { VehiclesProvider, useVehicles, VehiclesListView, VehiclesFormView } from "@/components/vehicles";

function VehiclesPageContent() {
  const { state, meta } = useVehicles();

  if (!meta.isReady) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (state.showForm || state.editingVehicle) {
    return <VehiclesFormView />;
  }

  return <VehiclesListView />;
}

export default function VehiclesPage() {
  return (
    <ProtectedPage requiredPermission="vehicle:read">
      <VehiclesProvider>
        <VehiclesPageContent />
      </VehiclesProvider>
    </ProtectedPage>
  );
}
