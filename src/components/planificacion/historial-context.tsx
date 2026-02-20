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
import { useToast } from "@/hooks/use-toast";

import { safeParseJson } from "@/lib/utils/safe-json";
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
  searchTerm: string;
  currentPage: number;
  totalCount: number;
  pageSize: number;
}

// Actions
export interface HistorialActions {
  loadJobs: () => Promise<void>;
  setStatusFilter: (status: JobStatus) => void;
  setSearchTerm: (term: string) => void;
  setPage: (page: number) => void;
  handleReoptimize: (job: OptimizationJob) => void;
  handleDelete: (job: OptimizationJob) => Promise<void>;
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
  const { toast } = useToast();
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
  const [searchTerm, setSearchTermState] = useState("");
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
      if (searchTerm) {
        params.append("search", searchTerm);
      }
      params.append("limit", String(pageSize));
      params.append("offset", String((currentPage - 1) * pageSize));

      const response = await fetch(`/api/optimization/jobs?${params}`, {
        headers: { "x-company-id": companyId },
      });

      if (!response.ok) throw new Error("Failed to load jobs");

      const data = await response.json();

      // Deduplicate: keep only the latest job per configurationId
      const seenConfigs = new Set<string>();
      const uniqueJobs = (data.data || []).filter((job: { configurationId: string }) => {
        if (!job.configurationId) return true;
        if (seenConfigs.has(job.configurationId)) return false;
        seenConfigs.add(job.configurationId);
        return true;
      });

      const jobsWithDetails = uniqueJobs.map(
        (job: OptimizationJob & { result?: string; configurationName?: string }) => {
          // Parse result JSON string from API
          let parsedResult = undefined;
          if (job.result) {
            try {
              parsedResult = typeof job.result === "string"
                ? safeParseJson(job.result)
                : job.result;
            } catch {
              // Ignore parse errors
            }
          }

          // Use configurationName from API JOIN instead of N+1 fetches
          const configuration = job.configurationName
            ? { name: job.configurationName, objective: "" }
            : undefined;

          return { ...job, result: parsedResult, configuration };
        }
      );

      setJobs(jobsWithDetails);
      setTotalCount(uniqueJobs.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar trabajos");
    } finally {
      setIsLoading(false);
    }
  }, [companyId, statusFilter, searchTerm, currentPage, pageSize]);

  useEffect(() => {
    if (companyId) {
      loadJobs();
    }
  }, [companyId, loadJobs]);

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

  const handleDelete = useCallback(
    async (job: OptimizationJob) => {
      if (!companyId || !job.configurationId) return;
      try {
        const response = await fetch(
          `/api/optimization/configure/${job.configurationId}`,
          {
            method: "DELETE",
            headers: { "x-company-id": companyId },
          }
        );
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Error al eliminar el plan");
        }
        toast({
          title: "Plan eliminado",
          description: "El plan ha sido eliminado exitosamente.",
        });
        await loadJobs();
      } catch (err) {
        toast({
          title: "Error al eliminar",
          description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
          variant: "destructive",
        });
      }
    },
    [companyId, loadJobs, toast]
  );

  const navigateToResults = useCallback(
    (job: OptimizationJob) => {
      router.push(`/planificacion/${job.configurationId}/results?jobId=${job.id}`);
    },
    [router]
  );

  const setPage = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handleSetStatusFilter = useCallback((status: JobStatus) => {
    setStatusFilter(status);
    setCurrentPage(1);
  }, []);

  const setSearchTerm = useCallback((term: string) => {
    setSearchTermState(term);
    setCurrentPage(1);
  }, []);

  // Derived values
  const filteredJobs = jobs;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const state: HistorialState = {
    jobs,
    isLoading,
    error,
    statusFilter,
    searchTerm,
    currentPage,
    totalCount,
    pageSize,
  };

  const actions: HistorialActions = {
    loadJobs,
    setStatusFilter: handleSetStatusFilter,
    setSearchTerm,
    setPage,
    handleReoptimize,
    handleDelete,
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
