"use client";

import { useApiData } from "@/hooks/use-api";
import { useCompanyContext } from "@/hooks/use-company-context";

/** Minimal shape of a custom role as returned by `GET /api/roles`. */
export interface RoleListRow {
  id: string;
  name: string;
  description?: string | null;
  code?: string | null;
  isSystem: boolean;
}

/**
 * Company custom roles (`GET /api/roles`) as a shared SWR resource. Used by
 * the users form to populate the role picker.
 */
export function useRoleList() {
  const { effectiveCompanyId } = useCompanyContext();
  return useApiData<RoleListRow[]>(
    effectiveCompanyId ? "/api/roles" : null,
    effectiveCompanyId,
  );
}
