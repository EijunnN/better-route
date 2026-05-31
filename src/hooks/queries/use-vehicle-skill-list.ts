"use client";

import type { VehicleSkill } from "@/components/vehicles";
import { useApiData } from "@/hooks/use-api";
import { useCompanyContext } from "@/hooks/use-company-context";

/**
 * Active vehicle skills (`GET /api/vehicle-skills?active=true`) as a shared
 * SWR resource, used to populate skill pickers in the vehicle form.
 */
export function useVehicleSkillList() {
  const { effectiveCompanyId } = useCompanyContext();
  return useApiData<VehicleSkill[]>(
    effectiveCompanyId ? "/api/vehicle-skills?active=true" : null,
    effectiveCompanyId,
  );
}
