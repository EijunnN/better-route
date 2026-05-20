"use client";

import { ProtectedPage } from "@/components/auth/protected-page";
import {
  TimeWindowPresetsListView,
  TimeWindowPresetsProvider,
  useTimeWindowPresets,
} from "@/components/time-window-presets";

function TimeWindowPresetsPageContent() {
  const { meta } = useTimeWindowPresets();

  if (!meta.isReady) {
    return (
      <div className="flex justify-center py-12">
        <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  return <TimeWindowPresetsListView />;
}

export default function TimeWindowPresetsPage() {
  return (
    <ProtectedPage requiredPermission="time_window_preset:read">
      <TimeWindowPresetsProvider>
        <TimeWindowPresetsPageContent />
      </TimeWindowPresetsProvider>
    </ProtectedPage>
  );
}
