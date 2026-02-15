"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { exportPlanToExcel } from "@/lib/export/export-plan-excel";

interface RouteStop {
  trackingId: string;
  sequence: number;
  estimatedArrival?: string;
  groupedTrackingIds?: string[];
  address?: string;
  latitude?: string;
  longitude?: string;
}

interface RouteData {
  routeId: string;
  vehicleId: string;
  vehiclePlate: string;
  driverId?: string;
  driverName?: string;
  stops: RouteStop[];
  totalWeight: number;
  totalDuration: number;
  totalDistance?: number;
}

interface Driver {
  id: string;
  name: string;
  driverStatus?: string;
  licenseExpiry?: string;
}

interface ValidationResult {
  isValid: boolean;
  canConfirm: boolean;
  issues: Array<{
    severity: "ERROR" | "WARNING" | "INFO";
    message: string;
  }>;
  summary: {
    totalRoutes: number;
    routesWithDrivers: number;
    routesWithoutDrivers: number;
    unassignedOrders: number;
    errorCount: number;
    warningCount: number;
  };
  alreadyConfirmed?: boolean;
  message?: string;
  result?: {
    routes: RouteData[];
    summary: {
      optimizedAt: string;
    };
    metrics?: {
      totalDistance: number;
      totalDuration: number;
    };
  };
}

interface PlanConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  companyId: string;
  onConfirmed?: () => void;
}

function formatDateInput(dateStr?: string): string {
  if (!dateStr) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  // Handle both "2026-02-15" and "2026-02-15T00:00:00.000Z"
  return dateStr.slice(0, 10);
}

