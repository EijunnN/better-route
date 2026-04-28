"use client";

import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useState,
} from "react";
import useSWR from "swr";
import type { FieldDefinition } from "@/components/custom-fields/custom-fields-context";
import { useCompanyContext } from "@/hooks/use-company-context";
import { useMonitoringStream } from "./use-monitoring-stream";

const POLLING_INTERVAL = 10000;

const fetcher = async (url: string, companyId: string) => {
  const response = await fetch(url, { headers: { "x-company-id": companyId } });
  if (!response.ok) throw new Error("Failed to fetch");
  const result = await response.json();
  return result.data;
};

export interface WorkflowState {
  id: string;
  code: string;
  label: string;
  systemState: string;
  color: string;
  icon: string | null;
  requiresReason: boolean;
  requiresPhoto: boolean;
  requiresSignature: boolean;
  requiresNotes: boolean;
  reasonOptions: string[] | null;
  isTerminal: boolean;
}

export interface MonitoringData {
  hasActivePlan: boolean;
  jobId: string | null;
  configurationId: string | null;
  configurationName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  metrics: {
    totalDrivers: number;
    driversInRoute: number;
    driversAvailable: number;
    driversOnPause: number;
    completedStops: number;
    totalStops: number;
    completenessPercentage: number;
    delayedStops: number;
    activeAlerts: number;
  };
}

export interface DriverMonitoringData {
  id: string;
  name: string;
  status: string;
  fleetId: string;
  fleetName: string;
  fleetNames: string[];
  hasRoute: boolean;
  routeId: string | null;
  vehicleId: string | null;
  vehiclePlate: string | null;
  progress: { completedStops: number; totalStops: number; percentage: number };
  alerts: string[];
  currentLocation?: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    speed: number | null;
    heading: number | null;
    isMoving: boolean | null;
    batteryLevel: number | null;
    recordedAt: string;
    isRecent: boolean;
  } | null;
}

export interface DriverDetailData {
  driver: {
    id: string;
    name: string;
    status: string;
    identification: string;
    email: string;
    phone?: string;
    fleet: { id: string; name: string; type: string };
    fleets?: Array<{
      id: string;
      name: string;
      type: string;
      isPrimary: boolean;
    }>;
  };
  route: {
    routeId: string;
    jobId?: string;
    vehicle: { id: string; plate: string; brand: string; model: string };
    metrics: {
      totalDistance: number;
      totalDuration: number;
      totalWeight: number;
      totalVolume: number;
      utilizationPercentage: number;
      timeWindowViolations: number;
    };
    stops: Array<{
      id?: string;
      orderId: string;
      trackingId: string;
      sequence: number;
      address: string;
      latitude: string;
      longitude: string;
      status: string;
      estimatedArrival?: string;
      completedAt?: string | null;
      startedAt?: string | null;
      notes?: string | null;
      timeWindowStart?: string | null;
      timeWindowEnd?: string | null;
      workflowState?: {
        id: string;
        label: string;
        color: string;
        code: string;
        systemState: string;
      } | null;
    }>;
    assignmentQuality?: { score: number; warnings: string[]; errors: string[] };
  } | null;
}

