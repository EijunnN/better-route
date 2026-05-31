"use client";

import { useApiData } from "@/hooks/use-api";
import { useCompanyContext } from "@/hooks/use-company-context";

/**
 * Drivers = a company's CONDUCTOR-role users, used to populate driver pickers
 * (assign a driver to a vehicle, reassign a route). Exposed as a domain hook
 * over `useApiData` so every consumer shares one SWR cache entry instead of
 * each firing its own `fetch` in a `useEffect`.
 */
export function useDrivers() {
  const { effectiveCompanyId } = useCompanyContext();

  const { data, isLoading, error, mutate } = useApiData<
    Array<{ id: string; name: string }>
  >(
    effectiveCompanyId ? "/api/users?role=CONDUCTOR" : null,
    effectiveCompanyId,
  );

  return { drivers: data ?? [], isLoading, error, mutate };
}
