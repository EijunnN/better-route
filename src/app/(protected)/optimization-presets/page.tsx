"use client";

import { ProtectedPage } from "@/components/auth/protected-page";
import { PresetsProvider, usePresets, PresetsListView } from "@/components/optimization-presets";

function OptimizationPresetsPageContent() {
  const { meta } = usePresets();

  if (!meta.isReady) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border bg-card animate-pulse">
              <div className="p-6">
                <div className="h-5 bg-muted rounded w-1/2" />
                <div className="h-4 bg-muted rounded w-3/4 mt-2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <PresetsListView />;
}

export default function OptimizationPresetsPage() {
  return (
    <ProtectedPage requiredPermission="optimization_preset:read">
      <PresetsProvider>
        <OptimizationPresetsPageContent />
      </PresetsProvider>
    </ProtectedPage>
  );
}
