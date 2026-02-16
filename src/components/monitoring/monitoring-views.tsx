"use client";

import { AlertCircle, Bell, ChevronLeft, ChevronRight, History, Loader2, MapPin, RefreshCw, Search, Users, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useState, useMemo, useRef, useCallback } from "react";
import { AlertPanel } from "@/components/alerts/alert-panel";
import { DriverListItem } from "./driver-list-item";
import { DriverRouteDetail } from "./driver-route-detail";
import { RecentEventsPanel } from "./recent-events-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useMonitoring } from "./monitoring-context";

// Map ref type for flyTo
export interface MapRef {
  flyTo: (lat: number, lng: number, zoom?: number) => void;
}

const MonitoringMap = dynamic(() => import("./monitoring-map").then((mod) => mod.MonitoringMap), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-muted animate-pulse flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  ),
});

export function MonitoringDashboardView() {
  const { state, actions, meta } = useMonitoring();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [showEvents, setShowEvents] = useState(false);
  const mapRef = useRef<MapRef | null>(null);

  // Filter drivers based on search and status
  const filteredDrivers = useMemo(() => {
    return state.driversData.filter((driver) => {
      const matchesSearch = searchQuery === "" ||
        driver.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        driver.vehiclePlate?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === null || driver.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [state.driversData, searchQuery, statusFilter]);

  // Get unique statuses for filter
  const availableStatuses = useMemo(() => {
    const statuses = new Set(state.driversData.map(d => d.status));
    return Array.from(statuses);
  }, [state.driversData]);

  // Status labels in Spanish
  const statusLabels: Record<string, string> = {
    IN_ROUTE: "En Ruta",
    AVAILABLE: "Disponible",
    ON_PAUSE: "En Pausa",
    OFF_DUTY: "Fuera de Servicio",
    BUSY: "Ocupado",
  };

  // Handle locate on map
  const handleLocateOnMap = useCallback((lat: number, lng: number) => {
    mapRef.current?.flyTo(lat, lng, 16);
  }, []);

  if (state.error && !state.monitoringData) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md">
          <CardContent className="py-8 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-lg font-semibold mb-2">Error al cargar los datos</h2>
            <p className="text-muted-foreground mb-4">{state.error}</p>
            <Button onClick={() => window.location.reload()}>Reintentar</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Detail view
  if (state.view === "detail") {
    return (
      <div className="h-screen overflow-auto bg-background">
        <div className="container mx-auto py-6 px-4">
          {state.isLoadingDetail ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : state.driverDetail ? (
            <DriverRouteDetail
              driver={state.driverDetail.driver}
              route={state.driverDetail.route}
              onClose={actions.handleBackToOverview}
              onRefresh={actions.handleDetailRefresh}
            />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Error al cargar los detalles del conductor
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  // Overview - Fullscreen map with floating sidebar
  return (
    <div className="h-screen w-full relative overflow-hidden">
      {/* Top Bar - Floating */}
      <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between gap-4">
        {/* Left side - Title and metrics */}
        <div className="flex items-center gap-3">
          <div className="bg-background/95 backdrop-blur-sm rounded-lg shadow-lg px-4 py-2 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              <span className="font-semibold">Monitoreo</span>
            </div>

            {state.monitoringData && (
              <>
                <div className="h-6 w-px bg-border" />
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-muted-foreground">En ruta:</span>
                    <span className="font-medium">{state.monitoringData.metrics.driversInRoute}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-muted-foreground">Disponibles:</span>
                    <span className="font-medium">{state.monitoringData.metrics.driversAvailable}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-muted-foreground">Paradas:</span>
                    <span className="font-medium">
                      {state.monitoringData.metrics.completedStops}/{state.monitoringData.metrics.totalStops}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center gap-2">
          <div className="bg-background/95 backdrop-blur-sm rounded-lg shadow-lg px-2 py-1 flex items-center gap-2">
            <Badge variant="outline" className="text-xs bg-background">
              <RefreshCw className="w-3 h-3 mr-1" />
              {actions.formatLastUpdate(state.lastUpdate)}
            </Badge>

            <Button variant="ghost" size="sm" onClick={actions.handleRefresh} className="h-8">
              <RefreshCw className="w-4 h-4" />
            </Button>

            {/* Events toggle */}
            <Button
              variant={showEvents ? "default" : "ghost"}
              size="sm"
              onClick={() => {
                setShowEvents(!showEvents);
                if (!showEvents) actions.setShowAlerts(false);
              }}
              className="h-8"
            >
              <History className="w-4 h-4" />
            </Button>

            {/* Alerts toggle */}
            <Button
              variant={state.alertsCount > 0 ? "destructive" : "ghost"}
              size="sm"
              onClick={() => {
                actions.setShowAlerts(!state.showAlerts);
                if (!state.showAlerts) setShowEvents(false);
              }}
              className="h-8"
            >
              <Bell className="w-4 h-4" />
              {state.alertsCount > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5 min-w-[18px] h-5 text-xs">
                  {state.alertsCount}
                </Badge>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Sidebar - Floating Left */}
      <div
        className={cn(
          "absolute top-20 bottom-4 left-4 z-10 transition-all duration-300 ease-in-out",
          sidebarCollapsed ? "w-12" : "w-80"
        )}
      >
        <Card className="h-full flex flex-col bg-background/95 backdrop-blur-sm shadow-lg">
          {/* Sidebar Header */}
          <div className="flex items-center justify-between p-3 border-b">
            {!sidebarCollapsed && (
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium text-sm">Conductores</span>
                <Badge variant="secondary" className="text-xs">
                  {filteredDrivers.length}
                </Badge>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </Button>
          </div>

          {!sidebarCollapsed && (
            <>
              {/* Search and Filters */}
              <div className="p-3 space-y-2 border-b">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar conductor..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                      onClick={() => setSearchQuery("")}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>

                {/* Status filter chips */}
                <div className="flex flex-wrap gap-1">
                  <Badge
                    variant={statusFilter === null ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => setStatusFilter(null)}
                  >
                    Todos
                  </Badge>
                  {availableStatuses.map((status) => (
                    <Badge
                      key={status}
                      variant={statusFilter === status ? "default" : "outline"}
                      className="cursor-pointer text-xs"
                      onClick={() => setStatusFilter(statusFilter === status ? null : status)}
                    >
                      {statusLabels[status] || status}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Driver List */}
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-2">
                  {state.isLoadingDrivers ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredDrivers.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      {searchQuery || statusFilter ? "Sin resultados" : "Sin conductores"}
                    </div>
                  ) : (
                    filteredDrivers.map((driver) => (
                      <DriverListItem
                        key={driver.id}
                        id={driver.id}
                        name={driver.name}
                        status={driver.status}
                        fleetName={driver.fleetName}
                        fleetNames={driver.fleetNames}
                        hasRoute={driver.hasRoute}
                        vehiclePlate={driver.vehiclePlate}
                        progress={driver.progress}
                        alerts={driver.alerts}
                        isSelected={state.selectedDriverId === driver.id}
                        onClick={() => actions.handleDriverClick(driver.id)}
                        compact
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </>
          )}

          {/* Collapsed state - just icons */}
          {sidebarCollapsed && (
            <div className="flex-1 flex flex-col items-center py-4 gap-2">
              <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                <span className="text-xs font-medium text-green-600">
                  {state.monitoringData?.metrics.driversInRoute || 0}
                </span>
              </div>
              <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                <span className="text-xs font-medium text-blue-600">
                  {state.monitoringData?.metrics.driversAvailable || 0}
                </span>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Right Panel - Events or Alerts */}
      {(showEvents || state.showAlerts) && meta.companyId && (
        <div className="absolute top-20 bottom-4 right-4 w-80 z-10">
          <Card className="h-full bg-background/95 backdrop-blur-sm shadow-lg overflow-hidden">
            {showEvents ? (
              <RecentEventsPanel
                companyId={meta.companyId}
                onLocateOnMap={handleLocateOnMap}
              />
            ) : (
              <AlertPanel companyId={meta.companyId} />
            )}
          </Card>
        </div>
      )}

      {/* Map - Full screen background */}
      <div className="absolute inset-0">
        <MonitoringMap
          ref={mapRef}
          jobId={state.monitoringData?.jobId || null}
          companyId={meta.companyId!}
          selectedDriverId={state.selectedDriverId}
          onDriverSelect={actions.handleDriverClick}
        />
      </div>
    </div>
  );
}
