"use client";

import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Loader2,
  RotateCcw,
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

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
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
  const { actions } = useHistorial();
  const statusConfig = getStatusConfig(job.status);

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
  const { currentPage, totalCount, pageSize } = state;
  const { totalPages } = derived;

  if (totalPages <= 1) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalCount);

  return (
    <div className="flex items-center justify-between pt-2">
      <p className="text-xs text-muted-foreground">
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
    <div className="space-y-3">
      <HistorialJobList />
      <HistorialPagination />
    </div>
  );
}
