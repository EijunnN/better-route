"use client";

import { useApiData } from "@/hooks/use-api";
import { useCompanyContext } from "@/hooks/use-company-context";

export interface CompanyProfileFlags {
  enableWeight: boolean;
  enableVolume: boolean;
  enableOrderValue: boolean;
  enableUnits: boolean;
  enableOrderType: boolean;
}

interface CompanyProfileResponse {
  profile: CompanyProfileFlags | null;
  defaults?: CompanyProfileFlags;
}

/**
 * The company's optimization profile (`GET /api/company-profiles`). Shared by
 * the orders form and the vehicles context, so it routes through one SWR key.
 * Returns `profile` (the saved config, or null when the company has none) plus
 * the server `defaults`; consumers project these onto their own shape.
 */
export function useCompanyProfile() {
  const { effectiveCompanyId } = useCompanyContext();
  const { data, isLoading, error, mutate } = useApiData<CompanyProfileResponse>(
    effectiveCompanyId ? "/api/company-profiles" : null,
    effectiveCompanyId,
  );

  return {
    profile: data?.profile ?? null,
    defaults: data?.defaults ?? null,
    isLoading,
    error,
    mutate,
  };
}
