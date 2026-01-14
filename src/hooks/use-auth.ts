"use client";

import { useCallback, useEffect, useState } from "react";

interface User {
  id: string;
  companyId: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
}

interface UseAuthReturn {
  user: User | null;
  companyId: string | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/me");

      if (!response.ok) {
        if (response.status === 401) {
          // Not authenticated - redirect to login
          window.location.href = "/login";
          return;
        }
        throw new Error("Failed to fetch user");
      }

      const data = await response.json();
      setUser(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error fetching user");
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return {
    user,
    companyId: user?.companyId ?? null,
    isLoading,
    error,
    refetch: fetchUser,
  };
}
