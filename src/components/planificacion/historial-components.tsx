"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  Loader2,
  RotateCcw,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { useDebounce } from "@/hooks/use-debounce";
import { useHistorial, type OptimizationJob, type JobStatus } from "./historial-context";

// Status Configuration
const STATUS_CONFIG = {
  CONFIRMED: {
    label: "Confirmado",
    color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    icon: "check-circle",
  },
  COMPLETED: {
    label: "Completado",
    color: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
    icon: "check-circle",
  },
  FAILED: {
    label: "Fallido",
    color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
    icon: "x-circle",
  },
  CANCELLED: {
    label: "Cancelado",
    color: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
    icon: "x-circle",
  },
  RUNNING: {
    label: "Ejecutando",
    color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
    icon: "clock",
  },
  PENDING: {
    label: "Pendiente",
    color: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
    icon: "clock",
  },
} as const;

const STATUS_LABELS: Record<JobStatus, string> = {
  all: "Todos",
  COMPLETED: "Completados",
  CANCELLED: "Cancelados",
  FAILED: "Fallidos",
  RUNNING: "Ejecutando",
  PENDING: "Pendientes",
};

export function getStatusConfig(status: string) {
  return (
    STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? {
      label: status,
      color: "bg-gray-500/10 text-gray-700 border-gray-500/20",
      icon: "clock",
    }
  );
}

// Utility Functions
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString();
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

interface PlanMetrics {
  totalRoutes: number;
  totalStops: number;
  totalDistance: number;
  totalDuration: number;
  averageUtilizationRate: number;
  timeWindowComplianceRate: number;
  totalTimeWindowViolations: number;
  driverAssignmentCoverage: number;
  averageAssignmentQuality: number;
  assignmentsWithWarnings: number;
  assignmentsWithErrors: number;
  skillCoverage: number;
  licenseCompliance: number;
  fleetAlignment: number;
  workloadBalance: number;
  unassignedOrders: number;
  processingTimeMs: number;
}

function MetricCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "bad"
          ? "text-red-600 dark:text-red-400"
          : "text-foreground";
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function toneFromPercent(value: number, inverted = false): "good" | "warn" | "bad" {
  const v = inverted ? 100 - value : value;
  if (v >= 80) return "good";
  if (v >= 50) return "warn";
  return "bad";
}

