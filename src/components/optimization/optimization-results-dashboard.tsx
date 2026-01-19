"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Eye,
  EyeOff,
  History,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  Ruler,
  Scale,
  TrendingUp,
  Truck,
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useCompanyContext } from "@/hooks/use-company-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { exportPlanToExcel } from "@/lib/export-plan-excel";
import { DriverAssignmentDisplay } from "./driver-assignment-quality";
import { PencilSelectOverlay } from "./pencil-select-overlay";
import { PlanConfirmationDialog } from "./plan-confirmation-dialog";
import { RouteMap, ROUTE_COLORS } from "./route-map";
import type maplibregl from "maplibre-gl";

interface RouteData {
  routeId: string;
  vehicleId: string;
  vehiclePlate: string;
  driverId?: string;
  driverName?: string;
  driverOrigin?: {
    latitude: string;
    longitude: string;
    address?: string;
  };
  stops: Array<{
    orderId: string;
    trackingId: string;
    sequence: number;
    address: string;
    latitude: string;
    longitude: string;
    estimatedArrival?: string;
    timeWindow?: {
      start: string;
      end: string;
    };
    // For grouped stops (multiple orders at same location)
    groupedOrderIds?: string[];
    groupedTrackingIds?: string[];
  }>;
  totalDistance: number;
  totalDuration: number;
  totalServiceTime?: number; // Time at stops
  totalTravelTime?: number; // Time traveling
  totalWeight: number;
  totalVolume: number;
  utilizationPercentage: number;
  timeWindowViolations: number;
  geometry?: string;
  assignmentQuality?: {
    score: number;
    warnings: string[];
    errors: string[];
  };
}

interface Zone {
  id: string;
  name: string;
  geometry: {
    type: string;
    coordinates: number[][][];
  };
  color: string | null;
  active: boolean;
  vehicleCount: number;
  vehicles: Array<{ id: string; plate: string | null }>;
}

interface OptimizationResultsDashboardProps {
  jobId?: string;
  result: {
    routes: RouteData[];
    unassignedOrders: Array<{
      orderId: string;
      trackingId: string;
      reason: string;
      latitude?: string;
      longitude?: string;
      address?: string;
    }>;
    vehiclesWithoutRoutes?: Array<{
      id: string;
      plate: string;
      originLatitude?: string;
      originLongitude?: string;
    }>;
    metrics: {
      totalDistance: number;
      totalDuration: number;
      totalRoutes: number;
      totalStops: number;
      utilizationRate: number;
      timeWindowComplianceRate: number;
      balanceScore?: number;
    };
    assignmentMetrics?: {
      totalAssignments: number;
      assignmentsWithWarnings: number;
      assignmentsWithErrors: number;
      averageScore: number;
      skillCoverage: number;
      licenseCompliance: number;
      fleetAlignment: number;
      workloadBalance: number;
    };
    summary: {
      optimizedAt: string;
      objective: string;
      processingTimeMs: number;
    };
    depot?: {
      latitude: number;
      longitude: number;
    };
  };
  isPartial?: boolean;
  jobStatus?: string;
  onReoptimize?: () => void;
  onConfirm?: () => void;
  onBack?: () => void;
  onResultUpdate?: (
    newResult: OptimizationResultsDashboardProps["result"],
  ) => void;
}

// Type for reassignment target
interface ReassignmentTarget {
  orderId: string;
  trackingId: string;
  address: string;
  currentVehicleId: string | null;
  currentVehiclePlate: string | null;
  currentRouteId: string | null;
}

// Type for selectable order (for multi-select mode)
interface SelectableOrder {
  orderId: string;
  trackingId: string;
  address: string;
  vehicleId: string | null;
  vehiclePlate: string | null;
  routeId: string | null;
}

