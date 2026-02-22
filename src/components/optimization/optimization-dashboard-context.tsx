"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useCompanyContext } from "@/hooks/use-company-context";
import { useToast } from "@/hooks/use-toast";
import type maplibregl from "maplibre-gl";

// Types
export interface RouteData {
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
    groupedOrderIds?: string[];
    groupedTrackingIds?: string[];
  }>;
  totalDistance: number;
  totalDuration: number;
  totalServiceTime?: number;
  totalTravelTime?: number;
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

export interface Zone {
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

export interface OptimizationResult {
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
    engineUsed?: string;
  };
  depot?: {
    latitude: number;
    longitude: number;
  };
}

export interface SelectableOrder {
  orderId: string;
  trackingId: string;
  address: string;
  vehicleId: string | null;
  vehiclePlate: string | null;
  routeId: string | null;
}

export interface AvailableVehicle {
  id: string;
  plate: string;
  routeId: string | null;
  driverName: string | null;
  hasRoute: boolean;
  stopCount: number;
}

// State interfaces
export interface DashboardState {
  selectedRouteId: string | null;
  expandedRouteId: string | null;
  confirmDialogOpen: boolean;
  unassignedExpanded: boolean;
  zones: Zone[];
  showZones: boolean;
  selectedOrdersForReassign: SelectableOrder[];
  isSelectMode: boolean;
  showReassignModal: boolean;
  selectedVehicleForReassign: string | null;
  isReassigning: boolean;
  reassignmentError: string | null;
  pencilMode: boolean;
  mapInstance: maplibregl.Map | null;
  isSwapping: boolean;
}

export interface DashboardActions {
  setSelectedRouteId: (id: string | null) => void;
  setExpandedRouteId: (id: string | null) => void;
  setConfirmDialogOpen: (open: boolean) => void;
  setUnassignedExpanded: (expanded: boolean) => void;
  setShowZones: (show: boolean) => void;
  setPencilMode: (active: boolean) => void;
  setMapInstance: (map: maplibregl.Map | null) => void;
  toggleOrderSelection: (
    orderId: string,
    trackingId: string,
    address: string,
    vehicleId: string | null,
    vehiclePlate: string | null,
    routeId: string | null,
  ) => void;
  isOrderSelected: (orderId: string) => boolean;
  clearSelection: () => void;
  openReassignModal: () => void;
  setSelectedVehicleForReassign: (vehicleId: string | null) => void;
  handleReassignment: () => Promise<void>;
  handlePencilSelectionComplete: (selectedOrderIds: string[]) => void;
  swapVehicleRoutes: (vehicleAId: string, vehicleBId: string) => Promise<void>;
}

export interface DashboardMeta {
  jobId?: string;
  result: OptimizationResult;
  isPartial?: boolean;
  jobStatus?: string;
  onReoptimize?: () => void;
  onConfirm?: () => void;
  onBack?: () => void;
  onResultUpdate?: (newResult: OptimizationResult) => void;
}

export interface DashboardDerived {
  availableVehicles: AvailableVehicle[];
  allSelectableOrders: Array<{
    orderId: string;
    trackingId: string;
    address: string;
    latitude: number;
    longitude: number;
    vehicleId: string | null;
    vehiclePlate: string | null;
    routeId: string | null;
  }>;
  companyId: string | null;
}

interface DashboardContextValue {
  state: DashboardState;
  actions: DashboardActions;
  meta: DashboardMeta;
  derived: DashboardDerived;
}

const DashboardContext = createContext<DashboardContextValue | undefined>(
  undefined,
);

export interface DashboardProviderProps {
  children: ReactNode;
  jobId?: string;
  result: OptimizationResult;
  isPartial?: boolean;
  jobStatus?: string;
  onReoptimize?: () => void;
  onConfirm?: () => void;
  onBack?: () => void;
  onResultUpdate?: (newResult: OptimizationResult) => void;
}