function JobMetricsExpansion({
  jobId,
  companyId,
}: {
  jobId: string;
  companyId: string | null;
}) {
  const [metrics, setMetrics] = useState<PlanMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/optimization/jobs/${jobId}/metrics`, {
          headers: { "x-company-id": companyId },
        });
        if (!res.ok) {
          if (res.status === 404) {
            if (!cancelled) {
              setError("Métricas no disponibles (plan aún no confirmado)");
              setLoading(false);
            }
            return;
          }
          throw new Error("Error al cargar métricas");
        }
        const data = await res.json();
        if (!cancelled) {
          setMetrics(data.metrics);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error inesperado");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, companyId]);

  if (loading) {
    return (
      <div className="px-3 py-3 border-t flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        Cargando métricas...
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-3 py-2 border-t text-xs text-muted-foreground italic">
        {error}
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="px-3 pt-2 pb-3 border-t bg-muted/20 space-y-2">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 lg:grid-cols-6">
        <MetricCell label="Rutas" value={String(metrics.totalRoutes)} />
        <MetricCell label="Paradas" value={String(metrics.totalStops)} />
        <MetricCell label="Distancia" value={formatDistance(metrics.totalDistance)} />
        <MetricCell label="Duración" value={formatDuration(metrics.totalDuration)} />
        <MetricCell
          label="Utilización"
          value={formatPercent(metrics.averageUtilizationRate)}
          tone={toneFromPercent(metrics.averageUtilizationRate)}
        />
        <MetricCell
          label="Sin asignar"
          value={String(metrics.unassignedOrders)}
          tone={metrics.unassignedOrders === 0 ? "good" : "warn"}
        />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 lg:grid-cols-6">
        <MetricCell
          label="Ventanas tiempo"
          value={formatPercent(metrics.timeWindowComplianceRate)}
          tone={toneFromPercent(metrics.timeWindowComplianceRate)}
        />
        <MetricCell
          label="Asign. conductor"
          value={formatPercent(metrics.driverAssignmentCoverage)}
          tone={toneFromPercent(metrics.driverAssignmentCoverage)}
        />
        <MetricCell
          label="Calidad asign."
          value={formatPercent(metrics.averageAssignmentQuality)}
          tone={toneFromPercent(metrics.averageAssignmentQuality)}
        />
        <MetricCell
          label="Skills"
          value={formatPercent(metrics.skillCoverage)}
          tone={toneFromPercent(metrics.skillCoverage)}
        />
        <MetricCell
          label="Licencias"
          value={formatPercent(metrics.licenseCompliance)}
          tone={toneFromPercent(metrics.licenseCompliance)}
        />
        <MetricCell
          label="Balance carga"
          value={formatPercent(metrics.workloadBalance)}
          tone={toneFromPercent(metrics.workloadBalance)}
        />
      </div>
      {(metrics.assignmentsWithWarnings > 0 || metrics.assignmentsWithErrors > 0) && (
        <div className="text-[11px] text-muted-foreground flex gap-3 pt-1 border-t">
          {metrics.assignmentsWithWarnings > 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              {metrics.assignmentsWithWarnings} asignacion(es) con advertencias
            </span>
          )}
          {metrics.assignmentsWithErrors > 0 && (
            <span className="text-red-600 dark:text-red-400">
              {metrics.assignmentsWithErrors} con errores
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Helper Components

function StatusIcon({ name, className }: { name: string; className?: string }) {
  switch (name) {
    case "check-circle":
      return <CheckCircle2 className={className} />;
    case "x-circle":
      return <XCircle className={className} />;
    case "clock":
      return <Clock className={className} />;
    default:
      return null;
  }
}

// Compound Components

function HistorialSearch() {
  const { actions } = useHistorial();
  const [localValue, setLocalValue] = useState("");
  const debouncedValue = useDebounce(localValue, 300);

  useEffect(() => {
    actions.setSearchTerm(debouncedValue);
  }, [debouncedValue, actions]);

  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
      <Input
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder="Buscar por nombre..."
        className="pl-8 h-8 w-48 text-xs"
      />
    </div>
  );
}

export function HistorialHeader() {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-3">
        <Link href="/planificacion">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold">Historial</h1>
        <HistorialFilters />
        <HistorialSearch />
      </div>
      <Link href="/planificacion">
        <Button size="sm">
          <RotateCcw className="w-4 h-4 mr-2" />
          Nueva Planificación
        </Button>
      </Link>
    </div>
  );
}

export function HistorialFilters() {
  const { state, actions } = useHistorial();
  const statuses: JobStatus[] = ["all", "COMPLETED", "CANCELLED", "FAILED", "RUNNING", "PENDING"];

  return (
    <div className="flex gap-1 flex-wrap">
      {statuses.map((status) => (
        <button
          type="button"
          key={status}
          onClick={() => actions.setStatusFilter(status)}
          className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
            state.statusFilter === status
              ? "bg-primary text-primary-foreground"
              : "bg-muted hover:bg-muted/80"
          }`}
        >
          {STATUS_LABELS[status]}
        </button>
      ))}
    </div>
  );
}

export function HistorialError() {
  const { state } = useHistorial();

  if (!state.error) return null;

  return (
    <div className="mb-3 p-3 text-sm bg-destructive/10 text-destructive rounded-lg">
      {state.error}
    </div>
  );
}