export interface ConfirmedPlan {
  id: string;
  configurationName: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface MonitoringState {
  monitoringData: MonitoringData | undefined;
  driversData: DriverMonitoringData[];
  driverDetail: DriverDetailData | undefined;
  selectedDriverId: string | null;
  selectedJobId: string | null;
  selectedVehicleIds: string[];
  confirmedPlans: ConfirmedPlan[];
  isLoadingPlans: boolean;
  view: "overview" | "detail";
  showAlerts: boolean;
  isLoading: boolean;
  isLoadingDrivers: boolean;
  isLoadingDetail: boolean;
  error: string | null;
  alertsCount: number;
  lastUpdate: Date;
  workflowStates: WorkflowState[];
  fieldDefinitionLabels: Record<string, string>;
  routeStopFieldDefinitions: FieldDefinition[];
}

export interface MonitoringActions {
  handleDriverClick: (driverId: string) => void;
  handleBackToOverview: () => void;
  handleRefresh: () => void;
  handleDetailRefresh: () => void;
  setShowAlerts: (show: boolean) => void;
  setSelectedJobId: (jobId: string | null) => void;
  setSelectedVehicleIds: (ids: string[]) => void;
  toggleVehicleId: (id: string) => void;
  formatLastUpdate: (date: Date) => string;
  getWorkflowLabel: (systemState: string) => string;
  getWorkflowColor: (systemState: string) => string;
}

export interface MonitoringMeta {
  companyId: string | null;
  isReady: boolean;
  isSystemAdmin: boolean;
  companies: Array<{ id: string; commercialName: string }>;
  selectedCompanyId: string | null;
  setSelectedCompanyId: (id: string | null) => void;
  authCompanyId: string | null;
}

interface MonitoringContextValue {
  state: MonitoringState;
  actions: MonitoringActions;
  meta: MonitoringMeta;
}

const MonitoringContext = createContext<MonitoringContextValue | undefined>(
  undefined,
);

export function MonitoringProvider({ children }: { children: ReactNode }) {
  const {
    effectiveCompanyId: companyId,
    isReady,
    isSystemAdmin,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    authCompanyId,
  } = useCompanyContext();

  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  const [view, setView] = useState<"overview" | "detail">("overview");
  const [showAlerts, setShowAlerts] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Fetch confirmed plans for the plan selector
  const { data: confirmedPlans = [], isLoading: isLoadingPlans } = useSWR<
    ConfirmedPlan[]
  >(
    companyId ? ["/api/plans", companyId] : null,
    ([url, cId]: [string, string]) => fetcher(url, cId),
    { revalidateOnFocus: false },
  );

  // Build URL with optional jobId parameter
  const summaryUrl = companyId
    ? selectedJobId
      ? `/api/monitoring/summary?jobId=${selectedJobId}`
      : "/api/monitoring/summary"
    : null;

  const driversUrl = companyId
    ? selectedJobId
      ? `/api/monitoring/drivers?jobId=${selectedJobId}`
      : "/api/monitoring/drivers"
    : null;

  const {
    data: monitoringData,
    error: monitoringError,
    isLoading: isLoadingMonitoring,
    mutate: mutateMonitoring,
  } = useSWR<MonitoringData>(
    summaryUrl ? [summaryUrl, companyId] : null,
    ([url, cId]: [string, string]) => fetcher(url, cId),
    {
      refreshInterval: POLLING_INTERVAL,
      revalidateOnFocus: true,
      dedupingInterval: 2000,
      onSuccess: () => setLastUpdate(new Date()),
    },
  );

  const {
    data: driversData = [],
    isLoading: isLoadingDrivers,
    mutate: mutateDrivers,
  } = useSWR<DriverMonitoringData[]>(
    driversUrl ? [driversUrl, companyId] : null,
    ([url, cId]: [string, string]) => fetcher(url, cId),
    {
      refreshInterval: POLLING_INTERVAL,
      revalidateOnFocus: true,
      dedupingInterval: 2000,
      onSuccess: () => setLastUpdate(new Date()),
    },
  );

  const {
    data: driverDetail,
    isLoading: isLoadingDetail,
    mutate: mutateDetail,
  } = useSWR<DriverDetailData>(
    companyId && selectedDriverId && view === "detail"
      ? [`/api/monitoring/drivers/${selectedDriverId}`, companyId]
      : null,
    ([url, cId]: [string, string]) => fetcher(url, cId),
    { revalidateOnFocus: false },
  );

  const { data: workflowStates = [] } = useSWR<WorkflowState[]>(
    companyId
      ? [`/api/companies/${companyId}/workflow-states`, companyId]
      : null,
    ([url, cId]: [string, string]) => fetcher(url, cId),
    { revalidateOnFocus: false },
  );

  const { data: rawFieldDefs = [] } = useSWR<FieldDefinition[]>(
    companyId
      ? [
          `/api/companies/${companyId}/field-definitions?entity=route_stops`,
          companyId,
        ]
      : null,
    ([url, cId]: [string, string]) => fetcher(url, cId),
    { revalidateOnFocus: false },
  );

  const routeStopFieldDefinitions: FieldDefinition[] = rawFieldDefs.filter(
    (f) => f.active,
  );
  const fieldDefinitionLabels: Record<string, string> = Object.fromEntries(
    routeStopFieldDefinitions.map((f) => [f.code, f.label]),
  );

  const alertsCount = monitoringData?.metrics?.activeAlerts ?? 0;
  const isLoading = isLoadingMonitoring && !monitoringData;
  const error = monitoringError?.message ?? null;

  const handleDriverClick = (driverId: string) => {
    setSelectedDriverId(driverId);
    setView("detail");
  };

  const handleBackToOverview = () => {
    setView("overview");
    setSelectedDriverId(null);
  };

  const handleRefresh = () => {
    mutateMonitoring();
    mutateDrivers();
  };

  // Push-driven revalidation. The 10s SWR poll stays as a safety net
  // (network drops, SSE disconnects), but every server-side stop
  // transition lands here within ~50ms so the dashboard reflects
  // completions/failures effectively in realtime instead of waiting
  // for the next polling tick.
  //
  // Driver-location events fire much more often (every 20s per active
  // driver) so we only revalidate the driver list — the summary
  // counters don't change with a position ping. SWR's
  // `dedupingInterval: 2000` keeps multiple drivers reporting in
  // quick succession from causing a refetch storm.
  const handleStreamEvent = useCallback(
    (kind: string) => {
      if (kind === "driver.location") {
        mutateDrivers();
        if (view === "detail") mutateDetail();
      } else {
        mutateMonitoring();
        mutateDrivers();
        if (view === "detail") mutateDetail();
      }
      setLastUpdate(new Date());
    },
    [mutateMonitoring, mutateDrivers, mutateDetail, view],
  );
  useMonitoringStream(companyId, handleStreamEvent);

  const handleDetailRefresh = () => {
    mutateDetail();
    mutateDrivers();
    mutateMonitoring();
  };

  const toggleVehicleId = (id: string) => {
    setSelectedVehicleIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
  };

  const formatLastUpdate = (date: Date) => date.toLocaleTimeString();

  const getWorkflowLabel = (systemState: string) => {
    const wf = workflowStates.find((s) => s.systemState === systemState);
    return wf?.label || systemState;
  };

  const getWorkflowColor = (systemState: string) => {
    const wf = workflowStates.find((s) => s.systemState === systemState);
    return wf?.color || "#6B7280";
  };

  const state: MonitoringState = {
    monitoringData,
    driversData,
    driverDetail,
    selectedDriverId,
    selectedJobId,
    selectedVehicleIds,
    confirmedPlans,
    isLoadingPlans,
    view,
    showAlerts,
    isLoading,
    isLoadingDrivers,
    isLoadingDetail,
    error,
    alertsCount,
    lastUpdate,
    workflowStates,
    fieldDefinitionLabels,
    routeStopFieldDefinitions,
  };

  const actions: MonitoringActions = {
    handleDriverClick,
    handleBackToOverview,
    handleRefresh,
    handleDetailRefresh,
    setShowAlerts,
    setSelectedJobId: (jobId: string | null) => {
      setSelectedJobId(jobId);
      setSelectedVehicleIds([]); // Reset vehicle filter when switching plans
    },
    setSelectedVehicleIds,
    toggleVehicleId,
    formatLastUpdate,
    getWorkflowLabel,
    getWorkflowColor,
  };

  const meta: MonitoringMeta = {
    companyId,
    isReady,
    isSystemAdmin,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    authCompanyId,
  };

  return (
    <MonitoringContext value={{ state, actions, meta }}>
      {children}
    </MonitoringContext>
  );
}

export function useMonitoring(): MonitoringContextValue {
  const context = use(MonitoringContext);
  if (context === undefined) {
    throw new Error("useMonitoring must be used within a MonitoringProvider");
  }
  return context;
}