function parseDateString(dateStr: string): Date | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function dateToString(date: Date | null): string {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}HRS`;
}

function formatDistance(meters: number): string {
  return (meters / 1000).toFixed(2);
}

export function PlanConfirmationDialog({
  open,
  onOpenChange,
  jobId,
  companyId,
  onConfirmed,
}: PlanConfirmationDialogProps) {
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [overrideWarnings, setOverrideWarnings] = useState(false);
  const [acceptUnassigned, setAcceptUnassigned] = useState(false);
  const [planName, setPlanName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverAssignments, setDriverAssignments] = useState<
    Record<string, string>
  >({});

  // Fetch drivers (users with role CONDUCTOR) for the company
  const fetchDrivers = useCallback(async () => {
    try {
      const response = await fetch("/api/users?role=CONDUCTOR&active=true", {
        headers: {
          "x-company-id": companyId,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setDrivers(data.data || []);
      }
    } catch (err) {
      console.error("Error fetching drivers:", err);
    }
  }, [companyId]);

  const validatePlan = useCallback(async () => {
    setIsValidating(true);
    setError(null);

    try {
      const response = await fetch(`/api/optimization/jobs/${jobId}/validate`, {
        headers: {
          "x-company-id": companyId,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Error al validar el plan");
      }

      const data: ValidationResult = await response.json();
      setValidationResult(data);

      // Set default values
      if (data.result?.summary?.optimizedAt) {
        const date = new Date(data.result.summary.optimizedAt);
        const dateStr = formatDateInput(data.result.summary.optimizedAt);
        setPlanName(date.toLocaleString("es-PE", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }));
        setStartDate(dateStr);
        setEndDate(dateStr);
      }

      // Initialize driver assignments from routes
      if (data.result?.routes) {
        const assignments: Record<string, string> = {};
        data.result.routes.forEach((route) => {
          if (route.driverId) {
            assignments[route.vehicleId] = route.driverId;
          }
        });
        setDriverAssignments(assignments);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al validar el plan");
    } finally {
      setIsValidating(false);
    }
  }, [jobId, companyId]);

  useEffect(() => {
    if (open) {
      setOverrideWarnings(false);
      setAcceptUnassigned(false);
      setError(null);
      fetchDrivers();
      validatePlan();
    }
  }, [open, validatePlan, fetchDrivers]);

  const handleDriverChange = (vehicleId: string, driverId: string) => {
    setDriverAssignments((prev) => ({
      ...prev,
      [vehicleId]: driverId,
    }));
  };

  const confirmingRef = useRef(false);

  const handleConfirm = async () => {
    if (!validationResult?.canConfirm || confirmingRef.current) return;

    confirmingRef.current = true;
    setIsConfirming(true);
    setError(null);

    try {
      const response = await fetch(`/api/optimization/jobs/${jobId}/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId,
        },
        body: JSON.stringify({
          companyId,
          jobId,
          overrideWarnings,
          planName: planName || undefined,
          startDate,
          endDate,
          driverAssignments,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        // 409 "already confirmed" means the plan IS confirmed — treat as success
        if (response.status === 409 && data.error?.includes("already")) {
          onOpenChange(false);
          onConfirmed?.();
          return;
        }
        throw new Error(data.error || "Error al confirmar el plan");
      }

      onOpenChange(false);
      onConfirmed?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al confirmar el plan"
      );
      await validatePlan();
    } finally {
      setIsConfirming(false);
      confirmingRef.current = false;
    }
  };

  const handleDownload = () => {
    if (!validationResult?.result) return;

    const result = validationResult.result;
    exportPlanToExcel(
      {
        routes: result.routes.map((route) => ({
          ...route,
          totalDistance: route.totalDistance || 0,
          totalVolume: 0,
          stops: route.stops.map((stop) => ({
            ...stop,
            orderId: stop.trackingId,
            address: stop.address || "",
            latitude: stop.latitude || "0",
            longitude: stop.longitude || "0",
          })),
        })),
        metrics: {
          totalRoutes: result.routes.length,
          totalStops: result.routes.reduce((acc, r) => acc + r.stops.length, 0),
          totalDistance: result.metrics?.totalDistance || 0,
          totalDuration: result.metrics?.totalDuration || 0,
        },
        summary: {
          optimizedAt: result.summary.optimizedAt,
          objective: "Minimizar distancia",
        },
      },
      `plan-${planName || "export"}.xlsx`
    );
  };

  const routes = validationResult?.result?.routes || [];
  const hasUnassigned = (validationResult?.summary?.unassignedOrders || 0) > 0;
  const hasWarnings = (validationResult?.summary?.warningCount || 0) > 0;

  // Calculate totals
  const totalVisits = routes.reduce((acc, r) => acc + r.stops.length, 0);
  const totalKms = routes.reduce((acc, r) => acc + (r.totalDistance || 0), 0);
  const totalTime = routes.reduce((acc, r) => acc + r.totalDuration, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="p-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-primary">
            <span className="text-primary">&lt;</span>
            Edición del plan
          </DialogTitle>
        </DialogHeader>

        {isValidating ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Cargando plan...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 p-4 m-4 bg-destructive/10 text-destructive rounded-md">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="font-medium">Error</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        ) : validationResult?.alreadyConfirmed ? (
          <div className="flex items-center gap-3 p-4 m-4 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400 rounded-md">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="font-medium">Plan ya confirmado</p>
              <p className="text-sm">{validationResult.message}</p>
            </div>
          </div>
        ) : validationResult ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Plan Info Section */}
            <div className="p-4 space-y-4 border-b">
              {/* Plan Name */}
              <div>
                <Label
                  htmlFor="plan-name"
                  className="text-xs text-muted-foreground uppercase"
                >
                  Nombre del plan
                </Label>
                <Input
                  id="plan-name"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  className="mt-1"
                />
              </div>

              {/* Date Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label
                    className="text-xs text-muted-foreground uppercase"
                  >
                    Fecha de inicio
                  </Label>
                  <div className="mt-1">
                    <DatePicker
                      value={parseDateString(startDate)}
                      onChange={(date) => setStartDate(dateToString(date))}
                      placeholder="Seleccionar fecha"
                    />
                  </div>
                </div>
                <div>
                  <Label
                    className="text-xs text-muted-foreground uppercase"
                  >
                    Fecha de término
                  </Label>
                  <div className="mt-1">
                    <DatePicker
                      value={parseDateString(endDate)}
                      onChange={(date) => setEndDate(dateToString(date))}
                      placeholder="Seleccionar fecha"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Warnings */}
            {(hasUnassigned || hasWarnings) && (
              <div className="px-4 pt-4 space-y-2">
                {hasUnassigned && (
                  <div className="flex items-center gap-3 p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-900">
                    <AlertTriangle className="h-4 w-4 text-orange-600 flex-shrink-0" />
                    <div className="flex-1 flex items-center justify-between">
                      <p className="text-sm text-orange-800 dark:text-orange-400">
                        {validationResult.summary.unassignedOrders} pedido(s) sin
                        asignar
                      </p>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="accept-unassigned"
                          checked={acceptUnassigned}
                          onCheckedChange={(checked) =>
                            setAcceptUnassigned(checked as boolean)
                          }
                        />
                        <Label
                          htmlFor="accept-unassigned"
                          className="text-xs cursor-pointer text-orange-700 dark:text-orange-500"
                        >
                          Aceptar
                        </Label>
                      </div>
                    </div>
                  </div>
                )}
                {hasWarnings && (
                  <div className="p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-900">
                    <div className="flex items-center gap-3 mb-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0" />
                      <div className="flex-1 flex items-center justify-between">
                        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-400">
                          {validationResult.summary.warningCount} advertencia(s)
                        </p>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="override-warnings"
                            checked={overrideWarnings}
                            onCheckedChange={(checked) =>
                              setOverrideWarnings(checked as boolean)
                            }
                          />
                          <Label
                            htmlFor="override-warnings"
                            className="text-xs cursor-pointer text-yellow-700 dark:text-yellow-500"
                          >
                            Aceptar
                          </Label>
                        </div>
                      </div>
                    </div>
                    {/* Mostrar detalles de advertencias */}
                    {validationResult.issues && validationResult.issues.length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs text-yellow-700 dark:text-yellow-500 pl-7">
                        {validationResult.issues
                          .filter((issue) => issue.severity === "WARNING")
                          .slice(0, 5)
                          .map((issue, idx) => (
                            <li key={idx} className="list-disc">
                              {issue.message}
                            </li>
                          ))}
                        {validationResult.issues.filter((i) => i.severity === "WARNING").length > 5 && (
                          <li className="text-yellow-600 italic">
                            ... y {validationResult.issues.filter((i) => i.severity === "WARNING").length - 5} más
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Routes Table */}
            <div className="flex-1 overflow-hidden p-4">
              <ScrollArea className="h-full">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs uppercase text-muted-foreground">
                      <TableHead className="font-medium">Vehículo</TableHead>
                      <TableHead className="font-medium">Conductor</TableHead>
                      <TableHead className="text-center font-medium">
                        Rutas
                      </TableHead>
                      <TableHead className="text-center font-medium">
                        Visitas
                      </TableHead>
                      <TableHead className="text-center font-medium">
                        KMS
                      </TableHead>
                      <TableHead className="text-center font-medium">
                        Tiempo
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {routes.map((route) => {
                      const currentDriverId =
                        driverAssignments[route.vehicleId] || route.driverId;
                      const currentDriver = drivers.find(
                        (d) => d.id === currentDriverId
                      );

                      return (
                        <TableRow key={route.routeId}>
                          <TableCell className="font-medium">
                            {route.vehiclePlate}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={currentDriverId || "none"}
                              onValueChange={(value) =>
                                handleDriverChange(
                                  route.vehicleId,
                                  value === "none" ? "" : value
                                )
                              }
                            >
                              <SelectTrigger className="w-[220px]">
                                <SelectValue>
                                  {currentDriver ? (
                                    <span className="flex items-center gap-1">
                                      <span className="text-green-600">✓</span>
                                      {currentDriver.name}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">
                                      Sin asignar
                                    </span>
                                  )}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">
                                  Sin asignar
                                </SelectItem>
                                {drivers.map((driver) => (
                                  <SelectItem key={driver.id} value={driver.id}>
                                    <span className="flex items-center gap-1">
                                      {driver.id === currentDriverId && (
                                        <span className="text-green-600">✓</span>
                                      )}
                                      {driver.name}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-center text-primary">
                            1
                          </TableCell>
                          <TableCell className="text-center">
                            {route.stops.length}
                          </TableCell>
                          <TableCell className="text-center">
                            {formatDistance(route.totalDistance || 0)}
                          </TableCell>
                          <TableCell className="text-center">
                            {formatDuration(route.totalDuration)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-4 border-t bg-muted/30">
              <div className="flex items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleDownload}
                  className="bg-primary"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Descargar
                </Button>
                <Button variant="default" size="sm" disabled className="bg-primary">
                  <Upload className="h-4 w-4 mr-2" />
                  Subir
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled>
                  Ediciones avanzadas
                </Button>
                <Button
                  onClick={handleConfirm}
                  size="sm"
                  disabled={
                    isValidating ||
                    isConfirming ||
                    !validationResult?.canConfirm ||
                    (hasUnassigned && !acceptUnassigned) ||
                    (hasWarnings && !overrideWarnings)
                  }
                >
                  {isConfirming && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Guardar
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">No hay datos disponibles</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
