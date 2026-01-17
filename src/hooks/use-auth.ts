"use client";

import { useCallback, useEffect, useRef } from "react";
import useSWR from "swr";

interface User {
  id: string;
  companyId: string | null;
  email: string;
  name: string;
  role: string;
  active: boolean;
  permissions: string[];
}

interface UseAuthReturn {
  user: User | null;
  companyId: string | null;
  permissions: string[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// Refresh token before it expires (refresh when 2 minutes left)
const TOKEN_REFRESH_MARGIN_MS = 2 * 60 * 1000;
// Token lifetime from server (15 minutes)
const TOKEN_LIFETIME_MS = 15 * 60 * 1000;

// Fetcher for SWR
const fetcher = async (url: string): Promise<User> => {
  const response = await fetch(url, { credentials: "include" });

  if (!response.ok) {
    const error = new Error("Failed to fetch user");
    (error as Error & { status: number }).status = response.status;
    throw error;
  }

  return response.json();
};

export function useAuth(): UseAuthReturn {
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isRefreshingRef = useRef(false);
  const lastRefreshRef = useRef<number>(Date.now());

  // Use SWR for data fetching with deduplication
  const { data: user, error, isLoading, mutate } = useSWR<User>(
    "/api/auth/me",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 10000, // 10 seconds deduplication
      errorRetryCount: 1,
      onError: async (err) => {
        // If 401, try to refresh token
        if ((err as Error & { status?: number }).status === 401) {
          const refreshed = await refreshToken();
          if (refreshed) {
            mutate(); // Retry after refresh
          } else {
            window.location.href = "/login";
          }
        }
      },
    }
  );

  // Clear refresh timer
  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  // Refresh the access token
  const refreshToken = useCallback(async (): Promise<boolean> => {
    // Prevent concurrent refresh attempts
    if (isRefreshingRef.current) {
      return false;
    }

    // Don't refresh if we just did it recently (within 30 seconds)
    const now = Date.now();
    if (now - lastRefreshRef.current < 30000) {
      return true;
    }

    isRefreshingRef.current = true;

    try {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        lastRefreshRef.current = Date.now();
        return true;
      }

      return false;
    } catch {
      return false;
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  // Schedule next token refresh
  const scheduleRefresh = useCallback(() => {
    clearRefreshTimer();

    // Schedule refresh 2 minutes before token expires
    const refreshIn = TOKEN_LIFETIME_MS - TOKEN_REFRESH_MARGIN_MS;

    refreshTimerRef.current = setTimeout(async () => {
      const success = await refreshToken();
      if (success) {
        // Schedule next refresh
        scheduleRefresh();
      } else {
        // Refresh failed, redirect to login
        window.location.href = "/login";
      }
    }, refreshIn);
  }, [clearRefreshTimer, refreshToken]);

  // Schedule token refresh when user is loaded
  useEffect(() => {
    if (user) {
      scheduleRefresh();
    }
    return () => clearRefreshTimer();
  }, [user, scheduleRefresh, clearRefreshTimer]);

  // Handle visibility change - refresh token when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible" && user) {
        // Tab became visible, check if we need to refresh
        const timeSinceLastRefresh = Date.now() - lastRefreshRef.current;
        if (timeSinceLastRefresh > TOKEN_LIFETIME_MS - TOKEN_REFRESH_MARGIN_MS) {
          const success = await refreshToken();
          if (success) {
            scheduleRefresh();
            mutate(); // Refresh user data
          } else {
            window.location.href = "/login";
          }
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user, refreshToken, scheduleRefresh, mutate]);

  return {
    user: user ?? null,
    companyId: user?.companyId ?? null,
    permissions: user?.permissions ?? [],
    isLoading,
    error: error?.message ?? null,
    refetch: async () => { await mutate(); },
  };
}
