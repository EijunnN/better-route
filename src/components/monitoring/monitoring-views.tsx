"use client";

import {
  AlertCircle,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  History,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { AlertPanel } from "@/components/alerts/alert-panel";
import { Can } from "@/components/auth/can";
import { ChatPanel, useChat } from "@/components/chat";
import { useFullScreenLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { DriverListItem } from "./driver-list-item";
import { DriverRouteDetail } from "./driver-route-detail";
import { useMonitoring } from "./monitoring-context";
import { RecentEventsPanel } from "./recent-events-panel";

// Map ref type for flyTo
export interface MapRef {
  flyTo: (lat: number, lng: number, zoom?: number) => void;
}

const MonitoringMap = dynamic(
  () => import("./monitoring-map").then((mod) => mod.MonitoringMap),
  {
    ssr: false,
    loading: () => (
      <div className="size-full bg-muted animate-pulse flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

// Status labels — kept here because the sidebar filter chips translate
// them to Spanish independently of the per-driver status pill (which
// has its own labels in DriverListItem).
const STATUS_LABELS: Record<string, string> = {
  IN_ROUTE: "En ruta",
  AVAILABLE: "Disponible",
  ON_PAUSE: "En pausa",
  ASSIGNED: "Asignado",
  COMPLETED: "Completado",
  UNAVAILABLE: "Inactivo",
  ABSENT: "Ausente",
};

export function MonitoringDashboardView() {
  // Full-bleed: sin esto el AppShell envuelve la vista con márgenes + padding
  // y el `h-screen` de abajo desborda el main → scrollbar vertical fantasma.
  useFullScreenLayout();

  const { state, actions, meta } = useMonitoring();
  const { state: chatState, meta: chatMeta, actions: chatActions } = useChat();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [showEvents, setShowEvents] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const mapRef = useRef<MapRef | null>(null);

  const filteredDrivers = state.driversData.filter((driver) => {
    const matchesSearch =
      searchQuery === "" ||
      driver.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      driver.vehiclePlate?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === null || driver.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const availableStatuses = Array.from(
    new Set(state.driversData.map((d) => d.status)),
  );

  const vehiclesWithRoutes = (() => {
    const seen = new Set<string>();
    const out: Array<{ id: string; plate: string }> = [];
    for (const d of state.driversData) {
      if (!d.hasRoute || !d.vehicleId || !d.vehiclePlate) continue;
      if (seen.has(d.vehicleId)) continue;
      seen.add(d.vehicleId);
      out.push({ id: d.vehicleId, plate: d.vehiclePlate });
    }
    return out;
  })();

  const handleLocateOnMap = (lat: number, lng: number) => {
    mapRef.current?.flyTo(lat, lng, 16);
  };

  // The right-panel slot is shared by detail / events / alerts / chat.
  // Opening one closes the others — they're mutually exclusive surfaces
  // around the same screen real estate.
  const openEvents = () => {
    setShowEvents(true);
    actions.setShowAlerts(false);
    chatActions.closePanel();
  };
  const openAlerts = () => {
    actions.setShowAlerts(true);
    setShowEvents(false);
    chatActions.closePanel();
  };
  const openChat = () => {
    chatActions.openPanel();
    setShowEvents(false);
    actions.setShowAlerts(false);
  };
  const handleDriverChat = (driverId: string) => {
    setShowEvents(false);
    actions.setShowAlerts(false);
    chatActions.openConversationWithPanel(driverId);
  };

  if (state.error && !state.monitoringData) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md">
          <CardContent className="py-8 text-center">
            <AlertCircle className="size-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-lg font-semibold mb-2">
              Error al cargar los datos
            </h2>
            <p className="text-muted-foreground mb-4">{state.error}</p>
            <Button onClick={() => window.location.reload()}>Reintentar</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const metrics = state.monitoringData?.metrics;
  const companyId = meta.companyId;
  const rightPanelOpen =
    state.view === "detail" ||
    ((showEvents || state.showAlerts || chatState.isPanelOpen) &&
      Boolean(companyId));

  return (
    <div className="h-screen w-full relative overflow-hidden">
      {/* ============ TOP BAR ============ */}
      <div className="absolute top-4 left-4 right-4 z-20 flex items-start justify-between gap-4 pointer-events-none">
        <div className="flex items-stretch gap-3 pointer-events-auto">
          <div className="cockpit-surface rounded-md px-3 py-2 flex items-center gap-3">
            <div className="flex items-center gap-2 pr-3 border-r border-border/60">
              <span
                role="img"
                aria-label="Sistema en línea"
                className="cockpit-led shrink-0"
              />
              <div className="flex flex-col leading-tight">
                <span className="cockpit-label">Centro de operaciones</span>
                <span className="text-sm font-semibold tracking-tight">
                  Monitoreo en vivo
                </span>
              </div>
            </div>

            <div className="relative">
              <select
                value={state.selectedJobId || ""}
                onChange={(e) =>
                  actions.setSelectedJobId(e.target.value || null)
                }
                className="appearance-none bg-background/60 border border-border/60 rounded px-2.5 py-1 pr-6 text-xs cursor-pointer hover:bg-background focus:outline-none focus:ring-1 focus:ring-[var(--cockpit-live)]/40 max-w-[200px] truncate"
              >
                <option value="">Último plan</option>
                {state.confirmedPlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.configurationName ||
                      new Date(
                        plan.completedAt || plan.createdAt,
                      ).toLocaleDateString("es-PE", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {metrics && (
            <div className="cockpit-surface rounded-md px-4 py-2 flex items-center gap-5">
              <Metric
                ledStatus="live"
                label="En ruta"
                value={metrics.driversInRoute}
              />
              <Metric
                ledStatus="idle"
                label="Disponibles"
                value={metrics.driversAvailable}
              />
              <Metric
                label="Paradas"
                value={`${metrics.completedStops}/${metrics.totalStops}`}
                hint={`${Math.round(metrics.completenessPercentage)}%`}
              />
            </div>
          )}
        </div>

        <div className="pointer-events-auto cockpit-surface rounded-md p-1 flex items-center gap-1">
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] cockpit-mono text-muted-foreground border-r border-border/60 mr-1">
            <span
              className={cn(
                "size-1.5 rounded-full",
                isRefreshing
                  ? "bg-[var(--cockpit-live)] animate-pulse"
                  : "bg-[var(--cockpit-live)]/60",
              )}
            />
            {actions.formatLastUpdate(state.lastUpdate)}
          </div>

          <ToolbarButton
            label="Actualizar"
            onClick={() => {
              setIsRefreshing(true);
              actions.handleRefresh();
              setTimeout(() => setIsRefreshing(false), 1000);
            }}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={cn("size-4", isRefreshing && "animate-spin")}
            />
          </ToolbarButton>

          <ToolbarButton
            label="Eventos"
            active={showEvents}
            onClick={() => (showEvents ? setShowEvents(false) : openEvents())}
          >
            <History className="size-4" />
          </ToolbarButton>

          <ToolbarButton
            label="Alertas"
            active={state.showAlerts}
            tone={state.alertsCount > 0 ? "danger" : "default"}
            badge={state.alertsCount > 0 ? state.alertsCount : undefined}
            onClick={() =>
              state.showAlerts ? actions.setShowAlerts(false) : openAlerts()
            }
          >
            <Bell className="size-4" />
          </ToolbarButton>

          <Can perm="chat:read">
            <ToolbarButton
              label="Mensajes"
              active={chatState.isPanelOpen}
              tone={chatMeta.totalUnread > 0 ? "live" : "default"}
              badge={
                chatMeta.totalUnread > 0 ? chatMeta.totalUnread : undefined
              }
              onClick={() =>
                chatState.isPanelOpen ? chatActions.closePanel() : openChat()
              }
            >
              <MessageSquare className="size-4" />
            </ToolbarButton>
          </Can>
        </div>
      </div>

      {/* ============ SIDEBAR ============ */}
      <div
        className={cn(
          "absolute top-24 bottom-4 left-4 z-10 transition-all duration-300 ease-out",
          sidebarCollapsed ? "w-12" : "w-80",
        )}
      >
        <div className="cockpit-surface rounded-md h-full flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/60">
            {!sidebarCollapsed && (
              <div className="flex items-center gap-2">
                <Users className="size-3.5 text-muted-foreground" />
                <span className="cockpit-label">Conductores</span>
                <span className="cockpit-mono text-[10px] text-muted-foreground tabular-nums">
                  {filteredDrivers.length}/{state.driversData.length}
                </span>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label={sidebarCollapsed ? "Expandir" : "Colapsar"}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="size-4" />
              ) : (
                <ChevronLeft className="size-4" />
              )}
            </Button>
          </div>

          {!sidebarCollapsed && (
            <>
              <div className="p-3 space-y-2.5 border-b border-border/60">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar nombre o placa…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-8 text-sm bg-background/60 border-border/60"
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 size-6"
                      onClick={() => setSearchQuery("")}
                    >
                      <X className="size-3" />
                    </Button>
                  )}
                </div>

                <FilterChips
                  selected={statusFilter}
                  options={availableStatuses.map((s) => ({
                    value: s,
                    label: STATUS_LABELS[s] || s,
                  }))}
                  onSelect={(v) =>
                    setStatusFilter((cur) => (cur === v ? null : v))
                  }
                  allLabel="Todos"
                />

                {vehiclesWithRoutes.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="cockpit-label">Vehículos</span>
                      {state.selectedVehicleIds.length > 0 && (
                        <button
                          type="button"
                          className="cockpit-label text-[var(--cockpit-live)] hover:underline"
                          onClick={() => actions.setSelectedVehicleIds([])}
                        >
                          Limpiar
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {vehiclesWithRoutes.map((v) => {
                        const on = state.selectedVehicleIds.includes(v.id);
                        return (
                          <button
                            type="button"
                            key={v.id}
                            onClick={() => actions.toggleVehicleId(v.id)}
                            className={cn(
                              "cockpit-mono text-[10px] px-1.5 py-0.5 rounded-sm border transition-colors",
                              on
                                ? "border-[var(--cockpit-live)]/50 bg-[var(--cockpit-live)]/10 text-[var(--cockpit-live)]"
                                : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
                            )}
                          >
                            {v.plate}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <ScrollArea className="flex-1">
                <div className="py-1">
                  {state.isLoadingDrivers ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredDrivers.length === 0 ? (
                    <div className="text-center py-10 px-4">
                      <p className="cockpit-label">
                        {searchQuery || statusFilter
                          ? "Sin coincidencias"
                          : "Sin conductores"}
                      </p>
                    </div>
                  ) : (
                    <div className="cockpit-divide">
                      {filteredDrivers.map((driver) => (
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
                          onChat={() => handleDriverChat(driver.id)}
                          currentLocation={driver.currentLocation}
                          compact
                        />
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </>
          )}

          {sidebarCollapsed && metrics && (
            <div className="flex-1 flex flex-col items-center pt-3 gap-2">
              <CollapsedStat
                value={metrics.driversInRoute}
                label="ruta"
                tone="live"
              />
              <CollapsedStat value={metrics.driversAvailable} label="libre" />
              {state.alertsCount > 0 && (
                <CollapsedStat
                  value={state.alertsCount}
                  label="alert"
                  tone="danger"
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* ============ RIGHT PANEL ============ */}
      {rightPanelOpen && (
        <div
          className={cn(
            "absolute top-24 bottom-4 right-4 z-10",
            state.view === "detail" ? "w-[450px]" : "w-[340px]",
          )}
        >
          <div className="cockpit-surface rounded-md h-full overflow-hidden flex flex-col">
            {state.view === "detail" ? (
              state.isLoadingDetail ? (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                </div>
              ) : state.driverDetail ? (
                <ScrollArea className="flex-1">
                  <div className="p-4">
                    <DriverRouteDetail
                      driver={state.driverDetail.driver}
                      route={state.driverDetail.route}
                      onClose={actions.handleBackToOverview}
                      onRefresh={actions.handleDetailRefresh}
                      onChat={() => {
                        const id = state.driverDetail?.driver.id;
                        if (id) handleDriverChat(id);
                      }}
                      locationData={
                        state.driversData.find(
                          (d) => d.id === state.selectedDriverId,
                        )?.currentLocation
                      }
                      deliveryPolicy={state.deliveryPolicy}
                      fieldDefinitionLabels={state.fieldDefinitionLabels}
                      customFieldDefinitions={state.routeStopFieldDefinitions}
                    />
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex-1 flex items-center justify-center px-8 text-center text-sm text-muted-foreground">
                  Error al cargar los detalles del conductor
                </div>
              )
            ) : chatState.isPanelOpen ? (
              <ChatPanel />
            ) : showEvents && companyId ? (
              <RecentEventsPanel
                companyId={companyId}
                onLocateOnMap={handleLocateOnMap}
                getWorkflowLabel={actions.getWorkflowLabel}
              />
            ) : state.showAlerts && companyId ? (
              <AlertPanel
                companyId={companyId}
                onAlertClick={(alert) => {
                  if (alert.entityType !== "STOP") return;
                  const driverId = (
                    alert.metadata as { userId?: string } | null
                  )?.userId;
                  if (driverId) actions.handleDriverClick(driverId);
                }}
              />
            ) : null}
          </div>
        </div>
      )}

      {/* ============ MAP ============ */}
      <div className="absolute inset-0">
        {companyId && (
          <MonitoringMap
            ref={mapRef}
            jobId={state.selectedJobId || state.monitoringData?.jobId || null}
            companyId={companyId}
            selectedDriverId={state.selectedDriverId}
            selectedVehicleIds={state.selectedVehicleIds}
            onDriverSelect={actions.handleDriverClick}
            refreshKey={
              state.lastUpdate instanceof Date ? state.lastUpdate.getTime() : 0
            }
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Atoms — small, local helpers so the main component reads top-down.
// ---------------------------------------------------------------------------

function Metric({
  label,
  value,
  hint,
  ledStatus,
}: {
  label: string;
  value: string | number;
  hint?: string;
  ledStatus?: "live" | "idle" | "warn" | "danger";
}) {
  return (
    <div className="flex items-center gap-2">
      {ledStatus && (
        <span
          className="cockpit-led shrink-0"
          data-status={ledStatus === "live" ? undefined : ledStatus}
          aria-hidden
        />
      )}
      <div className="flex flex-col leading-tight">
        <span className="cockpit-label">{label}</span>
        <div className="flex items-baseline gap-1.5">
          <span className="cockpit-mono text-sm font-semibold tabular-nums">
            {value}
          </span>
          {hint && (
            <span className="cockpit-mono text-[10px] text-muted-foreground tabular-nums">
              {hint}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  label,
  active,
  tone = "default",
  badge,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
  tone?: "default" | "live" | "danger";
  badge?: number;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-flex items-center justify-center h-8 px-2.5 rounded-sm text-xs font-medium",
        "transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        active && tone === "default" && "bg-muted text-foreground",
        active &&
          tone === "live" &&
          "bg-[var(--cockpit-live)]/15 text-[var(--cockpit-live)]",
        active && tone === "danger" && "bg-destructive/15 text-destructive",
        !active &&
          "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {children}
      {badge !== undefined && (
        <span
          className={cn(
            "cockpit-mono ml-1.5 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded text-[10px] font-semibold tabular-nums",
            tone === "live"
              ? "bg-[var(--cockpit-live)] text-primary-foreground"
              : tone === "danger"
                ? "bg-destructive text-destructive-foreground"
                : "bg-foreground/15 text-foreground",
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function FilterChips({
  selected,
  options,
  onSelect,
  allLabel,
}: {
  selected: string | null;
  options: { value: string; label: string }[];
  onSelect: (value: string) => void;
  allLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      <Chip active={selected === null} onClick={() => onSelect("")}>
        {allLabel}
      </Chip>
      {options.map((opt) => (
        <Chip
          key={opt.value}
          active={selected === opt.value}
          onClick={() => onSelect(opt.value)}
        >
          {opt.label}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-[11px] px-2 py-0.5 rounded-sm border transition-colors",
        active
          ? "border-[var(--cockpit-live)]/50 bg-[var(--cockpit-live)]/10 text-[var(--cockpit-live)]"
          : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function CollapsedStat({
  value,
  label,
  tone = "default",
}: {
  value: number;
  label: string;
  tone?: "live" | "default" | "danger";
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span
        className={cn(
          "cockpit-mono text-sm font-semibold tabular-nums",
          tone === "live" && "text-[var(--cockpit-live)]",
          tone === "danger" && "text-destructive",
          tone === "default" && "text-foreground",
        )}
      >
        {value}
      </span>
      <span className="cockpit-label" style={{ fontSize: "9px" }}>
        {label}
      </span>
    </div>
  );
}
