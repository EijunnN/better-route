"use client";

import {
  ArrowLeft,
  ArrowUpDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Loader2,
  Minus,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useHistorial, type OptimizationJob, type JobStatus } from "./historial-context";

// Status Configuration
const STATUS_CONFIG = {
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

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

// Helper Components

export function StatusIcon({ name, className }: { name: string; className?: string }) {
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

export function CompareValue({
  value,
  compareValue,
  format,
  higherIsBetter = false,
}: {
  value: number;
  compareValue?: number;
  format: (v: number) => string;
  higherIsBetter?: boolean;
}) {
  if (compareValue === undefined) {
    return <span>{format(value)}</span>;
  }

  const diff = value - compareValue;
  const percent = compareValue !== 0 ? (diff / compareValue) * 100 : 0;

  if (Math.abs(diff) < 0.01) {
    return (
      <span className="flex items-center gap-1">
        <span>{format(value)}</span>
        <Minus className="w-3 h-3 text-muted-foreground" />
      </span>
    );
  }

  const isGood = higherIsBetter ? diff > 0 : diff < 0;
  const Icon = isGood ? TrendingDown : TrendingUp;
  const colorClass = isGood ? "text-green-600" : "text-red-600";

  return (
    <span className={`flex items-center gap-1 ${colorClass}`}>
      <span>{format(value)}</span>
      <Icon className="w-3 h-3" />
      <span className="text-xs">{Math.abs(percent).toFixed(1)}%</span>
    </span>
  );
}

// Compound Components

export function HistorialHeader() {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-4">
        <Link href="/planificacion">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Historial de Planificaciones</h1>
          <p className="text-muted-foreground mt-1">
            Revisa y compara optimizaciones anteriores
          </p>
        </div>
      </div>
      <Link href="/planificacion">
        <Button>
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
    <div className="flex gap-2 flex-wrap">
      {statuses.map((status) => (
        <button
          type="button"
          key={status}
          onClick={() => actions.setStatusFilter(status)}
          className={`px-4 py-2 rounded-lg transition-colors ${
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
    <div className="mb-6 p-4 bg-destructive/10 text-destructive rounded-lg">
      {state.error}
    </div>
  );
}

export function HistorialLoading() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export function HistorialEmpty() {
  return (
    <Card>
      <CardContent className="py-12 text-center">
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

function JobMetricsColumn({ job }: { job: OptimizationJob }) {
  const result = job.result;
  if (!result) return null;

  return (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Rutas:</span>
        <span className="font-medium">{result.metrics.totalRoutes}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Paradas:</span>
        <span className="font-medium">{result.metrics.totalStops}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Distancia:</span>
        <span className="font-medium">{formatDistance(result.metrics.totalDistance)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Duración:</span>
        <span className="font-medium">{formatDuration(result.metrics.totalDuration * 1000)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Utilización:</span>
        <span className="font-medium">{result.metrics.utilizationRate}%</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Cumplimiento:</span>
        <span className="font-medium">{result.metrics.timeWindowComplianceRate}%</span>
      </div>
      {result.unassignedOrders.length > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Sin asignar:</span>
          <span className="font-medium text-orange-600 dark:text-orange-400">{result.unassignedOrders.length}</span>
        </div>
      )}
    </div>
  );
}

function JobCompareColumn({
  job,
  compareJob,
}: {
  job: OptimizationJob;
  compareJob: OptimizationJob;
}) {
  const result = job.result;
  const compareResult = compareJob.result;

  if (!result || !compareResult) return null;

  return (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Rutas:</span>
        <CompareValue
          value={result.metrics.totalRoutes}
          compareValue={compareResult.metrics.totalRoutes}
          format={(v) => v.toString()}
        />
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Paradas:</span>
        <CompareValue
          value={result.metrics.totalStops}
          compareValue={compareResult.metrics.totalStops}
          format={(v) => v.toString()}
        />
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Distancia:</span>
        <CompareValue
          value={result.metrics.totalDistance}
          compareValue={compareResult.metrics.totalDistance}
          format={formatDistance}
        />
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Duración:</span>
        <CompareValue
          value={result.metrics.totalDuration * 1000}
          compareValue={compareResult.metrics.totalDuration * 1000}
          format={formatDuration}
        />
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Utilización:</span>
        <CompareValue
          value={result.metrics.utilizationRate}
          compareValue={compareResult.metrics.utilizationRate}
          format={(v) => `${v}%`}
          higherIsBetter
        />
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Cumplimiento:</span>
        <CompareValue
          value={result.metrics.timeWindowComplianceRate}
          compareValue={compareResult.metrics.timeWindowComplianceRate}
          format={(v) => `${v}%`}
          higherIsBetter
        />
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Sin asignar:</span>
        <CompareValue
          value={result.unassignedOrders.length}
          compareValue={compareResult.unassignedOrders.length}
          format={(v) => v.toString()}
        />
      </div>
    </div>
  );
}

function JobHeader({ job }: { job: OptimizationJob }) {
  const statusConfig = getStatusConfig(job.status);

  return (
    <>
      <div className="flex items-center gap-2">
        <Badge className={statusConfig.color}>
          <StatusIcon name={statusConfig.icon} className="w-3 h-3 mr-1" />
          {statusConfig.label}
        </Badge>
        {job.result?.isPartial && <Badge variant="outline">Parcial</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">
        {formatDate(job.completedAt || job.cancelledAt || job.createdAt)}
      </p>
      {job.configuration && <p className="text-sm font-medium">{job.configuration.name}</p>}
    </>
  );
}

export function HistorialComparisonCard() {
  const { state, actions, derived } = useHistorial();

  if (!derived.canCompare) return null;

  const [job1, job2] = derived.selectedJobs;
  if (!job1 || !job2) return null;

  return (
    <Card className="border-primary/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ArrowUpDown className="w-5 h-5" />
              Comparación
            </CardTitle>
            <CardDescription>Comparando resultados entre dos planificaciones</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={actions.clearSelection}>
            Limpiar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-8">
          <div className="space-y-4">
            <JobHeader job={job1} />
            <JobMetricsColumn job={job1} />
          </div>
          <div className="space-y-4">
            <JobHeader job={job2} />
            <JobCompareColumn job={job2} compareJob={job1} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function HistorialJobCard({ job }: { job: OptimizationJob }) {
  const { state, actions } = useHistorial();
  const statusConfig = getStatusConfig(job.status);
  const isSelected = state.selectedJobIds.includes(job.id);
  const hasResult = job.result && (job.status === "COMPLETED" || job.status === "CANCELLED");

  return (
    <Card
      className={`transition-shadow cursor-pointer hover:shadow-md ${
        isSelected ? "ring-2 ring-primary" : ""
      } ${job.status === "CANCELLED" ? "border-orange-500/50" : ""}`}
      onClick={() => hasResult && actions.toggleJobSelection(job.id)}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1">
            {hasResult && (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => {
                  e.stopPropagation();
                  actions.toggleJobSelection(job.id);
                }}
                className="w-4 h-4"
              />
            )}

            <Badge className={statusConfig.color}>
              <StatusIcon name={statusConfig.icon} className="w-3 h-3 mr-1" />
              {statusConfig.label}
            </Badge>

            {job.result?.isPartial && (
              <Badge variant="outline" className="text-orange-600 dark:text-orange-400 border-orange-600 dark:border-orange-500">
                Parcial
              </Badge>
            )}

            <div className="flex-1">
              {job.configuration ? (
                <>
                  <p className="font-medium">{job.configuration.name}</p>
                  <p className="text-sm text-muted-foreground">{job.configuration.objective}</p>
                </>
              ) : (
                <p className="text-muted-foreground">
                  Configuración {job.configurationId?.slice(0, 8)}...
                </p>
              )}
            </div>

            {job.result && (
              <div className="flex items-center gap-6 text-sm">
                <div className="text-center">
                  <p className="text-muted-foreground">Rutas</p>
                  <p className="font-medium">{job.result.metrics.totalRoutes}</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground">Paradas</p>
                  <p className="font-medium">{job.result.metrics.totalStops}</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground">Distancia</p>
                  <p className="font-medium">{formatDistance(job.result.metrics.totalDistance)}</p>
                </div>
                {job.result.unassignedOrders.length > 0 && (
                  <div className="text-center">
                    <p className="text-muted-foreground">Sin asignar</p>
                    <p className="font-medium text-orange-600 dark:text-orange-400">
                      {job.result.unassignedOrders.length}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="text-sm text-muted-foreground w-40 text-right">
              <p>{formatDate(job.completedAt || job.cancelledAt || job.createdAt)}</p>
              {job.status === "RUNNING" && job.progress > 0 && (
                <p className="text-xs">{job.progress}%</p>
              )}
            </div>
          </div>

          <HistorialJobActions job={job} />
        </div>
      </CardContent>
    </Card>
  );
}

function HistorialJobActions({ job }: { job: OptimizationJob }) {
  const { actions } = useHistorial();

  if (job.status === "COMPLETED" || job.status === "CANCELLED") {
    return (
      <div className="flex items-center gap-2 ml-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            actions.navigateToResults(job);
          }}
        >
          <Eye className="w-4 h-4" />
        </Button>
        {job.configurationId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              actions.handleReoptimize(job);
            }}
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        )}
      </div>
    );
  }

  if (job.status === "RUNNING") {
    return (
      <div className="flex items-center gap-2 ml-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            actions.navigateToResults(job);
          }}
        >
          <Eye className="w-4 h-4 mr-1" />
          Ver progreso
        </Button>
      </div>
    );
  }

  return null;
}

export function HistorialJobList() {
  const { derived } = useHistorial();

  return (
    <div className="space-y-3">
      {derived.filteredJobs.map((job) => (
        <HistorialJobCard key={job.id} job={job} />
      ))}
    </div>
  );
}

export function HistorialSelectionHint() {
  const { state } = useHistorial();

  if (state.selectedJobIds.length === 0 || state.selectedJobIds.length >= 2) {
    return null;
  }

  return (
    <div className="text-center text-sm text-muted-foreground">
      Selecciona otro trabajo para comparar resultados
    </div>
  );
}

export function HistorialPagination() {
  const { state, actions, derived } = useHistorial();
  const { currentPage, totalCount, pageSize } = state;
  const { totalPages } = derived;

  if (totalPages <= 1) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalCount);

  return (
    <div className="flex items-center justify-between pt-4">
      <p className="text-sm text-muted-foreground">
        Mostrando {start}-{end} de {totalCount}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => actions.setPage(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Anterior
        </Button>
        <div className="flex items-center gap-1">
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((page) => {
              if (totalPages <= 7) return true;
              if (page === 1 || page === totalPages) return true;
              if (Math.abs(page - currentPage) <= 1) return true;
              return false;
            })
            .reduce<(number | "ellipsis")[]>((acc, page, idx, arr) => {
              if (idx > 0 && arr[idx - 1] !== undefined && page - arr[idx - 1] > 1) {
                acc.push("ellipsis");
              }
              acc.push(page);
              return acc;
            }, [])
            .map((item, idx) =>
              item === "ellipsis" ? (
                <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">
                  ...
                </span>
              ) : (
                <Button
                  key={item}
                  variant={currentPage === item ? "default" : "outline"}
                  size="sm"
                  className="w-8 h-8 p-0"
                  onClick={() => actions.setPage(item)}
                >
                  {item}
                </Button>
              ),
            )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => actions.setPage(currentPage + 1)}
          disabled={currentPage >= totalPages}
        >
          Siguiente
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
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
    <div className="space-y-6">
      <HistorialComparisonCard />
      <HistorialJobList />
      <HistorialSelectionHint />
      <HistorialPagination />
    </div>
  );
}