export function HistorialLoading() {
  return (
    <div className="flex justify-center py-8">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export function HistorialEmpty() {
  return (
    <Card>
      <CardContent className="py-8 text-center">
        <p className="text-muted-foreground">
          No se encontraron planificaciones.{" "}
          <Link href="/planificacion" className="text-primary hover:underline">
            Crear tu primera planificación
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export function HistorialJobCard({ job }: { job: OptimizationJob }) {
  const { meta } = useHistorial();
  const [showMetrics, setShowMetrics] = useState(false);
  // Show "Confirmado" when job is COMPLETED and configuration was confirmed
  const effectiveStatus = job.status === "COMPLETED" && job.configurationStatus === "CONFIRMED"
    ? "CONFIRMED"
    : job.status;
  const statusConfig = getStatusConfig(effectiveStatus);
  // Plan metrics only exist after confirm. Cancelled/failed jobs have no row.
  const canShowMetrics = effectiveStatus === "CONFIRMED";

  return (
    <Card
      className={`transition-shadow hover:shadow-md ${
        job.status === "CANCELLED" ? "border-orange-500/50" : ""
      }`}
    >
      <CardContent className="px-3 py-2">
        <div className="flex items-center gap-3">
          <Badge className={`${statusConfig.color} text-xs py-0 shrink-0`}>
            <StatusIcon name={statusConfig.icon} className="w-3 h-3 mr-1" />
            {statusConfig.label}
          </Badge>

          {job.result?.isPartial && (
            <Badge variant="outline" className="text-xs py-0 shrink-0 text-orange-600 dark:text-orange-400 border-orange-600 dark:border-orange-500">
              Parcial
            </Badge>
          )}

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {job.configuration?.name || `Config ${job.configurationId?.slice(0, 8)}...`}
            </p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{formatDate(job.completedAt || job.cancelledAt || job.createdAt)}</span>
              {job.result && (
                <>
                  <span><span className="font-medium text-foreground">{job.result.metrics.totalRoutes}</span> rutas</span>
                  <span><span className="font-medium text-foreground">{job.result.metrics.totalStops}</span> paradas</span>
                  <span>{formatDistance(job.result.metrics.totalDistance)}</span>
                  {job.result.unassignedOrders.length > 0 && (
                    <span className="text-orange-600 dark:text-orange-400">
                      {job.result.unassignedOrders.length} sin asignar
                    </span>
                  )}
                </>
              )}
              {job.status === "RUNNING" && job.progress > 0 && (
                <span>{job.progress}%</span>
              )}
            </div>
          </div>

          {canShowMetrics && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMetrics((v) => !v)}
              title={showMetrics ? "Ocultar métricas" : "Ver métricas detalladas"}
            >
              <BarChart3 className="w-4 h-4 mr-1" />
              {showMetrics ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </Button>
          )}

          <HistorialJobActions job={job} />
        </div>
      </CardContent>
      {canShowMetrics && showMetrics && (
        <JobMetricsExpansion jobId={job.id} companyId={meta.companyId} />
      )}
    </Card>
  );
}

function HistorialJobActions({ job }: { job: OptimizationJob }) {
  const { actions } = useHistorial();

  if (job.status === "COMPLETED" || job.status === "CANCELLED") {
    return (
      <div className="flex items-center gap-1 ml-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => actions.navigateToResults(job)}
        >
          <Eye className="w-4 h-4" />
        </Button>
        {job.configurationId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => actions.handleReoptimize(job)}
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar este plan?</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminará la configuración y sus datos asociados. Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => actions.handleDelete(job)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  if (job.status === "RUNNING") {
    return (
      <div className="flex items-center gap-1 ml-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => actions.navigateToResults(job)}
        >
          <Eye className="w-4 h-4 mr-1" />
          Ver progreso
        </Button>
      </div>
    );
  }

  // PENDING and FAILED can also be deleted
  return (
    <div className="flex items-center gap-1 ml-2">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este plan?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la configuración y sus datos asociados. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => actions.handleDelete(job)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function HistorialJobList() {
  const { derived } = useHistorial();

  return (
    <div className="space-y-2">
      {derived.filteredJobs.map((job) => (
        <HistorialJobCard key={job.id} job={job} />
      ))}
    </div>
  );
}

export function HistorialPagination() {
  const { state, actions, derived } = useHistorial();

  return (
    <Pagination
      currentPage={state.currentPage}
      totalPages={derived.totalPages}
      onPageChange={actions.setPage}
      totalItems={state.totalCount}
      itemLabel="planificaciones"
    />
  );
}

export function HistorialContent() {
  const { state, meta, derived } = useHistorial();

  if (!meta.isReady) {
    return <HistorialLoading />;
  }

  if (state.isLoading) {
    return <HistorialLoading />;
  }

  if (derived.filteredJobs.length === 0) {
    return <HistorialEmpty />;
  }

  return (
    <div className="space-y-3">
      <HistorialJobList />
      <HistorialPagination />
    </div>
  );
}
