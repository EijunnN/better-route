"use client";

import { ProtectedPage } from "@/components/auth/protected-page";
import { UserSkillsProvider, useUserSkills, UserSkillsListView, UserSkillsFormView } from "@/components/user-skills";

function UserSkillsPageContent() {
  const { state, meta } = useUserSkills();

  if (!meta.isReady) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (state.showForm || state.editingUserSkill) {
    return <UserSkillsFormView />;
  }

  return <UserSkillsListView />;
}

export default function UserSkillsPage() {
  return (
    <ProtectedPage requiredPermission="driver_skill:read">
      <UserSkillsProvider>
        <UserSkillsPageContent />
      </UserSkillsProvider>
    </ProtectedPage>
  );
}
