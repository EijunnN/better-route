"use client";

import useSWR, { type SWRConfiguration } from "swr";

/**
 * Generic fetcher for SWR with company header
 */
async function fetcher<T>(url: string, companyId?: string): Promise<T> {
  const headers: HeadersInit = {};
  if (companyId) {
    headers["x-company-id"] = companyId;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || error.message || "Request failed");
  }

  const data = await response.json();
  return data.data ?? data;
}

/**
 * SWR hook for fetching data with company context
 */
export function useApiData<T>(
  url: string | null,
  companyId: string | null | undefined,
  config?: SWRConfiguration<T>,
) {
  return useSWR<T>(
    url && companyId ? [url, companyId] : null,
    ([u, cId]: [string, string]) => fetcher<T>(u, cId),
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
      ...config,
    },
  );
}
