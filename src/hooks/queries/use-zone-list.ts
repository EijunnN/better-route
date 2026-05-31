"use client";

import type { Zone } from "@/components/zones";
import { useApiData } from "@/hooks/use-api";
import { useCompanyContext } from "@/hooks/use-company-context";

/**
 * Company zones (`GET /api/zones`) as a shared SWR resource. Accepts optional
 * filter params that are forwarded as query string parameters.
 */
export function useZoneList(params?: {
  type?: string;
  active?: boolean;
  limit?: number;
}) {
  const { effectiveCompanyId } = useCompanyContext();
  let url: string | null = null;
  if (effectiveCompanyId) {
    const qs = new URLSearchParams();
    if (params?.type) qs.set("type", params.type);
    if (params?.active !== undefined) qs.set("active", String(params.active));
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    const query = qs.toString();
    url = query ? `/api/zones?${query}` : "/api/zones";
  }
  return useApiData<Zone[]>(url, effectiveCompanyId);
}
