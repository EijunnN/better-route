"use client";

import { Loader2 } from "lucide-react";
import { ProtectedPage } from "@/components/auth/protected-page";
import {
  ZonesProvider,
  useZones,
  ZonesListView,
  ZonesFormView,
  ZonesMapEditorView,
} from "@/components/zones";

function ZonesContent() {
  const { state, meta } = useZones();

  if (!meta.isReady) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (state.viewMode === "map-editor") {
    return <ZonesMapEditorView />;
  }

  if (state.viewMode === "form") {
    return <ZonesFormView />;
  }

  return <ZonesListView />;
}

/**
 * Zones Page - Compound Component Pattern
 *
 * Uses composition to separate:
 * - State management (ZonesProvider)
 * - View components (ZonesListView, ZonesFormView, ZonesMapEditorView)
 *
 * For custom layouts:
 * ```tsx
 * <ZonesProvider>
 *   <ZonesListView />
 *   <ZonesFormView />
 *   <ZonesMapEditorView />
 * </ZonesProvider>
 * ```
 */
export default function ZonesPage() {
  return (
    <ProtectedPage requiredPermission="route:read">
      <ZonesProvider>
        <ZonesContent />
      </ZonesProvider>
    </ProtectedPage>
  );
}
