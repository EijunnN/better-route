"use client";

import type { User } from "@/components/users";
import { useApiData } from "@/hooks/use-api";
import { useCompanyContext } from "@/hooks/use-company-context";

/**
 * Company users (`GET /api/users`) as a shared SWR resource. Accepts optional
 * `role` and `active` filters that map to query parameters, so SWR uses a
 * distinct cache key per combination without any manual fetch logic.
 */
export function useUserList(params?: { role?: string; active?: boolean }) {
  const { effectiveCompanyId } = useCompanyContext();
  const url = effectiveCompanyId
    ? (() => {
        const qs = new URLSearchParams();
        if (params?.role) qs.set("role", params.role);
        if (params?.active !== undefined)
          qs.set("active", String(params.active));
        const q = qs.toString();
        return q ? `/api/users?${q}` : "/api/users";
      })()
    : null;
  return useApiData<User[]>(url, effectiveCompanyId);
}
