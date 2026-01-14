"use client";

import { AlertCircle, Bell, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AlertPanel } from "@/components/alerts/alert-panel";
import { DriverListItem } from "@/components/monitoring/driver-list-item";
import { DriverRouteDetail } from "@/components/monitoring/driver-route-detail";
import { MonitoringMap } from "@/components/monitoring/monitoring-map";
import { MonitoringMetrics } from "@/components/monitoring/monitoring-metrics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";

const POLLING_INTERVAL = 10000; // 10 seconds

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

export default function MonitoringPage() {
  const { companyId, isLoading: isAuthLoading } = useAuth();
  const [monitoringData, setMonitoringData] = useState<MonitoringData | null>(
    null,
  );
  const [driversData, setDriversData] = useState<DriverMonitoringData[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [driverDetail, setDriverDetail] = useState<DriverDetailData | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDrivers, setIsLoadingDrivers] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"overview" | "detail">("overview");
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [showAlerts, setShowAlerts] = useState(false);
  const [alertsCount, setAlertsCount] = useState(0);

  const fetchMonitoringData = useCallback(async () => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/monitoring/summary", {
        headers: { "x-company-id": companyId },
      });

      if (!response.ok) throw new Error("Failed to fetch monitoring data");

      const result = await response.json();
      setMonitoringData(result.data);
      setAlertsCount(result.data.metrics.activeAlerts);
      setLastUpdate(new Date());
    } catch (err) {
      console.error("Error fetching monitoring data:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch monitoring data",
      );
    }
  }, [companyId]);

  const fetchDriversData = useCallback(async () => {
    if (!companyId) return;
    setIsLoadingDrivers(true);
    try {
      const response = await fetch("/api/monitoring/drivers", {
        headers: { "x-company-id": companyId },
      });

      if (!response.ok) throw new Error("Failed to fetch drivers data");

      const result = await response.json();
      setDriversData(result.data);
    } catch (err) {
      console.error("Error fetching drivers data:", err);
    } finally {
      setIsLoadingDrivers(false);
    }
  }, [companyId]);

  const fetchDriverDetail = useCallback(
    async (driverId: string) => {
      if (!companyId) return;
      setIsLoadingDetail(true);
      try {
        const response = await fetch(`/api/monitoring/drivers/${driverId}`, {
          headers: { "x-company-id": companyId },
        });

        if (!response.ok) throw new Error("Failed to fetch driver detail");

        const result = await response.json();
        setDriverDetail(result.data);
        setView("detail");
      } catch (err) {
        console.error("Error fetching driver detail:", err);
      } finally {
        setIsLoadingDetail(false);
      }
    },
    [companyId],
  );

  // Initial load
  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      setError(null);
      await Promise.all([fetchMonitoringData(), fetchDriversData()]);
      setIsLoading(false);
    };

    loadInitialData();
  }, [fetchMonitoringData, fetchDriversData]);

  // Set up polling for real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMonitoringData();
      fetchDriversData();
    }, POLLING_INTERVAL);

    return () => clearInterval(interval);
  }, [fetchMonitoringData, fetchDriversData]);

  // Refresh detail if in detail view
  useEffect(() => {
    if (view === "detail" && selectedDriverId) {
      fetchDriverDetail(selectedDriverId);
    }
  }, [view, selectedDriverId, fetchDriverDetail]);

  const handleDriverClick = (driverId: string) => {
    setSelectedDriverId(driverId);
    fetchDriverDetail(driverId);
  };

  const handleBackToOverview = () => {
    setView("overview");
    setSelectedDriverId(null);
    setDriverDetail(null);
  };

  const formatLastUpdate = (date: Date) => {
    return date.toLocaleTimeString();
  };

  if (isAuthLoading || !companyId || isLoading) {
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
          <Badge variant="outline" className="text-sm">
            <RefreshCw className="w-3 h-3 mr-1" />
            Updated: {formatLastUpdate(lastUpdate)}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchMonitoringData();
              fetchDriversData();
            }}
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
