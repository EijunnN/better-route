import { cookies } from "next/headers";
import { cache } from "react";
import { verifyToken } from "@/lib/auth/auth";

/**
 * React.cache() wrapped function for per-request deduplication of the
 * authenticated user's companyId. Multiple calls within the same request
 * only re-verify the JWT once.
 *
 * NOTE: the previous file also exported an LRU-based `getCached` +
 * invalidation helpers. Those were unused and NOT tenant-aware by
 * construction (process-local cache keyed by a caller-supplied string:
 * one process caches tenant A's row, the next request for tenant B on the
 * same process reads it back), so they were deleted to remove the footgun.
 */
export const getCompanyId = cache(async (): Promise<string | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload || payload.type !== "access") return null;

  return payload.companyId;
});
