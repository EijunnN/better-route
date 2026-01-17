"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./use-auth";

interface Company {
  id: string;
  commercialName: string;
}

interface UseCompanyContextReturn {
  /** The effective companyId to use for API calls */
  effectiveCompanyId: string | null;
  /** Whether we're ready to fetch data (auth loaded and company available) */
  isReady: boolean;
  /** Whether auth is still loading */
  isAuthLoading: boolean;
  /** Whether the user is a system admin */
  isSystemAdmin: boolean;
  /** The authenticated user's companyId (may be null for ADMIN_SISTEMA) */
  authCompanyId: string | null;
  /** The currently selected company for system admins */
  selectedCompanyId: string | null;
  /** Set the selected company (for system admins) */
  setSelectedCompanyId: (id: string | null) => void;
  /** List of companies (only populated for system admins) */
  companies: Company[];
  /** Whether companies are being loaded */
  isLoadingCompanies: boolean;
  /** The authenticated user */
  user: ReturnType<typeof useAuth>["user"];
}

/**
 * Hook that provides company context for pages that need tenant filtering.
 * Handles the complexity of ADMIN_SISTEMA users who can switch between companies.
 */
export function useCompanyContext(): UseCompanyContextReturn {
  const { user, companyId: authCompanyId, isLoading: isAuthLoading } = useAuth();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);

  const isSystemAdmin = user?.role === "ADMIN_SISTEMA";

  // Effective companyId: for system admins use selected, otherwise use auth
  const effectiveCompanyId = isSystemAdmin && selectedCompanyId
    ? selectedCompanyId
    : authCompanyId;

  // Ready when auth is done AND we have an effective companyId
  // For system admins, we wait until they have selected a company
  const isReady = !isAuthLoading && (
    (!isSystemAdmin && !!authCompanyId) ||
    (isSystemAdmin && !!effectiveCompanyId)
  );

  // Fetch companies for system admins
  const fetchCompanies = useCallback(async () => {
    if (!isSystemAdmin) return;

    setIsLoadingCompanies(true);
    try {
      const response = await fetch("/api/companies?active=true", {
        credentials: "include",
      });
      const data = await response.json();
      setCompanies(data.data || []);
    } catch (error) {
      console.error("Error fetching companies:", error);
    } finally {
      setIsLoadingCompanies(false);
    }
  }, [isSystemAdmin]);

  // Fetch companies when user is system admin
  useEffect(() => {
    if (isSystemAdmin && !isAuthLoading) {
      fetchCompanies();
    }
  }, [isSystemAdmin, isAuthLoading, fetchCompanies]);

  // Auto-select first company for system admins when companies load
  useEffect(() => {
    if (isSystemAdmin && !authCompanyId && !selectedCompanyId && companies.length > 0) {
      setSelectedCompanyId(companies[0].id);
    }
  }, [isSystemAdmin, authCompanyId, selectedCompanyId, companies]);

  return {
    effectiveCompanyId,
    isReady,
    isAuthLoading,
    isSystemAdmin,
    authCompanyId,
    selectedCompanyId,
    setSelectedCompanyId,
    companies,
    isLoadingCompanies,
    user,
  };
}
