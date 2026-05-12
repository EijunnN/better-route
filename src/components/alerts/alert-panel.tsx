"use client";

import {
  AlertCircle,
  AlertTriangle,
  Filter,
  Info,
  RefreshCw,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { type Alert, AlertItem } from "./alert-item";

interface AlertPanelProps {
  companyId: string;
  onAlertClick?: (alert: Alert) => void;
}

export function AlertPanel({ companyId, onAlertClick }: AlertPanelProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filteredAlerts, setFilteredAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "all" | "critical" | "warning" | "info"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ACTIVE" | "ACKNOWLEDGED" | "all"
  >("ACTIVE");
  const { toast } = useToast();

  const fetchAlerts = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/alerts?status=${statusFilter}&limit=50`,
        {
          headers: {
            "x-company-id": companyId,
          },
        },
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
    if (companyId) {
      fetchAlerts();
    }
  }, [companyId, fetchAlerts]);

  // Filter alerts
  useEffect(() => {
    let filtered = [...alerts];

    // Filter by severity tab
    if (activeTab !== "all") {
      filtered = filtered.filter((a) => a.severity === activeTab.toUpperCase());
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.title.toLowerCase().includes(query) ||
          a.description?.toLowerCase().includes(query) ||
          a.type.toLowerCase().includes(query),
      );
    }

    setFilteredAlerts(filtered);
  }, [alerts, activeTab, searchQuery]);

  // Get counts
  const criticalCount = alerts.filter(
    (a) => a.severity === "CRITICAL" && a.status === "ACTIVE",
  ).length;
  const warningCount = alerts.filter(
    (a) => a.severity === "WARNING" && a.status === "ACTIVE",
  ).length;
  const infoCount = alerts.filter(
    (a) => a.severity === "INFO" && a.status === "ACTIVE",
  ).length;

  // Handle acknowledge
  const handleAcknowledge = async (alertId: string, note?: string) => {
    try {
      const response = await fetch(`/api/alerts/${alertId}/acknowledge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId,
        },
        body: JSON.stringify({ note }),
      });

      if (!response.ok) throw new Error("Failed to acknowledge alert");

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

  // Handle dismiss
  const handleDismiss = async (alertId: string, note?: string) => {
    try {
      const response = await fetch(`/api/alerts/${alertId}/dismiss`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId,
        },
        body: JSON.stringify({ note }),
      });

      if (!response.ok) throw new Error("Failed to dismiss alert");

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

  return (
    <Card className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-500" />
            <h2 className="text-lg font-semibold">Alertas</h2>
            {criticalCount > 0 && (
              <Badge variant="destructive" className="ml-2">
                {criticalCount} crítica{criticalCount === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchAlerts}
            disabled={isLoading}
          >
            <RefreshCw
              className={`size-4 ${isLoading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Buscar alertas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="size-4 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v: "ACTIVE" | "ACKNOWLEDGED" | "all") =>
              setStatusFilter(v)
            }
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Activas</SelectItem>
              <SelectItem value="ACKNOWLEDGED">Reconocidas</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) =>
          setActiveTab(v as "all" | "critical" | "warning" | "info")
        }
        className="flex-1 flex flex-col"
      >
        <div className="px-4 pt-2">
          <TabsList className="w-full">
            <TabsTrigger value="all" className="flex-1">
              Todas ({filteredAlerts.length})
            </TabsTrigger>
            <TabsTrigger value="critical" className="flex-1">
              <AlertTriangle className="size-4 mr-1" />
              Crítica ({criticalCount})
            </TabsTrigger>
            <TabsTrigger value="warning" className="flex-1">
              <AlertCircle className="size-4 mr-1" />
              Advertencia ({warningCount})
            </TabsTrigger>
            <TabsTrigger value="info" className="flex-1">
              <Info className="size-4 mr-1" />
              Info ({infoCount})
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Alert List */}
        <TabsContent value={activeTab} className="flex-1 overflow-auto p-4 m-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <RefreshCw className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <AlertTriangle className="size-12 mb-4 opacity-50" />
              <p className="font-medium">No hay alertas</p>
              <p className="text-sm">
                {searchQuery
                  ? "Prueba ajustar la búsqueda o los filtros"
                  : "No hay alertas activas en este momento"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAlerts.map((alert) => (
                <AlertItem
                  key={alert.id}
                  alert={alert}
                  onAcknowledge={handleAcknowledge}
                  onDismiss={handleDismiss}
                  onClick={() => onAlertClick?.(alert)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </Card>
  );
}
