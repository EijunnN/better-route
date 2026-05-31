"use client";

import type { FieldDefinition } from "@/components/custom-fields";
import { useApiData } from "@/hooks/use-api";
import { useCompanyContext } from "@/hooks/use-company-context";

/**
 * Company custom-field definitions
 * (`GET /api/companies/:id/field-definitions`) as a shared SWR resource.
 * Returns every definition; consumers filter by `entity`/`active` as needed
 * (e.g. the order form keeps only `entity === "orders"` ones).
 */
export function useFieldDefinitionList() {
  const { effectiveCompanyId } = useCompanyContext();
  return useApiData<FieldDefinition[]>(
    effectiveCompanyId
      ? `/api/companies/${effectiveCompanyId}/field-definitions`
      : null,
    effectiveCompanyId,
  );
}
