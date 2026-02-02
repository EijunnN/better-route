"use client";

import { ProtectedPage } from "@/components/auth/protected-page";
import { DriverSkillsProvider, useDriverSkills, DriverSkillsListView, DriverSkillsFormView } from "@/components/driver-skills";

function DriverSkillsPageContent() {
  const { state, meta } = useDriverSkills();

  if (!meta.isReady) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (state.showForm || state.editingDriverSkill) {
    return <DriverSkillsFormView />;
  }

  return <DriverSkillsListView />;
}

export default function DriverSkillsPage() {
  return (
    <ProtectedPage requiredPermission="driver_skill:read">
      <DriverSkillsProvider>
        <DriverSkillsPageContent />
      </DriverSkillsProvider>
    </ProtectedPage>
  );
}
