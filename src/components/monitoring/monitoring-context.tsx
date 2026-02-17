"use client";

import { createContext, use, useCallback, useState, type ReactNode } from "react";
import useSWR from "swr";
import { useCompanyContext } from "@/hooks/use-company-context";

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
    fleets?: Array<{ id: string; name: string; type: string; isPrimary: boolean }>;
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

export interface MonitoringState {
  monitoringData: MonitoringData | undefined;
  driversData: DriverMonitoringData[];
  driverDetail: DriverDetailData | undefined;
  selectedDriverId: string | null;
  view: "overview" | "detail";
  showAlerts: boolean;
  isLoading: boolean;
  isLoadingDrivers: boolean;
  isLoadingDetail: boolean;
  error: string | null;
  alertsCount: number;
  lastUpdate: Date;
  workflowStates: WorkflowState[];
}

export interface MonitoringActions {
  handleDriverClick: (driverId: string) => void;
  handleBackToOverview: () => void;
  handleRefresh: () => void;
  handleDetailRefresh: () => void;
  setShowAlerts: (show: boolean) => void;
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

const MonitoringContext = createContext<MonitoringContextValue | undefined>(undefined);

export function MonitoringProvider({ children }: { children: ReactNode }) {
  const { effectiveCompanyId: companyId, isReady, isSystemAdmin, companies, selectedCompanyId, setSelectedCompanyId, authCompanyId } =
    useCompanyContext();

  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [view, setView] = useState<"overview" | "detail">("overview");
  const [showAlerts, setShowAlerts] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const {
    data: monitoringData,
    error: monitoringError,
    isLoading: isLoadingMonitoring,
    mutate: mutateMonitoring,
  } = useSWR<MonitoringData>(
    companyId ? ["/api/monitoring/summary", companyId] : null,
    ([url, cId]: [string, string]) => fetcher(url, cId),
    { refreshInterval: POLLING_INTERVAL, revalidateOnFocus: true, dedupingInterval: 2000, onSuccess: () => setLastUpdate(new Date()) }
  );

  const {
    data: driversData = [],
    isLoading: isLoadingDrivers,
    mutate: mutateDrivers,
  } = useSWR<DriverMonitoringData[]>(
    companyId ? ["/api/monitoring/drivers", companyId] : null,
    ([url, cId]: [string, string]) => fetcher(url, cId),
    { refreshInterval: POLLING_INTERVAL, revalidateOnFocus: true, dedupingInterval: 2000, onSuccess: () => setLastUpdate(new Date()) }
  );

  const {
    data: driverDetail,
    isLoading: isLoadingDetail,
    mutate: mutateDetail,
  } = useSWR<DriverDetailData>(
    companyId && selectedDriverId && view === "detail" ? [`/api/monitoring/drivers/${selectedDriverId}`, companyId] : null,
    ([url, cId]: [string, string]) => fetcher(url, cId),
    { revalidateOnFocus: false }
  );

  const { data: workflowStates = [] } = useSWR<WorkflowState[]>(
    companyId ? [`/api/companies/${companyId}/workflow-states`, companyId] : null,
    ([url, cId]: [string, string]) => fetcher(url, cId),
    { revalidateOnFocus: false }
  );

  const alertsCount = monitoringData?.metrics?.activeAlerts ?? 0;
  const isLoading = isLoadingMonitoring && !monitoringData;
  const error = monitoringError?.message ?? null;

  const handleDriverClick = useCallback((driverId: string) => {
    setSelectedDriverId(driverId);
    setView("detail");
  }, []);

  const handleBackToOverview = useCallback(() => {
    setView("overview");
    setSelectedDriverId(null);
  }, []);

  const handleRefresh = useCallback(() => {
    mutateMonitoring();
    mutateDrivers();
  }, [mutateMonitoring, mutateDrivers]);

  const handleDetailRefresh = useCallback(() => {
    mutateDetail();
    mutateDrivers();
    mutateMonitoring();
  }, [mutateDetail, mutateDrivers, mutateMonitoring]);

  const formatLastUpdate = useCallback((date: Date) => date.toLocaleTimeString(), []);

  const getWorkflowLabel = useCallback((systemState: string) => {
    const wf = workflowStates.find(s => s.systemState === systemState);
    return wf?.label || systemState;
  }, [workflowStates]);

  const getWorkflowColor = useCallback((systemState: string) => {
    const wf = workflowStates.find(s => s.systemState === systemState);
    return wf?.color || "#6B7280";
  }, [workflowStates]);

  const state: MonitoringState = {
    monitoringData,
    driversData,
    driverDetail,
    selectedDriverId,
    view,
    showAlerts,
    isLoading,
    isLoadingDrivers,
    isLoadingDetail,
    error,
    alertsCount,
    lastUpdate,
    workflowStates,
  };

  const actions: MonitoringActions = {
    handleDriverClick,
    handleBackToOverview,
    handleRefresh,
    handleDetailRefresh,
    setShowAlerts,
    formatLastUpdate,
    getWorkflowLabel,
    getWorkflowColor,
  };

  const meta: MonitoringMeta = { companyId, isReady, isSystemAdmin, companies, selectedCompanyId, setSelectedCompanyId, authCompanyId };

  return <MonitoringContext value={{ state, actions, meta }}>{children}</MonitoringContext>;
}

export function useMonitoring(): MonitoringContextValue {
  const context = use(MonitoringContext);
  if (context === undefined) {
    throw new Error("useMonitoring must be used within a MonitoringProvider");
  }
  return context;
}
