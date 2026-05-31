"use client";

import type { Vehicle } from "@/components/vehicles";
import { useApiData } from "@/hooks/use-api";
import { useCompanyContext } from "@/hooks/use-company-context";

/** A vehicle row as `GET /api/vehicles` returns it: the full vehicle plus its
 * fleet memberships. Consumers project this down to whatever shape they need. */
export type VehicleListRow = Vehicle & {
  fleets?: Array<{ id: string; name: string }>;
};

/**
 * Company vehicles (`GET /api/vehicles`) as a shared SWR resource. The vehicles
 * and fleets pages both load the unparameterized URL, so they share one cache
 * entry. Pass `limit` for callers that need more than the server default (50,
 * max 100) — that's a distinct query/key (e.g. the zones vehicle picker).
 */
export function useVehicleList(params?: { limit?: number }) {
  const { effectiveCompanyId } = useCompanyContext();
  const url = params?.limit
    ? `/api/vehicles?limit=${params.limit}`
    : "/api/vehicles";
  return useApiData<VehicleListRow[]>(
    effectiveCompanyId ? url : null,
    effectiveCompanyId,
  );
}
