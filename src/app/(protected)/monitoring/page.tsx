"use client";

import { AlertCircle, Bell, Loader2, RefreshCw } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import useSWR from "swr";
import { ProtectedPage } from "@/components/auth/protected-page";
import { AlertPanel } from "@/components/alerts/alert-panel";
import { DriverListItem } from "@/components/monitoring/driver-list-item";
import { DriverRouteDetail } from "@/components/monitoring/driver-route-detail";
import { MonitoringMetrics } from "@/components/monitoring/monitoring-metrics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCompanyContext } from "@/hooks/use-company-context";
import { CompanySelector } from "@/components/company-selector";

// Dynamic import for heavy map component (bundle-dynamic-imports rule)
const MonitoringMap = dynamic(
  () => import("@/components/monitoring/monitoring-map").then((mod) => mod.MonitoringMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-full bg-muted animate-pulse rounded-lg flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

const POLLING_INTERVAL = 10000; // 10 seconds

// SWR fetcher with company header
const fetcher = async (url: string, companyId: string) => {
  const response = await fetch(url, {
    headers: { "x-company-id": companyId },
  });
  if (!response.ok) throw new Error("Failed to fetch");
  const result = await response.json();
  return result.data;
};

interface MonitoringData {
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

interface DriverMonitoringData {
  id: string;
  name: string;
  status: string;
  fleetId: string;
  fleetName: string;
  hasRoute: boolean;
  routeId: string | null;
  vehiclePlate: string | null;
  progress: {
    completedStops: number;
    totalStops: number;
    percentage: number;
  };
  alerts: string[];
}

interface DriverDetailData {
  driver: {
    id: string;
    name: string;
    status: string;
    identification: string;
    email: string;
    phone?: string;
    fleet: {
      id: string;
      name: string;
      type: string;
    };
  };
  route: {
    routeId: string;
    jobId?: string;
    vehicle: {
      id: string;
      plate: string;
      brand: string;
      model: string;
    };
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
    }>;
    assignmentQuality?: {
      score: number;
      warnings: string[];
      errors: string[];
    };
  } | null;
}

function MonitoringPageContent() {
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
  const [view, setView] = useState<"overview" | "detail">("overview");
  const [showAlerts, setShowAlerts] = useState(false);

  // SWR for monitoring summary with automatic polling
  const {
    data: monitoringData,
    error: monitoringError,
    isLoading: isLoadingMonitoring,
    mutate: mutateMonitoring,
  } = useSWR<MonitoringData>(
    companyId ? ["/api/monitoring/summary", companyId] : null,
    ([url, cId]: [string, string]) => fetcher(url, cId),
    {
      refreshInterval: POLLING_INTERVAL,
      revalidateOnFocus: true,
      dedupingInterval: 2000,
    }
  );

  // SWR for drivers list with automatic polling
  const {
    data: driversData = [],
    isLoading: isLoadingDrivers,
    mutate: mutateDrivers,
  } = useSWR<DriverMonitoringData[]>(
    companyId ? ["/api/monitoring/drivers", companyId] : null,
    ([url, cId]: [string, string]) => fetcher(url, cId),
    {
      refreshInterval: POLLING_INTERVAL,
      revalidateOnFocus: true,
      dedupingInterval: 2000,
    }
  );

  // SWR for driver detail (only fetched when selected)
  const {
    data: driverDetail,
    isLoading: isLoadingDetail,
  } = useSWR<DriverDetailData>(
    companyId && selectedDriverId && view === "detail"
      ? [`/api/monitoring/drivers/${selectedDriverId}`, companyId]
      : null,
    ([url, cId]: [string, string]) => fetcher(url, cId),
    {
      revalidateOnFocus: false,
    }
  );

  const alertsCount = monitoringData?.metrics?.activeAlerts ?? 0;
  const lastUpdate = new Date();
  const isLoading = isLoadingMonitoring && !monitoringData;
  const error = monitoringError?.message ?? null;

  // Memoized handler to prevent DriverListItem re-renders
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

  const formatLastUpdate = (date: Date) => {
    return date.toLocaleTimeString();
  };

  if (!isReady || isLoading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error && !monitoringData) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card>
          <CardContent className="py-8 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-lg font-semibold mb-2">
              Failed to load monitoring data
            </h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Monitoring Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Real-time tracking of drivers and route execution
          </p>
        </div>
        <div className="flex items-center gap-3">
          <CompanySelector
            companies={companies}
            selectedCompanyId={selectedCompanyId}
            authCompanyId={authCompanyId}
            onCompanyChange={setSelectedCompanyId}
            isSystemAdmin={isSystemAdmin}
          />
          <Badge variant="outline" className="text-sm">
            <RefreshCw className="w-3 h-3 mr-1" />
            Updated: {formatLastUpdate(lastUpdate)}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant={alertsCount > 0 ? "destructive" : "outline"}
            size="sm"
            onClick={() => setShowAlerts(!showAlerts)}
          >
            <Bell className="w-4 h-4 mr-2" />
            Alerts
            {alertsCount > 0 && (
              <Badge variant="secondary" className="ml-2 px-1.5 min-w-[20px]">
                {alertsCount}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {view === "overview" ? (
        <>
          {/* Metrics */}
          {monitoringData && (
            <MonitoringMetrics metrics={monitoringData.metrics} />
          )}

          {/* Main Content: Map, Driver List, and Alerts */}
          <div
            className={`grid gap-6 mt-6 ${showAlerts ? "grid-cols-1 lg:grid-cols-4" : "grid-cols-1 lg:grid-cols-3"}`}
          >
            {/* Map - takes 2 columns (or 2 of 4 when alerts open) */}
            <div className={showAlerts ? "lg:col-span-2" : "lg:col-span-2"}>
              <div className="h-[500px]">
                <MonitoringMap
                  jobId={monitoringData?.jobId || null}
                  selectedDriverId={selectedDriverId}
                  onDriverSelect={handleDriverClick}
                />
              </div>
            </div>

            {/* Driver List - takes 1 column */}
            <Card className="h-[500px] flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Drivers</CardTitle>
              </CardHeader>
              <CardContent className="p-0 flex-1 overflow-hidden">
                <ScrollArea className="h-full px-6">
                  <div className="space-y-3 pb-4">
                    {isLoadingDrivers ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : driversData.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No drivers found
                      </div>
                    ) : (
                      driversData.map((driver) => (
                        <DriverListItem
                          key={driver.id}
                          id={driver.id}
                          name={driver.name}
                          status={driver.status}
                          fleetName={driver.fleetName}
                          hasRoute={driver.hasRoute}
                          vehiclePlate={driver.vehiclePlate}
                          progress={driver.progress}
                          alerts={driver.alerts}
                          onClick={() => handleDriverClick(driver.id)}
                        />
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Alerts Panel - shown when toggle is active */}
            {showAlerts && companyId && (
              <div className="lg:col-span-1">
                <div className="h-[500px]">
                  <AlertPanel companyId={companyId} />
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Detail View */}
          {isLoadingDetail ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : driverDetail ? (
            <DriverRouteDetail
              driver={driverDetail.driver}
              route={driverDetail.route}
              onClose={handleBackToOverview}
            />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Failed to load driver details
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default function MonitoringPage() {
  return (
    <ProtectedPage requiredPermission="monitoring:VIEW">
      <MonitoringPageContent />
    </ProtectedPage>
  );
}
