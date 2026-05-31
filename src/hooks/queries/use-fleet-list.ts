"use client";

import type { Fleet } from "@/components/fleets";
import { useApiData } from "@/hooks/use-api";
import { useCompanyContext } from "@/hooks/use-company-context";

/**
 * Company fleets (`GET /api/fleets`) as a shared SWR resource. Consumed by
 * the fleets page and the vehicles form, so it lives as a domain hook over
 * `useApiData` instead of each context running its own `fetch`.
 *
 * NOTE: the `Fleet` type still lives in the fleets feature; importing it here
 * is `import type` only (erased at runtime, no module cycle). If more domain
 * hooks need these shapes we can lift them into a shared types module.
 */
export function useFleetList() {
  const { effectiveCompanyId } = useCompanyContext();
  return useApiData<Fleet[]>(
    effectiveCompanyId ? "/api/fleets" : null,
    effectiveCompanyId,
  );
}