export function OptimizationDashboardProvider({
  children,
  jobId,
  result,
  isPartial,
  jobStatus,
  onReoptimize,
  onConfirm,
  onBack,
  onResultUpdate,
}: DashboardProviderProps) {
  const { effectiveCompanyId: companyId } = useCompanyContext();
  const { toast } = useToast();

  // UI State
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
  const [reassignmentError, setReassignmentError] = useState<string | null>(null);

  // Pencil/Map state
  const [pencilMode, setPencilMode] = useState(false);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);

  // Swap state
  const [isSwapping, setIsSwapping] = useState(false);

  // Load zones
  const loadZones = useCallback(async () => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/zones?active=true&limit=100", {
        headers: { "x-company-id": companyId },
      });
      if (response.ok) {
        const data = await response.json();
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

  useEffect(() => {
    loadZones();
  }, [loadZones]);

  // Derived: Available vehicles
  const availableVehicles: AvailableVehicle[] = [
    ...result.routes.map((r) => ({
      id: r.vehicleId,
      plate: r.vehiclePlate,
      routeId: r.routeId,
      driverName: r.driverName || null,
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

  // Derived: All selectable orders for pencil mode
  const allSelectableOrders = [
    ...result.routes.flatMap((route) =>
      route.stops.flatMap((stop) => {
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

  // Actions
  const toggleOrderSelection = useCallback(
    (
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
      if (!isSelectMode) {
        setIsSelectMode(true);
      }
    },
    [isSelectMode],
  );

  const isOrderSelected = useCallback(
    (orderId: string) => {
      return selectedOrdersForReassign.some((o) => o.orderId === orderId);
    },
    [selectedOrdersForReassign],
  );

  const clearSelection = useCallback(() => {
    setSelectedOrdersForReassign([]);
    setIsSelectMode(false);
    setShowReassignModal(false);
  }, []);

  const openReassignModal = useCallback(() => {
    if (selectedOrdersForReassign.length === 0) return;
    setSelectedVehicleForReassign(null);
    setReassignmentError(null);
    setShowReassignModal(true);
  }, [selectedOrdersForReassign.length]);

  const handleReassignment = useCallback(async () => {
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

      if (onResultUpdate) {
        onResultUpdate(updatedResult);
      }

      clearSelection();
    } catch (error) {
      setReassignmentError(
        error instanceof Error ? error.message : "Error desconocido",
      );
    } finally {
      setIsReassigning(false);
    }
  }, [
    selectedOrdersForReassign,
    selectedVehicleForReassign,
    companyId,
    jobId,
    onResultUpdate,
    clearSelection,
  ]);

  const handlePencilSelectionComplete = useCallback(
    (selectedOrderIds: string[]) => {
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

      setSelectedOrdersForReassign((prev) => {
        const existingIds = new Set(prev.map((o) => o.orderId));
        const uniqueNew = newSelectedOrders.filter(
          (o) => !existingIds.has(o.orderId),
        );
        return [...prev, ...uniqueNew];
      });

      setIsSelectMode(true);
      setPencilMode(false);
    },
    [allSelectableOrders],
  );

  const swapVehicleRoutes = useCallback(
    async (vehicleAId: string, vehicleBId: string) => {
      if (!companyId || !jobId) return;

      setIsSwapping(true);
      try {
        const response = await fetch(
          `/api/optimization/jobs/${jobId}/swap-vehicles`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-company-id": companyId,
            },
            body: JSON.stringify({ vehicleAId, vehicleBId }),
          },
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.error || "Error al intercambiar las rutas",
          );
        }

        const updatedResult = await response.json();

        if (onResultUpdate) {
          onResultUpdate(updatedResult);
        }

        const plateA =
          result.routes.find((r) => r.vehicleId === vehicleAId)
            ?.vehiclePlate || vehicleAId;
        const plateB =
          result.routes.find((r) => r.vehicleId === vehicleBId)
            ?.vehiclePlate || vehicleBId;

        toast({
          title: "Rutas intercambiadas exitosamente",
          description: `Se intercambiaron las rutas entre ${plateA} y ${plateB}`,
        });
      } catch (error) {
        toast({
          title: "Error al intercambiar rutas",
          description:
            error instanceof Error ? error.message : "Error desconocido",
          variant: "destructive",
        });
      } finally {
        setIsSwapping(false);
      }
    },
    [companyId, jobId, onResultUpdate, result.routes, toast],
  );

  const state: DashboardState = {
    selectedRouteId,
    expandedRouteId,
    confirmDialogOpen,
    unassignedExpanded,
    zones,
    showZones,
    selectedOrdersForReassign,
    isSelectMode,
    showReassignModal,
    selectedVehicleForReassign,
    isReassigning,
    reassignmentError,
    pencilMode,
    mapInstance,
    isSwapping,
  };

  const actions: DashboardActions = {
    setSelectedRouteId,
    setExpandedRouteId,
    setConfirmDialogOpen,
    setUnassignedExpanded,
    setShowZones,
    setPencilMode,
    setMapInstance,
    toggleOrderSelection,
    isOrderSelected,
    clearSelection,
    openReassignModal,
    setSelectedVehicleForReassign,
    handleReassignment,
    handlePencilSelectionComplete,
    swapVehicleRoutes,
  };

  const meta: DashboardMeta = {
    jobId,
    result,
    isPartial,
    jobStatus,
    onReoptimize,
    onConfirm,
    onBack,
    onResultUpdate,
  };

  const derived: DashboardDerived = {
    availableVehicles,
    allSelectableOrders,
    companyId,
  };

  return (
    <DashboardContext value={{ state, actions, meta, derived }}>
      {children}
    </DashboardContext>
  );
}

export function useOptimizationDashboard(): DashboardContextValue {
  const context = use(DashboardContext);
  if (context === undefined) {
    throw new Error(
      "useOptimizationDashboard must be used within an OptimizationDashboardProvider",
    );
  }
  return context;
}

// Utility functions
export function formatDistance(meters: number) {
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
