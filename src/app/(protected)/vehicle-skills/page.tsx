"use client";

import { ProtectedPage } from "@/components/auth/protected-page";
import { VehicleSkillsProvider, useVehicleSkills, VehicleSkillsListView, VehicleSkillsFormView } from "@/components/vehicle-skills";

function VehicleSkillsPageContent() {
  const { state, meta } = useVehicleSkills();

  if (!meta.isReady) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (state.showForm || state.editingSkill) {
    return <VehicleSkillsFormView />;
  }

  return <VehicleSkillsListView />;
}

export default function VehicleSkillsPage() {
  return (
    <ProtectedPage requiredPermission="vehicle_skill:read">
      <VehicleSkillsProvider>
        <VehicleSkillsPageContent />
      </VehicleSkillsProvider>
    </ProtectedPage>
  );
}
