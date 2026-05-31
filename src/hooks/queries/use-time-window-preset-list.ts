"use client";

import type { TimeWindowPreset } from "@/components/time-window-presets";
import { useApiData } from "@/hooks/use-api";
import { useCompanyContext } from "@/hooks/use-company-context";

/**
 * Company time-window presets (`GET /api/time-window-presets`) as a shared SWR
 * resource. Returns the full entity (the time-window-presets page's type); the
 * order form consumes the subset of fields it needs.
 */
export function useTimeWindowPresetList() {
  const { effectiveCompanyId } = useCompanyContext();
  return useApiData<TimeWindowPreset[]>(
    effectiveCompanyId ? "/api/time-window-presets" : null,
    effectiveCompanyId,
  );
}
