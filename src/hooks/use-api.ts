"use client";

import useSWR, { type SWRConfiguration } from "swr";
import useSWRMutation from "swr/mutation";

/**
 * Generic fetcher for SWR with company header
 */
async function fetcher<T>(
  url: string,
  companyId?: string
): Promise<T> {
  const headers: HeadersInit = {};
  if (companyId) {
    headers["x-company-id"] = companyId;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || error.message || "Request failed");
  }

  const data = await response.json();
  return data.data ?? data;
}

/**
 * Create a fetcher bound to a specific company
 */
export function createCompanyFetcher(companyId: string) {
  return <T>(url: string) => fetcher<T>(url, companyId);
}

/**
 * SWR hook for fetching data with company context
 */
export function useApiData<T>(
  url: string | null,
  companyId: string | null | undefined,
  config?: SWRConfiguration<T>
) {
  return useSWR<T>(
    url && companyId ? [url, companyId] : null,
    ([u, cId]: [string, string]) => fetcher<T>(u, cId),
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
      ...config,
    }
  );
}

/**
 * SWR hook for fetching list data with pagination
 */
export function useApiList<T>(
  baseUrl: string | null,
  companyId: string | null | undefined,
  params?: Record<string, string | number | boolean | undefined>,
  config?: SWRConfiguration<T[]>
) {
  const url = baseUrl ? buildUrl(baseUrl, params) : null;

  return useSWR<T[]>(
    url && companyId ? [url, companyId] : null,
    ([u, cId]: [string, string]) => fetcher<T[]>(u, cId),
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
      ...config,
    }
  );
}

/**
 * Build URL with query parameters
 */
function buildUrl(
  baseUrl: string,
  params?: Record<string, string | number | boolean | undefined>
): string {
  if (!params) return baseUrl;

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.append(key, String(value));
    }
  }

  const queryString = searchParams.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

/**
 * SWR mutation hook for POST/PATCH/DELETE operations
 */
export function useApiMutation<TData, TResult = unknown>(
  url: string,
  method: "POST" | "PATCH" | "DELETE" = "POST"
) {
  return useSWRMutation<TResult, Error, string, { data: TData; companyId: string }>(
    url,
    async (url, { arg }) => {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-company-id": arg.companyId,
        },
        body: method !== "DELETE" ? JSON.stringify(arg.data) : undefined,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Request failed" }));
        throw new Error(error.error || error.message || "Request failed");
      }

      return response.json();
    }
  );
}

/**
 * Hook for data that should be refreshed on interval (e.g., monitoring)
 */
export function useApiPolling<T>(
  url: string | null,
  companyId: string | null | undefined,
  refreshInterval: number = 30000,
  config?: SWRConfiguration<T>
) {
  return useSWR<T>(
    url && companyId ? [url, companyId] : null,
    ([u, cId]: [string, string]) => fetcher<T>(u, cId),
    {
      refreshInterval,
      revalidateOnFocus: true,
      dedupingInterval: 2000,
      ...config,
    }
  );
}

/**
 * Hook for immutable data (never revalidates)
 */
export function useApiImmutable<T>(
  url: string | null,
  companyId: string | null | undefined
) {
  return useSWR<T>(
    url && companyId ? [url, companyId] : null,
    ([u, cId]: [string, string]) => fetcher<T>(u, cId),
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
}
