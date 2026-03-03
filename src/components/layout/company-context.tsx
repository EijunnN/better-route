"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";

interface Company {
  id: string;
  commercialName: string;
}

interface CompanyContextValue {
  effectiveCompanyId: string | null;
  isReady: boolean;
  isAuthLoading: boolean;
  isSystemAdmin: boolean;
  authCompanyId: string | null;
  selectedCompanyId: string | null;
  setSelectedCompanyId: (id: string | null) => void;
  companies: Company[];
  isLoadingCompanies: boolean;
  user: ReturnType<typeof useAuth>["user"];
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

const STORAGE_KEY = "betterroute-selected-company";

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { user, companyId: authCompanyId, isLoading: isAuthLoading } = useAuth();

  const [selectedCompanyId, setSelectedCompanyIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY);
  });
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);

  const isSystemAdmin = user?.role === "ADMIN_SISTEMA";

  const setSelectedCompanyId = (id: string | null) => {
    setSelectedCompanyIdState(id);
    if (typeof window !== "undefined") {
      if (id) {
        localStorage.setItem(STORAGE_KEY, id);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  };

  const effectiveCompanyId =
    isSystemAdmin && selectedCompanyId ? selectedCompanyId : authCompanyId;

  const isReady =
    !isAuthLoading &&
    ((!isSystemAdmin && !!authCompanyId) ||
      (isSystemAdmin && !!effectiveCompanyId));

  // Fetch companies for system admins
  const fetchCompanies = async () => {
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
  };

  useEffect(() => {
    if (isSystemAdmin && !isAuthLoading) {
      fetchCompanies();
    }
  }, [isSystemAdmin, isAuthLoading]);

  // Auto-select: use localStorage value if valid, otherwise first company
  useEffect(() => {
    if (isSystemAdmin && companies.length > 0) {
      if (selectedCompanyId) {
        const isValid = companies.some((c) => c.id === selectedCompanyId);
        if (!isValid) {
          setSelectedCompanyId(companies[0].id);
        }
      } else {
        setSelectedCompanyId(companies[0].id);
      }
    }
  }, [isSystemAdmin, companies, selectedCompanyId, setSelectedCompanyId]);

  return (
    <CompanyContext.Provider
      value={{
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
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useGlobalCompany(): CompanyContextValue {
  const context = useContext(CompanyContext);
  if (!context) {
    throw new Error("useGlobalCompany must be used within a CompanyProvider");
  }
  return context;
}
