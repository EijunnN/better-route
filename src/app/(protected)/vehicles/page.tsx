"use client";

import { ProtectedPage } from "@/components/auth/protected-page";
import {
  useVehicles,
  VehiclesFormView,
  VehiclesListView,
  VehiclesProvider,
} from "@/components/vehicles";

function VehiclesPageContent() {
  const { state, meta } = useVehicles();

  if (!meta.isReady) {
    return (
      <div className="flex justify-center py-12">
        <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
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
