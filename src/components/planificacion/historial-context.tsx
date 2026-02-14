"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useCompanyContext } from "@/hooks/use-company-context";

// Types
export interface OptimizationJob {
  id: string;
  configurationId: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  progress: number;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  result?: OptimizationResult;
  configuration?: {
    name: string;
    objective: string;
  };
}

export interface OptimizationResult {
  routes: Array<{
    routeId: string;
    vehicleId: string;
    vehiclePlate: string;
    driverId?: string;
    driverName?: string;
    totalDistance: number;
    totalDuration: number;
    totalStops: number;
    utilizationPercentage: number;
    timeWindowViolations: number;
  }>;
  unassignedOrders: Array<{
    orderId: string;
    trackingId: string;
    reason: string;
  }>;
  metrics: {
    totalDistance: number;
    totalDuration: number;
    totalRoutes: number;
    totalStops: number;
    utilizationRate: number;
    timeWindowComplianceRate: number;
    balanceScore?: number;
  };
  summary: {
    optimizedAt: string;
    objective: string;
    processingTimeMs: number;
  };
  isPartial?: boolean;
}

export type JobStatus = "all" | "COMPLETED" | "CANCELLED" | "FAILED" | "RUNNING" | "PENDING";

// State
export interface HistorialState {
  jobs: OptimizationJob[];
  isLoading: boolean;
  error: string | null;
  statusFilter: JobStatus;
  selectedJobIds: string[];
  currentPage: number;
  totalCount: number;
  pageSize: number;
}

// Actions
export interface HistorialActions {
  loadJobs: () => Promise<void>;
  setStatusFilter: (status: JobStatus) => void;
  setPage: (page: number) => void;
  toggleJobSelection: (jobId: string) => void;
  clearSelection: () => void;
  handleReoptimize: (job: OptimizationJob) => void;
  navigateToResults: (job: OptimizationJob) => void;
}

// Company type from useCompanyContext
interface Company {
  id: string;
  commercialName: string;
}

// Meta
export interface HistorialMeta {
  companyId: string | null;
  isReady: boolean;
  isSystemAdmin: boolean;
  companies: Company[];
  selectedCompanyId: string | null;
  setSelectedCompanyId: (id: string | null) => void;
  authCompanyId: string | null;
}

// Derived
export interface HistorialDerived {
  filteredJobs: OptimizationJob[];
  selectedJobs: OptimizationJob[];
  canCompare: boolean;
  totalPages: number;
}

interface HistorialContextValue {
  state: HistorialState;
  actions: HistorialActions;
  meta: HistorialMeta;
  derived: HistorialDerived;
}

const HistorialContext = createContext<HistorialContextValue | undefined>(undefined);

export interface HistorialProviderProps {
  children: ReactNode;
}

export function HistorialProvider({ children }: HistorialProviderProps) {
  const router = useRouter();
  const {
    effectiveCompanyId: companyId,
    isReady,
    isSystemAdmin,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    authCompanyId,
  } = useCompanyContext();

  const [jobs, setJobs] = useState<OptimizationJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<JobStatus>("all");
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 10;

  const loadJobs = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }
      params.append("limit", String(pageSize));
      params.append("offset", String((currentPage - 1) * pageSize));

      const response = await fetch(`/api/optimization/jobs?${params}`, {
        headers: { "x-company-id": companyId },
      });

      if (!response.ok) throw new Error("Failed to load jobs");

      const data = await response.json();
      const jobsWithDetails = await Promise.all(
        (data.data || []).map(async (job: OptimizationJob) => {
          let config = null;
          if (job.configurationId) {
            try {
              const configResponse = await fetch(
                `/api/optimization/configure/${job.configurationId}`,
                { headers: { "x-company-id": companyId } }
              );
              if (configResponse.ok) {
                const configData = await configResponse.json();
                config = configData.data;
              }
            } catch {
              // Ignore config fetch errors
            }
          }
          return { ...job, configuration: config };
        })
      );

      setJobs(jobsWithDetails);
      setTotalCount(data.meta?.total ?? jobsWithDetails.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar trabajos");
    } finally {
      setIsLoading(false);
    }
  }, [companyId, statusFilter, currentPage, pageSize]);

  useEffect(() => {
    if (companyId) {
      loadJobs();
    }
  }, [companyId, loadJobs]);

  const toggleJobSelection = useCallback((jobId: string) => {
    setSelectedJobIds((prev) =>
      prev.includes(jobId)
        ? prev.filter((id) => id !== jobId)
        : [...prev, jobId].slice(0, 2)
    );
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedJobIds([]);
  }, []);

  const handleReoptimize = useCallback(
    (job: OptimizationJob) => {
      if (!job.configurationId) {
        setError("No se puede reoptimizar: configuración no encontrada");
        return;
      }
      router.push(`/planificacion/${job.configurationId}/results?reoptimize=true`);
    },
    [router]
  );

  const navigateToResults = useCallback(
    (job: OptimizationJob) => {
      router.push(`/planificacion/${job.configurationId}/results?jobId=${job.id}`);
    },
    [router]
  );

  const setPage = useCallback((page: number) => {
    setCurrentPage(page);
    setSelectedJobIds([]);
  }, []);

  const handleSetStatusFilter = useCallback((status: JobStatus) => {
    setStatusFilter(status);
    setCurrentPage(1);
    setSelectedJobIds([]);
  }, []);

  // Derived values
  // Filtering is done server-side, so filteredJobs = jobs
  const filteredJobs = jobs;

  const selectedJobs = jobs.filter((j) => selectedJobIds.includes(j.id));
  const canCompare = selectedJobIds.length >= 2;

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const state: HistorialState = {
    jobs,
    isLoading,
    error,
    statusFilter,
    selectedJobIds,
    currentPage,
    totalCount,
    pageSize,
  };

  const actions: HistorialActions = {
    loadJobs,
    setStatusFilter: handleSetStatusFilter,
    setPage,
    toggleJobSelection,
    clearSelection,
    handleReoptimize,
    navigateToResults,
  };

  const meta: HistorialMeta = {
    companyId,
    isReady,
    isSystemAdmin,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    authCompanyId,
  };

  const derived: HistorialDerived = {
    filteredJobs,
    selectedJobs,
    canCompare,
    totalPages,
  };

  return (
    <HistorialContext value={{ state, actions, meta, derived }}>
      {children}
    </HistorialContext>
  );
}

export function useHistorial(): HistorialContextValue {
  const context = use(HistorialContext);
  if (context === undefined) {
    throw new Error("useHistorial must be used within a HistorialProvider");
  }
  return context;
}
