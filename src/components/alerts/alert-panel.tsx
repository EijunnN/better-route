"use client";

import { AlertTriangle, Loader2, RefreshCw, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { type Alert, AlertItem } from "./alert-item";

type SeverityKey = "all" | "critical" | "warning" | "info";
type StatusKey = "ACTIVE" | "ACKNOWLEDGED" | "all";

const SEVERITY_TABS: Array<{
  key: SeverityKey;
  label: string;
  match?: Alert["severity"];
  ledStatus?: "danger" | "warn" | "live" | "idle";
}> = [
  { key: "all", label: "Todas" },
  { key: "critical", label: "Crítica", match: "CRITICAL", ledStatus: "danger" },
  { key: "warning", label: "Advert.", match: "WARNING", ledStatus: "warn" },
  { key: "info", label: "Info", match: "INFO", ledStatus: "live" },
];

const STATUS_TABS: Array<{ key: StatusKey; label: string }> = [
  { key: "ACTIVE", label: "Activas" },
  { key: "ACKNOWLEDGED", label: "Reconocidas" },
  { key: "all", label: "Todas" },
];

interface AlertPanelProps {
  companyId: string;
  onAlertClick?: (alert: Alert) => void;
}

export function AlertPanel({ companyId, onAlertClick }: AlertPanelProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [severityTab, setSeverityTab] = useState<SeverityKey>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusKey>("ACTIVE");
  const { toast } = useToast();

  const fetchAlerts = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/alerts?status=${statusFilter}&limit=50`,
        { headers: { "x-company-id": companyId } },
      );
      if (!response.ok) throw new Error("Failed to fetch alerts");
      const result = await response.json();
      setAlerts(result.data || []);
    } catch (error) {
      console.error("Error fetching alerts:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudieron cargar las alertas",
      });
    } finally {
      setIsLoading(false);
    }
  }, [companyId, statusFilter, toast]);

  useEffect(() => {
    if (companyId) fetchAlerts();
  }, [companyId, fetchAlerts]);

  // Active-only counts so the chip labels always reflect "what would
  // wake an operator" regardless of the current status filter.
  const counts = useMemo(() => {
    const active = alerts.filter((a) => a.status === "ACTIVE");
    return {
      all: alerts.length,
      critical: active.filter((a) => a.severity === "CRITICAL").length,
      warning: active.filter((a) => a.severity === "WARNING").length,
      info: active.filter((a) => a.severity === "INFO").length,
    };
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    let out = alerts;
    if (severityTab !== "all") {
      const match = SEVERITY_TABS.find((t) => t.key === severityTab)?.match;
      if (match) out = out.filter((a) => a.severity === match);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.description?.toLowerCase().includes(q) ||
          a.type.toLowerCase().includes(q),
      );
    }
    return out;
  }, [alerts, severityTab, searchQuery]);

  const handleAcknowledge = async (alertId: string, note?: string) => {
    try {
      const res = await fetch(`/api/alerts/${alertId}/acknowledge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId,
        },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) throw new Error("Failed to acknowledge alert");
      toast({
        title: "Alerta reconocida",
        description: "La alerta fue marcada como reconocida.",
      });
      fetchAlerts();
    } catch (error) {
      console.error("Error acknowledging alert:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo reconocer la alerta",
      });
    }
  };

  const handleDismiss = async (alertId: string, note?: string) => {
    try {
      const res = await fetch(`/api/alerts/${alertId}/dismiss`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId,
        },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) throw new Error("Failed to dismiss alert");
      toast({
        title: "Alerta descartada",
        description: "La alerta fue ocultada de la lista activa.",
      });
      fetchAlerts();
    } catch (error) {
      console.error("Error dismissing alert:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo descartar la alerta",
      });
    }
  };

  const activeCount = counts.critical + counts.warning + counts.info;
  const hasCritical = counts.critical > 0;

  return (
    <div className="flex flex-col h-full">
      {/* ─── Header ─── */}
      <div className="px-3 pt-3 pb-2 shrink-0 border-b border-border/60">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <span
              role="img"
              aria-label={hasCritical ? "Alertas críticas" : "Sin críticas"}
              className="cockpit-led shrink-0"
              data-status={
                hasCritical ? "danger" : activeCount > 0 ? "warn" : "idle"
              }
            />
            <span className="cockpit-label">Alertas</span>
            {activeCount > 0 && (
              <span className="cockpit-mono text-[10px] text-muted-foreground tabular-nums">
                {activeCount} activa{activeCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={fetchAlerts}
            disabled={isLoading}
            aria-label="Recargar"
          >
            <RefreshCw
              className={cn("size-3.5", isLoading && "animate-spin")}
            />
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-2.5">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar alertas…"
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
              aria-label="Limpiar búsqueda"
            >
              <X className="size-3" />
            </Button>
          )}
        </div>

        {/* Severity chips — wrap if needed; counts always live-active. */}
        <div className="space-y-1.5">
          <span className="cockpit-label">Severidad</span>
          <div className="flex flex-wrap gap-1">
            {SEVERITY_TABS.map((tab) => {
              const count = counts[tab.key];
              const active = severityTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setSeverityTab(tab.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-sm border transition-colors",
                    active
                      ? "border-[var(--cockpit-live)]/50 bg-[var(--cockpit-live)]/10 text-[var(--cockpit-live)]"
                      : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  {tab.ledStatus && (
                    <span
                      aria-hidden
                      className="size-1.5 rounded-full shrink-0"
                      style={{
                        background:
                          tab.ledStatus === "danger"
                            ? "var(--cockpit-danger)"
                            : tab.ledStatus === "warn"
                              ? "var(--cockpit-warn)"
                              : tab.ledStatus === "live"
                                ? "var(--cockpit-live)"
                                : "transparent",
                      }}
                    />
                  )}
                  <span>{tab.label}</span>
                  <span
                    className={cn(
                      "cockpit-mono tabular-nums text-[10px]",
                      active
                        ? "text-[var(--cockpit-live)]"
                        : "text-muted-foreground/70",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Status chips — Activas / Reconocidas / Todas. Compact row. */}
        <div className="space-y-1.5 mt-2">
          <span className="cockpit-label">Estado</span>
          <div className="flex gap-1">
            {STATUS_TABS.map((tab) => {
              const active = statusFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={cn(
                    "flex-1 text-[11px] px-1.5 py-0.5 rounded-sm border transition-colors",
                    active
                      ? "border-[var(--cockpit-live)]/50 bg-[var(--cockpit-live)]/10 text-[var(--cockpit-live)]"
                      : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── List ─── */}
      <div className="flex-1 overflow-y-auto cockpit-scroll">
        {isLoading && alerts.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="size-10 rounded-full border border-border/60 flex items-center justify-center mb-3 bg-background/40">
              <AlertTriangle className="size-4 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">
              {searchQuery || severityTab !== "all"
                ? "Sin coincidencias"
                : "Todo en orden"}
            </p>
            <p className="cockpit-label mt-2 max-w-[220px]">
              {searchQuery
                ? "Ajustá los filtros o limpiá la búsqueda."
                : statusFilter === "ACTIVE"
                  ? "No hay alertas activas en este momento."
                  : "No hay alertas con este estado."}
            </p>
          </div>
        ) : (
          <ul className="cockpit-divide">
            {filteredAlerts.map((alert) => (
              <AlertItem
                key={alert.id}
                alert={alert}
                onAcknowledge={handleAcknowledge}
                onDismiss={handleDismiss}
                onClick={() => onAlertClick?.(alert)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