// Format helpers
function formatDistance(meters: number) {
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// KPI Badge Component
function KpiBadge({
  icon: Icon,
  label,
  value,
  status = "neutral",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  status?: "success" | "warning" | "error" | "neutral";
}) {
  const statusColors = {
    success: "bg-green-500/10 text-green-700 border-green-500/20",
    warning: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
    error: "bg-red-500/10 text-red-700 border-red-500/20",
    neutral: "bg-muted text-muted-foreground border-border",
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm",
        statusColors[status],
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="font-medium">{value}</span>
      <span className="text-xs opacity-70 hidden sm:inline">{label}</span>
    </div>
  );
}

// Compact Route Card
function CompactRouteCard({
  route,
  routeNumber,
  routeColor,
  isSelected,
  isExpanded,
  onSelect,
  onToggle,
  onToggleOrderSelection,
  isOrderSelected,
}: {
  route: RouteData;
  routeNumber: number;
  routeColor: string;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onToggleOrderSelection?: (
    orderId: string,
    trackingId: string,
    address: string,
  ) => void;
  isOrderSelected?: (orderId: string) => boolean;
}) {
  const hasViolations = route.timeWindowViolations > 0;
  const utilizationColor =
    route.utilizationPercentage >= 80
      ? "text-green-600"
      : route.utilizationPercentage >= 50
        ? "text-yellow-600"
        : "text-red-600";

  return (
    <div
      className={cn(
        "border rounded-lg transition-shadow overflow-hidden",
        isSelected && "ring-2",
        hasViolations && "border-orange-300",
      )}
      style={{
        borderLeftWidth: "4px",
        borderLeftColor: routeColor,
        ...(isSelected
          ? ({ "--tw-ring-color": routeColor } as React.CSSProperties)
          : {}),
      }}
    >
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/50"
        onClick={onSelect}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: routeColor }}
        >
          <Truck className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm" style={{ color: routeColor }}>
              {route.vehiclePlate}
            </span>
            {route.driverName && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" />
                {route.driverName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
            <span>{route.stops.length} paradas</span>
            <span>{formatDistance(route.totalDistance)}</span>
            <span className={utilizationColor}>
              {route.utilizationPercentage}%
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasViolations && (
            <Badge
              variant="outline"
              className="border-orange-300 text-orange-700 text-xs"
            >
              <AlertTriangle className="h-3 w-3 mr-1" />
              {route.timeWindowViolations}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            aria-label={isExpanded ? "Colapsar ruta" : "Expandir ruta"}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t p-2 space-y-2">
          {/* Compact Route Metrics */}
          <div className="flex items-center gap-3 text-xs px-1">
            <div className="flex items-center gap-1">
              <Ruler className="h-3 w-3 text-muted-foreground" />
              <span className="font-medium">
                {formatDistance(route.totalDistance)}
              </span>
            </div>
            <div
              className="flex items-center gap-1"
              title="Tiempo total (viaje + servicio)"
            >
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="font-medium">
                {formatDuration(route.totalDuration)}
              </span>
              {route.totalTravelTime !== undefined &&
                route.totalServiceTime !== undefined && (
                  <span className="text-muted-foreground">
                    ({formatDuration(route.totalTravelTime)} viaje +{" "}
                    {formatDuration(route.totalServiceTime)} servicio)
                  </span>
                )}
            </div>
            {route.totalWeight > 0 && (
              <div className="flex items-center gap-1">
                <Scale className="h-3 w-3 text-muted-foreground" />
                <span>{route.totalWeight}kg</span>
              </div>
            )}
            {route.totalVolume > 0 && (
              <div className="flex items-center gap-1">
                <Package className="h-3 w-3 text-muted-foreground" />
                <span>{route.totalVolume}L</span>
              </div>
            )}
          </div>

          {/* Driver Assignment - only show if has warnings/errors */}
          {route.assignmentQuality &&
            (route.assignmentQuality.warnings.length > 0 ||
              route.assignmentQuality.errors.length > 0) && (
              <DriverAssignmentDisplay route={route} />
            )}

          {/* Compact Stops List */}
          <div className="border rounded max-h-32 overflow-y-auto">
            <div className="divide-y divide-border/50">
              {route.stops.map((stop) => {
                const isGrouped =
                  stop.groupedTrackingIds && stop.groupedTrackingIds.length > 1;

                if (isGrouped) {
                  // Render each grouped order as a sub-item
                  return stop.groupedTrackingIds!.map(
                    (trackingId, subIndex) => {
                      const orderId =
                        stop.groupedOrderIds?.[subIndex] || stop.orderId;
                      const selected = isOrderSelected?.(orderId) || false;
                      return (
                        <div
                          key={`${stop.orderId}-${subIndex}`}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1.5 text-xs group cursor-pointer transition-colors",
                            selected ? "bg-primary/10" : "hover:bg-accent/50",
                          )}
                          onClick={() =>
                            onToggleOrderSelection?.(
                              orderId,
                              trackingId,
                              stop.address,
                            )
                          }
                        >
                          <div
                            className={cn(
                              "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                              selected
                                ? "bg-primary border-primary"
                                : "border-muted-foreground/30",
                            )}
                          >
                            {selected && (
                              <Check className="h-3 w-3 text-primary-foreground" />
                            )}
                          </div>
                          <span className="bg-primary text-primary-foreground px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0">
                            R{routeNumber}-{stop.sequence}.{subIndex + 1}
                          </span>
                          <span className="font-medium shrink-0">
                            {trackingId}
                          </span>
                          <span className="text-muted-foreground truncate flex-1">
                            {stop.address}
                          </span>
                          {stop.timeWindow && subIndex === 0 && (
                            <span className="text-muted-foreground text-[10px] shrink-0">
                              {new Date(
                                stop.timeWindow.start,
                              ).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          )}
                        </div>
                      );
                    },
                  );
                }

                // Single order stop
                const selected = isOrderSelected?.(stop.orderId) || false;
                return (
                  <div
                    key={stop.orderId}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 text-xs group cursor-pointer transition-colors",
                      selected ? "bg-primary/10" : "hover:bg-accent/50",
                    )}
                    onClick={() =>
                      onToggleOrderSelection?.(
                        stop.orderId,
                        stop.trackingId,
                        stop.address,
                      )
                    }
                  >
                    <div
                      className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                        selected
                          ? "bg-primary border-primary"
                          : "border-muted-foreground/30",
                      )}
                    >
                      {selected && (
                        <Check className="h-3 w-3 text-primary-foreground" />
                      )}
                    </div>
                    <span className="bg-primary text-primary-foreground px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0">
                      R{routeNumber}-{stop.sequence}
                    </span>
                    <span className="font-medium shrink-0">
                      {stop.trackingId}
                    </span>
                    <span className="text-muted-foreground truncate flex-1">
                      {stop.address}
                    </span>
                    {stop.timeWindow && (
                      <span className="text-muted-foreground text-[10px] shrink-0">
                        {new Date(stop.timeWindow.start).toLocaleTimeString(
                          [],
                          { hour: "2-digit", minute: "2-digit" },
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Unassigned Orders Panel (Collapsible)
function UnassignedOrdersPanel({
  orders,
  isExpanded,
  onToggle,
  onToggleOrderSelection,
  isOrderSelected,
}: {
  orders: Array<{
    orderId: string;
    trackingId: string;
    reason: string;
    address?: string;
  }>;
  isExpanded: boolean;
  onToggle: () => void;
  onToggleOrderSelection?: (
    orderId: string,
    trackingId: string,
    address: string,
  ) => void;
  isOrderSelected?: (orderId: string) => boolean;
}) {
  if (orders.length === 0) return null;

  return (
    <div className="border border-orange-200 dark:border-orange-800/50 rounded-lg bg-orange-50/50 dark:bg-orange-950/20 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-orange-100/50 dark:hover:bg-orange-900/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          <span className="text-sm font-medium text-orange-800 dark:text-orange-300">
            {orders.length} sin asignar
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-orange-600 dark:text-orange-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-orange-600 dark:text-orange-400" />
        )}
      </button>

      {isExpanded && (
        <div className="px-3 pb-2 max-h-40 overflow-y-auto border-t border-orange-200/50 dark:border-orange-800/30">
          <div className="space-y-1 pt-2">
            {orders.map((order) => {
              const selected = isOrderSelected?.(order.orderId) || false;
              return (
                <div
                  key={order.orderId}
                  className={cn(
                    "flex items-center gap-2 text-xs py-1.5 px-2 -mx-2 rounded cursor-pointer transition-colors",
                    selected
                      ? "bg-primary/10"
                      : "hover:bg-orange-100/50 dark:hover:bg-orange-900/30",
                  )}
                  onClick={() =>
                    onToggleOrderSelection?.(
                      order.orderId,
                      order.trackingId,
                      order.address || "Sin dirección",
                    )
                  }
                >
                  <div
                    className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                      selected
                        ? "bg-primary border-primary"
                        : "border-orange-400/50",
                    )}
                  >
                    {selected && (
                      <Check className="h-3 w-3 text-primary-foreground" />
                    )}
                  </div>
                  <span className="font-medium text-orange-900 dark:text-orange-200">
                    {order.trackingId}
                  </span>
                  <span className="text-orange-700/70 dark:text-orange-400/70 truncate flex-1">
                    {order.reason}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function OptimizationResultsDashboard({
  jobId,
  result,
  isPartial,
  jobStatus,
  onReoptimize,
  onConfirm,
  onBack,
  onResultUpdate,
}: OptimizationResultsDashboardProps) {
  const { effectiveCompanyId: companyId } = useCompanyContext();
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [unassignedExpanded, setUnassignedExpanded] = useState(false);
  const [zones, setZones] = useState<Zone[]>([]);
  const [showZones, setShowZones] = useState(true);

  // Reassignment state
  const [selectedOrdersForReassign, setSelectedOrdersForReassign] = useState<
    SelectableOrder[]
  >([]);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [selectedVehicleForReassign, setSelectedVehicleForReassign] = useState<
    string | null
  >(null);
  const [isReassigning, setIsReassigning] = useState(false);
  const [reassignmentError, setReassignmentError] = useState<string | null>(
    null,
  );

  // Pencil selection state
  const [pencilMode, setPencilMode] = useState(false);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);

  // Load active zones
  const loadZones = useCallback(async () => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/zones?active=true&limit=100", {
        headers: { "x-company-id": companyId },
      });
      if (response.ok) {
        const data = await response.json();
        // Map API response to Zone interface (use parsedGeometry as geometry)
        const mappedZones: Zone[] = (data.data || [])
          .filter((z: { parsedGeometry: unknown }) => z.parsedGeometry)
          .map(
            (z: {
              id: string;
              name: string;
              parsedGeometry: { type: string; coordinates: number[][][] };
              color: string | null;
              active: boolean;
              vehicleCount: number;
              vehicles: Array<{ id: string; plate: string | null }>;
            }) => ({
              id: z.id,
              name: z.name,
              geometry: z.parsedGeometry,
              color: z.color,
              active: z.active,
              vehicleCount: z.vehicleCount,
              vehicles: z.vehicles || [],
            }),
          );
        setZones(mappedZones);
      }
    } catch (err) {
      console.error("Failed to fetch zones:", err);
    }
  }, [companyId]);

  // Load zones on mount
  useEffect(() => {
    loadZones();
  }, [loadZones]);

  // Get all available vehicles for reassignment
  const availableVehicles = [
    ...result.routes.map((r) => ({
      id: r.vehicleId,
      plate: r.vehiclePlate,
      routeId: r.routeId,
      driverName: r.driverName,
      hasRoute: true,
      stopCount: r.stops.length,
    })),
    ...(result.vehiclesWithoutRoutes || []).map((v) => ({
      id: v.id,
      plate: v.plate,
      routeId: null,
      driverName: null,
      hasRoute: false,
      stopCount: 0,
    })),
  ];

  // Toggle order selection for reassignment
  const toggleOrderSelection = (
    orderId: string,
    trackingId: string,
    address: string,
    vehicleId: string | null,
    vehiclePlate: string | null,
    routeId: string | null,
  ) => {
    setSelectedOrdersForReassign((prev) => {
      const exists = prev.find((o) => o.orderId === orderId);
      if (exists) {
        return prev.filter((o) => o.orderId !== orderId);
      }
      return [
        ...prev,
        { orderId, trackingId, address, vehicleId, vehiclePlate, routeId },
      ];
    });
    // Auto-enable select mode when first order is selected
    if (!isSelectMode) {
      setIsSelectMode(true);
    }
  };

  // Check if an order is selected
  const isOrderSelected = (orderId: string) => {
    return selectedOrdersForReassign.some((o) => o.orderId === orderId);
  };

  // Clear selection and exit select mode
  const clearSelection = () => {
    setSelectedOrdersForReassign([]);
    setIsSelectMode(false);
    setShowReassignModal(false);
  };

  // Open modal to confirm reassignment
  const openReassignModal = () => {
    if (selectedOrdersForReassign.length === 0) return;
    setSelectedVehicleForReassign(null);
    setReassignmentError(null);
    setShowReassignModal(true);
  };

  // Handle reassignment (supports multiple orders)
  const handleReassignment = async () => {
    if (
      selectedOrdersForReassign.length === 0 ||
      !selectedVehicleForReassign ||
      !companyId ||
      !jobId
    )
      return;

    setIsReassigning(true);
    setReassignmentError(null);

    try {
      const response = await fetch(`/api/optimization/jobs/${jobId}/reassign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId,
        },
        body: JSON.stringify({
          orders: selectedOrdersForReassign.map((o) => ({
            orderId: o.orderId,
            sourceRouteId: o.routeId,
          })),
          targetVehicleId: selectedVehicleForReassign,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Error al reasignar los pedidos");
      }

      const updatedResult = await response.json();

      // Update the result in the parent component
      if (onResultUpdate) {
        onResultUpdate(updatedResult);
      }

      // Clear selection and close modal
      clearSelection();
    } catch (error) {
      setReassignmentError(
        error instanceof Error ? error.message : "Error desconocido",
      );
    } finally {
      setIsReassigning(false);
    }
  };

  // Prepare all selectable orders for pencil mode (routes + unassigned)
  const allSelectableOrders = [
    // Orders from routes
    ...result.routes.flatMap((route) =>
      route.stops.flatMap((stop) => {
        // Handle grouped orders
        if (stop.groupedOrderIds && stop.groupedOrderIds.length > 1) {
          return stop.groupedOrderIds.map((orderId, idx) => ({
            orderId,
            trackingId: stop.groupedTrackingIds?.[idx] || stop.trackingId,
            address: stop.address,
            latitude: parseFloat(stop.latitude),
            longitude: parseFloat(stop.longitude),
            vehicleId: route.vehicleId,
            vehiclePlate: route.vehiclePlate,
            routeId: route.routeId,
          }));
        }
        return [
          {
            orderId: stop.orderId,
            trackingId: stop.trackingId,
            address: stop.address,
            latitude: parseFloat(stop.latitude),
            longitude: parseFloat(stop.longitude),
            vehicleId: route.vehicleId,
            vehiclePlate: route.vehiclePlate,
            routeId: route.routeId,
          },
        ];
      }),
    ),
    // Unassigned orders
    ...result.unassignedOrders
      .filter(
        (
          order,
        ): order is typeof order & { latitude: string; longitude: string } =>
          Boolean(order.latitude && order.longitude),
      )
      .map((order) => ({
        orderId: order.orderId,
        trackingId: order.trackingId,
        address: order.address || "Sin dirección",
        latitude: parseFloat(order.latitude),
        longitude: parseFloat(order.longitude),
        vehicleId: null,
        vehiclePlate: null,
        routeId: null,
      })),
  ];

  // Handle pencil selection complete
  const handlePencilSelectionComplete = (selectedOrderIds: string[]) => {
    // Find full order info for each selected order ID
    const newSelectedOrders = selectedOrderIds
      .map((orderId) => allSelectableOrders.find((o) => o.orderId === orderId))
      .filter((o): o is NonNullable<typeof o> => o !== undefined)
      .map((o) => ({
        orderId: o.orderId,
        trackingId: o.trackingId,
        address: o.address,
        vehicleId: o.vehicleId,
        vehiclePlate: o.vehiclePlate,
        routeId: o.routeId,
      }));

    // Add to existing selection (union, not replace)
    setSelectedOrdersForReassign((prev) => {
      const existingIds = new Set(prev.map((o) => o.orderId));
      const uniqueNew = newSelectedOrders.filter(
        (o) => !existingIds.has(o.orderId),
      );
      return [...prev, ...uniqueNew];
    });

    // Enable select mode
    setIsSelectMode(true);

    // Disable pencil mode
    setPencilMode(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
          <div className="h-6 w-px bg-border" />
          <h1 className="text-lg font-semibold">Resultados</h1>
          {isPartial && (
            <Badge
              variant="outline"
              className="text-orange-600 border-orange-600"
            >
              Parcial
            </Badge>
          )}
        </div>

        {/* KPI Strip */}
        <div className="hidden md:flex items-center gap-2">
          <KpiBadge
            icon={Truck}
            label="rutas"
            value={result.metrics.totalRoutes}
          />
          <KpiBadge
            icon={MapPin}
            label="paradas"
            value={result.metrics.totalStops}
          />
          <KpiBadge
            icon={Ruler}
            label=""
            value={`${(result.metrics.totalDistance / 1000).toFixed(0)}km`}
          />
          <KpiBadge
            icon={TrendingUp}
            label="utiliz."
            value={`${result.metrics.utilizationRate}%`}
            status={
              result.metrics.utilizationRate >= 80
                ? "success"
                : result.metrics.utilizationRate >= 50
                  ? "warning"
                  : "error"
            }
          />
          <KpiBadge
            icon={CheckCircle2}
            label="cumpl."
            value={`${result.metrics.timeWindowComplianceRate}%`}
            status={
              result.metrics.timeWindowComplianceRate >= 95
                ? "success"
                : result.metrics.timeWindowComplianceRate >= 80
                  ? "warning"
                  : "error"
            }
          />
          {result.metrics.balanceScore !== undefined && (
            <KpiBadge
              icon={BarChart3}
              label="balance"
              value={`${result.metrics.balanceScore}%`}
              status={
                result.metrics.balanceScore >= 80
                  ? "success"
                  : result.metrics.balanceScore >= 60
                    ? "warning"
                    : "error"
              }
            />
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Link href="/planificacion/historial">
            <Button variant="ghost" size="sm">
              <History className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Historial</span>
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportPlanToExcel({
                routes: result.routes,
                metrics: result.metrics,
                summary: result.summary,
              })
            }
          >
            <Download className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Exportar</span>
          </Button>
          {onReoptimize && (
            <Button variant="outline" size="sm" onClick={onReoptimize}>
              <RefreshCw className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Reoptimizar</span>
            </Button>
          )}
          {onConfirm && jobId && (
            <Button
              size="sm"
              onClick={() => setConfirmDialogOpen(true)}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Confirmar
            </Button>
          )}
        </div>
      </div>

      {/* Mobile KPI Strip */}
      <div className="flex md:hidden items-center gap-2 px-4 py-2 border-b bg-muted/30 overflow-x-auto">
        <KpiBadge icon={Truck} label="" value={result.metrics.totalRoutes} />
        <KpiBadge icon={MapPin} label="" value={result.metrics.totalStops} />
        <KpiBadge
          icon={Ruler}
          label=""
          value={`${(result.metrics.totalDistance / 1000).toFixed(0)}km`}
        />
        <KpiBadge
          icon={TrendingUp}
          label=""
          value={`${result.metrics.utilizationRate}%`}
          status={
            result.metrics.utilizationRate >= 80
              ? "success"
              : result.metrics.utilizationRate >= 50
                ? "warning"
                : "error"
          }
        />
      </div>

      {/* Main Content - Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Routes Panel */}
        <div className="w-96 lg:w-[450px] xl:w-[500px] border-r flex flex-col shrink-0">
          <div className="px-4 py-2 border-b bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {result.routes.length} Rutas
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDuration(result.metrics.totalDuration)} total
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {result.routes.map((route, index) => (
              <CompactRouteCard
                key={route.routeId}
                route={route}
                routeNumber={index + 1}
                routeColor={ROUTE_COLORS[index % ROUTE_COLORS.length]}
                isSelected={selectedRouteId === route.routeId}
                isExpanded={expandedRouteId === route.routeId}
                onSelect={() => setSelectedRouteId(route.routeId)}
                onToggle={() =>
                  setExpandedRouteId(
                    expandedRouteId === route.routeId ? null : route.routeId,
                  )
                }
                onToggleOrderSelection={(orderId, trackingId, address) =>
                  toggleOrderSelection(
                    orderId,
                    trackingId,
                    address,
                    route.vehicleId,
                    route.vehiclePlate,
                    route.routeId,
                  )
                }
                isOrderSelected={isOrderSelected}
              />
            ))}
          </div>

          {/* Unassigned Orders - Collapsible */}
          {result.unassignedOrders.length > 0 && (
            <div className="p-3 border-t shrink-0">
              <UnassignedOrdersPanel
                orders={result.unassignedOrders}
                isExpanded={unassignedExpanded}
                onToggle={() => setUnassignedExpanded(!unassignedExpanded)}
                onToggleOrderSelection={(orderId, trackingId, address) =>
                  toggleOrderSelection(
                    orderId,
                    trackingId,
                    address,
                    null,
                    null,
                    null,
                  )
                }
                isOrderSelected={isOrderSelected}
              />
            </div>
          )}

          {/* Selection Action Bar */}
          {selectedOrdersForReassign.length > 0 && (
            <div className="p-3 border-t bg-primary/5 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {selectedOrdersForReassign.length} seleccionados
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSelection}
                    className="h-7 px-2"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Limpiar
                  </Button>
                </div>
                <Button size="sm" onClick={openReassignModal}>
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Reasignar
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Map Panel */}
        <div className="flex-1 relative">
          <RouteMap
            routes={result.routes}
            depot={result.depot}
            unassignedOrders={result.unassignedOrders}
            vehiclesWithoutRoutes={result.vehiclesWithoutRoutes}
            zones={showZones ? zones : []}
            selectedRouteId={selectedRouteId}
            onRouteSelect={(routeId) => setSelectedRouteId(routeId)}
            variant="fullscreen"
            onMapReady={setMapInstance}
            highlightedOrderIds={selectedOrdersForReassign.map(
              (o) => o.orderId,
            )}
          />

          {/* Pencil Select Overlay */}
          <PencilSelectOverlay
            map={mapInstance}
            isActive={pencilMode}
            onToggle={() => setPencilMode(!pencilMode)}
            onSelectionComplete={handlePencilSelectionComplete}
            allOrders={allSelectableOrders}
          />

          {/* Zone Toggle Button */}
          {zones.length > 0 && (
            <div className="absolute top-4 right-14 z-10">
              <button
                type="button"
                onClick={() => setShowZones(!showZones)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg text-sm font-medium transition-colors ${
                  showZones
                    ? "bg-primary text-primary-foreground"
                    : "bg-background/95 backdrop-blur text-muted-foreground hover:text-foreground"
                }`}
              >
                {showZones ? (
                  <Eye className="w-4 h-4" />
                ) : (
                  <EyeOff className="w-4 h-4" />
                )}
                Zonas ({zones.length})
              </button>
            </div>
          )}

          {/* Optimization Summary Overlay */}
          <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-72">
            <Card className="bg-background/95 backdrop-blur shadow-lg">
              <CardContent className="p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                  <span>Optimizado: {result.summary.objective}</span>
                  <span>
                    {(result.summary.processingTimeMs / 1000).toFixed(1)}s
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(result.summary.optimizedAt).toLocaleString()}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Reassignment Dialog (Multi-select) */}
      <Dialog
        open={showReassignModal}
        onOpenChange={(open) => !open && setShowReassignModal(false)}
      >
        <DialogContent className="max-w-[500px] overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              Reasignar{" "}
              {selectedOrdersForReassign.length === 1
                ? "Pedido"
                : `${selectedOrdersForReassign.length} Pedidos`}
            </DialogTitle>
            <DialogDescription>
              Selecciona el vehículo destino para{" "}
              {selectedOrdersForReassign.length === 1
                ? "este pedido"
                : "estos pedidos"}
              .
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-hidden">
            {/* Selected orders list */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-muted-foreground">
                Pedidos seleccionados:
              </label>
              <div className="max-h-24 overflow-y-auto border rounded-lg p-2 space-y-1">
                {selectedOrdersForReassign.map((order) => (
                  <div
                    key={order.orderId}
                    className="flex items-center gap-2 text-xs"
                  >
                    <Package className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="font-medium">{order.trackingId}</span>
                    {order.vehiclePlate && (
                      <span className="text-muted-foreground">
                        (desde {order.vehiclePlate})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Vehicle selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Reasignar a:</label>
              <div className="max-h-48 overflow-y-auto space-y-1 border rounded-lg p-2">
                {availableVehicles.map((vehicle) => (
                  <button
                    key={vehicle.id}
                    type="button"
                    onClick={() => setSelectedVehicleForReassign(vehicle.id)}
                    className={cn(
                      "w-full flex items-center justify-between p-2 rounded text-left text-sm transition-colors",
                      selectedVehicleForReassign === vehicle.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent",
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Truck className="h-4 w-4 shrink-0" />
                      <span className="font-medium truncate">
                        {vehicle.plate}
                      </span>
                      {vehicle.driverName && (
                        <span className="text-xs opacity-70 truncate">
                          ({vehicle.driverName})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs shrink-0 ml-2">
                      {vehicle.hasRoute ? (
                        <span className="opacity-70">
                          {vehicle.stopCount} paradas
                        </span>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Sin ruta
                        </Badge>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Error message */}
            {reassignmentError && (
              <div className="p-2 bg-destructive/10 border border-destructive/30 rounded text-sm text-destructive">
                {reassignmentError}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowReassignModal(false)}
              disabled={isReassigning}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleReassignment}
              disabled={!selectedVehicleForReassign || isReassigning}
            >
              {isReassigning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Reasignando...
                </>
              ) : (
                <>
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Reasignar{" "}
                  {selectedOrdersForReassign.length > 1
                    ? `(${selectedOrdersForReassign.length})`
                    : ""}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      {jobId && companyId && (
        <PlanConfirmationDialog
          open={confirmDialogOpen}
          onOpenChange={setConfirmDialogOpen}
          jobId={jobId}
          companyId={companyId}
          onConfirmed={() => {
            setConfirmDialogOpen(false);
            if (onConfirm) {
              onConfirm();
            }
          }}
        />
      )}
    </div>
  );
}
