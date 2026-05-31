"use client";

import type { OptimizationPreset } from "@/components/optimization-presets";
import { useApiData } from "@/hooks/use-api";
import { useCompanyContext } from "@/hooks/use-company-context";

/**
 * Company optimization presets (`GET /api/optimization-presets`) as a shared
 * SWR resource, used by the optimization-presets page and the optimization
 * dashboard.
 */
export function useOptimizationPresetList() {
  const { effectiveCompanyId } = useCompanyContext();
  return useApiData<OptimizationPreset[]>(
    effectiveCompanyId ? "/api/optimization-presets" : null,
    effectiveCompanyId,
  );
}
