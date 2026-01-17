"use client";

import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Route,
  Search,
  Settings2,
  Truck,
  Upload,
  User,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ProtectedPage } from "@/components/auth/protected-page";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompanyContext } from "@/hooks/use-company-context";
import { CompanySelector } from "@/components/company-selector";

// Dynamically import map component to avoid SSR issues
const PlanningMap = dynamic(
  () =>
    import("@/components/planificacion/planning-map").then(
      (mod) => mod.PlanningMap,
    ),
  {
    ssr: false,
    loading: () => <div className="h-full bg-muted animate-pulse rounded-lg" />,
  },
);

// Types
interface Vehicle {
  id: string;
  name: string;
  plate: string | null;
  type: string | null;
  weightCapacity: number | null;
  volumeCapacity: number | null;
  maxOrders: number;
  status: string;
  originAddress: string | null;
  originLatitude: string | null;
  originLongitude: string | null;
  assignedDriver: {
    id: string;
    name: string;
  } | null;
  fleets: Array<{ id: string; name: string }>;
}

interface Fleet {
  id: string;
  name: string;
}

interface Order {
  id: string;
  trackingId: string;
  customerName: string | null;
  address: string;
  latitude: string | null;
  longitude: string | null;
  status: string;
  priority?: string | null;
  weightRequired: number | null;
  volumeRequired: number | null;
  timeWindowPresetId: string | null;
  presetName?: string | null;
  notes?: string | null;
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

// Step configuration
const STEPS = [
  { id: "vehiculos", label: "Vehículos", icon: Truck },
  { id: "visitas", label: "Visitas", icon: Package },
  { id: "configuracion", label: "Configuración", icon: Settings2 },
] as const;

type StepId = (typeof STEPS)[number]["id"];

// Optimization objectives
const OBJECTIVES = [
  {
    value: "BALANCED",
    label: "Balanceado",
    description: "Equilibra tiempo y distancia",
  },
  {
    value: "TIME",
    label: "Minimizar tiempo",
    description: "Prioriza duración total",
  },
  {
    value: "DISTANCE",
    label: "Minimizar distancia",
    description: "Prioriza km recorridos",
  },
];

function PlanificacionPageContent() {
  const router = useRouter();
  const {
    effectiveCompanyId: companyId,
    isReady,
    isSystemAdmin,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    authCompanyId,
  } = useCompanyContext();

  // Step management
  const [currentStep, setCurrentStep] = useState<StepId>("vehiculos");
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(new Set());

  // Vehicles state
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [fleetFilter, setFleetFilter] = useState("ALL");
  const [vehiclesLoading, setVehiclesLoading] = useState(true);

  // Orders state
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderTab, setOrderTab] = useState("todas");
  const [ordersLoading, setOrdersLoading] = useState(true);

  // Configuration state
  const [planDate, setPlanDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  });
  const [planTime, setPlanTime] = useState("08:00");
  const [objective, setObjective] = useState("BALANCED");
  const [serviceTime, setServiceTime] = useState(10);
  const [capacityEnabled, setCapacityEnabled] = useState(true);

  // Zones state
  const [zones, setZones] = useState<Zone[]>([]);
  const [showZones, setShowZones] = useState(true);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CSV Upload state
  const [showCsvUpload, setShowCsvUpload] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvPreview, setCsvPreview] = useState<
    Array<{
      trackcode: string;
      direccion: string;
      referencia: string;
      departamento: string;
      provincia: string;
      distrito: string;
      longitud: string;
      latitud: string;
    }>
  >([]);

  // Order edit modal state
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editOrderData, setEditOrderData] = useState({
    address: "",
    latitude: "",
    longitude: "",
  });
  const [isUpdatingOrder, setIsUpdatingOrder] = useState(false);
  const [updateOrderError, setUpdateOrderError] = useState<string | null>(null);

  // Load fleets
  const loadFleets = useCallback(async () => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/fleets?limit=100&active=true", {
        headers: { "x-company-id": companyId },
      });
      if (response.ok) {
        const data = await response.json();
        setFleets(data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch fleets:", err);
    }
  }, [companyId]);

  // Load vehicles
  const loadVehicles = useCallback(async () => {
    if (!companyId) return;
    setVehiclesLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (fleetFilter !== "ALL") {
        params.append("fleetId", fleetFilter);
      }
      const response = await fetch(`/api/vehicles/available?${params}`, {
        headers: { "x-company-id": companyId },
      });
      if (response.ok) {
        const data = await response.json();
        setVehicles(data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch vehicles:", err);
    } finally {
      setVehiclesLoading(false);
    }
  }, [companyId, fleetFilter]);

  // Load pending orders (paginated to handle large datasets)
  const loadOrders = useCallback(async () => {
    if (!companyId) return;
    setOrdersLoading(true);
    try {
      const limit = 100;
      const maxOrders = 5000;
      const maxBatches = Math.ceil(maxOrders / limit);

      // Fetch first batch to check total
      const firstResponse = await fetch(
        `/api/orders?status=PENDING&active=true&limit=${limit}&offset=0`,
        { headers: { "x-company-id": companyId } },
      );

      if (!firstResponse.ok) {
        const errorData = await firstResponse.json();
        console.error("Failed to fetch orders:", errorData);
        return;
      }

      const firstData = await firstResponse.json();
      const firstBatch = firstData.data || [];

      // If first batch is not full, we have all orders
      if (firstBatch.length < limit) {
        setOrders(firstBatch);
        setSelectedOrderIds(firstBatch.map((o: Order) => o.id));
        return;
      }

      // Need more batches - fetch remaining in parallel
      const batchPromises: Promise<Order[]>[] = [];
      for (let batch = 1; batch < maxBatches; batch++) {
        const offset = batch * limit;
        batchPromises.push(
          fetch(
            `/api/orders?status=PENDING&active=true&limit=${limit}&offset=${offset}`,
            { headers: { "x-company-id": companyId } },
          ).then(async (res) => {
            if (!res.ok) return [];
            const data = await res.json();
            return data.data || [];
          }),
        );
      }

      // Execute all remaining batches in parallel
      const batchResults = await Promise.all(batchPromises);

      // Combine results, stop at first incomplete batch
      const allOrders: Order[] = [...firstBatch];
      for (const batch of batchResults) {
        allOrders.push(...batch);
        if (batch.length < limit) break; // No more data
      }

      console.log(`Orders loaded: ${allOrders.length}`);
      setOrders(allOrders);
      setSelectedOrderIds(allOrders.map((o: Order) => o.id));
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    } finally {
      setOrdersLoading(false);
    }
  }, [companyId]);

  // Load active zones
  const loadZones = useCallback(async () => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/zones?active=true&limit=100", {
        headers: { "x-company-id": companyId },
      });
      if (response.ok) {
        const data = await response.json();
        // Map API response to our Zone interface (use parsedGeometry as geometry)
        const mappedZones: Zone[] = (data.data || [])
          .filter((z: { parsedGeometry: unknown }) => z.parsedGeometry) // Only zones with valid geometry
          .map((z: {
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
          }));
        setZones(mappedZones);
      }
    } catch (err) {
      console.error("Failed to fetch zones:", err);
    }
  }, [companyId]);

  // Parse CSV file (supports comma, tab, and semicolon delimiters)
  const parseCSV = useCallback((text: string) => {
    const lines = text.split("\n").filter((line) => line.trim());
    if (lines.length < 2) {
      throw new Error("El archivo CSV debe tener al menos una fila de encabezados y una de datos");
    }

    // Auto-detect delimiter from first line
    const firstLine = lines[0];
    let delimiter = ",";
    if (firstLine.includes("\t")) {
      delimiter = "\t";
    } else if (firstLine.includes(";")) {
      delimiter = ";";
    }

    // Parse headers (first line)
    const headers = firstLine.split(delimiter).map((h) => h.trim().toLowerCase());
    const requiredHeaders = [
      "trackcode",
      "direccion",
      "referencia",
      "departamento",
      "provincia",
      "distrito",
      "longitud",
      "latitud",
    ];

    // Check for missing headers
    const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));
    if (missingHeaders.length > 0) {
      throw new Error(`Faltan columnas requeridas: ${missingHeaders.join(", ")}`);
    }

    // Get column indexes
    const indexes = {
      trackcode: headers.indexOf("trackcode"),
      direccion: headers.indexOf("direccion"),
      referencia: headers.indexOf("referencia"),
      departamento: headers.indexOf("departamento"),
      provincia: headers.indexOf("provincia"),
      distrito: headers.indexOf("distrito"),
      longitud: headers.indexOf("longitud"),
      latitud: headers.indexOf("latitud"),
    };

    // Parse data rows
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(delimiter).map((v) => v.trim());
      if (values.length >= requiredHeaders.length) {
        data.push({
          trackcode: values[indexes.trackcode] || "",
          direccion: values[indexes.direccion] || "",
          referencia: values[indexes.referencia] || "",
          departamento: values[indexes.departamento] || "",
          provincia: values[indexes.provincia] || "",
          distrito: values[indexes.distrito] || "",
          longitud: values[indexes.longitud] || "",
          latitud: values[indexes.latitud] || "",
        });
      }
    }

    return data;
  }, []);

  // Handle CSV file selection
  const handleCsvFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setCsvFile(file);
      setCsvError(null);

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const data = parseCSV(text);
          setCsvPreview(data);
        } catch (err) {
          setCsvError(err instanceof Error ? err.message : "Error al leer el archivo");
          setCsvPreview([]);
        }
      };
      reader.onerror = () => {
        setCsvError("Error al leer el archivo");
      };
      reader.readAsText(file);
    },
    [parseCSV],
  );

  // Upload CSV orders using batch endpoint
  const handleCsvUpload = useCallback(async () => {
    if (!companyId || csvPreview.length === 0) return;

    setCsvUploading(true);
    setCsvError(null);

    try {
      // Clean coordinate values - remove any non-numeric characters except minus and dot
      const cleanCoord = (val: string) => {
        return val.replace(",", ".").replace(/[^\d.-]/g, "");
      };

      // Prepare orders for batch upload
      const validOrders: Array<{
        trackingId: string;
        address: string;
        latitude: string;
        longitude: string;
        notes?: string;
      }> = [];
      const skippedRows: string[] = [];

      for (const row of csvPreview) {
        // Validate required fields
        if (!row.trackcode?.trim()) {
          skippedRows.push("Fila sin trackcode");
          continue;
        }

        if (!row.latitud?.trim() || !row.longitud?.trim()) {
          skippedRows.push(`${row.trackcode}: Sin coordenadas`);
          continue;
        }

        // Build full address
        const fullAddress = [
          row.direccion,
          row.distrito,
          row.provincia,
          row.departamento,
        ]
          .filter(Boolean)
          .join(", ");

        if (!fullAddress.trim()) {
          skippedRows.push(`${row.trackcode}: Sin dirección`);
          continue;
        }

        const lat = cleanCoord(row.latitud);
        const lng = cleanCoord(row.longitud);

        // Validate coordinate format
        if (!/^-?\d+\.?\d*$/.test(lat) || !/^-?\d+\.?\d*$/.test(lng)) {
          skippedRows.push(`${row.trackcode}: Coordenadas inválidas`);
          continue;
        }

        const orderData: {
          trackingId: string;
          address: string;
          latitude: string;
          longitude: string;
          notes?: string;
        } = {
          trackingId: String(row.trackcode).trim().slice(0, 50),
          address: fullAddress.slice(0, 500),
          latitude: lat,
          longitude: lng,
        };

        const notes = row.referencia?.trim()?.slice(0, 500);
        if (notes) {
          orderData.notes = notes;
        }

        validOrders.push(orderData);
      }

      if (validOrders.length === 0) {
        setCsvError(`No hay órdenes válidas para subir.\n${skippedRows.slice(0, 5).join("\n")}`);
        return;
      }

      console.log(`Uploading ${validOrders.length} orders in batch...`);

      // Send batch request
      const response = await fetch("/api/orders/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId,
        },
        body: JSON.stringify({
          orders: validOrders,
          skipDuplicates: true,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        // Reload orders
        await loadOrders();

        // Build success message
        const messages: string[] = [];
        if (result.created > 0) messages.push(`${result.created} órdenes creadas`);
        if (result.skipped > 0) messages.push(`${result.skipped} duplicados saltados`);
        if (result.invalid > 0) messages.push(`${result.invalid} inválidos`);
        if (skippedRows.length > 0) messages.push(`${skippedRows.length} filas sin datos`);

        if (result.skipped > 0 || result.invalid > 0 || skippedRows.length > 0) {
          const details: string[] = [];
          if (result.duplicates?.length > 0) {
            details.push(`Duplicados: ${result.duplicates.slice(0, 3).join(", ")}${result.duplicates.length > 3 ? "..." : ""}`);
          }
          if (skippedRows.length > 0) {
            details.push(...skippedRows.slice(0, 3));
          }
          setCsvError(`${messages.join(", ")}\n${details.join("\n")}`);
        }

        // Close modal if successful
        if (result.created > 0) {
          setShowCsvUpload(false);
          setCsvFile(null);
          setCsvPreview([]);
        }
      } else {
        // Handle error
        let errorMsg = result.error || "Error al subir órdenes";
        if (result.details) {
          const details = result.details
            .map((d: { field?: string; message?: string }) => `${d.field}: ${d.message}`)
            .join(", ");
          errorMsg = `${errorMsg}: ${details}`;
        }
        setCsvError(errorMsg);
      }
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : "Error al subir órdenes");
    } finally {
      setCsvUploading(false);
    }
  }, [companyId, csvPreview, loadOrders]);

  // Initial data load - fetch all in parallel for better performance
  useEffect(() => {
    if (companyId) {
      // Use Promise.all to fetch all data in parallel (async-parallel rule)
      Promise.all([loadFleets(), loadVehicles(), loadOrders(), loadZones()]);
    }
  }, [companyId, loadFleets, loadVehicles, loadOrders, loadZones]);

  // Filtered vehicles
  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      const searchLower = vehicleSearch.toLowerCase();
      const matchesSearch =
        !vehicleSearch ||
        v.name.toLowerCase().includes(searchLower) ||
        (v.plate?.toLowerCase().includes(searchLower) ?? false) ||
        (v.assignedDriver?.name.toLowerCase().includes(searchLower) ?? false);
      return matchesSearch;
    });
  }, [vehicles, vehicleSearch]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    let filtered = orders;

    // Filter by tab
    if (orderTab === "alertas") {
      filtered = filtered.filter((o) => !o.latitude || !o.longitude);
    } else if (orderTab === "conHorario") {
      filtered = filtered.filter((o) => o.timeWindowPresetId);
    }

    // Filter by search
    if (orderSearch) {
      const searchLower = orderSearch.toLowerCase();
      filtered = filtered.filter(
        (o) =>
          o.trackingId.toLowerCase().includes(searchLower) ||
          (o.customerName?.toLowerCase().includes(searchLower) ?? false) ||
          o.address.toLowerCase().includes(searchLower),
      );
    }

    return filtered;
  }, [orders, orderTab, orderSearch]);

  // Orders with issues (no coordinates)
  const ordersWithIssues = useMemo(
    () => orders.filter((o) => !o.latitude || !o.longitude),
    [orders],
  );

  // Open order edit modal
  const openEditOrder = useCallback((order: Order) => {
    setEditingOrder(order);
    setEditOrderData({
      address: order.address || "",
      latitude: order.latitude || "",
      longitude: order.longitude || "",
    });
    setUpdateOrderError(null);
  }, []);

  // Save order changes
  const saveOrderChanges = useCallback(async () => {
    if (!editingOrder || !companyId) return;

    setIsUpdatingOrder(true);
    setUpdateOrderError(null);

    try {
      const response = await fetch(`/api/orders/${editingOrder.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId,
        },
        body: JSON.stringify({
          address: editOrderData.address,
          latitude: editOrderData.latitude || null,
          longitude: editOrderData.longitude || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Error al actualizar el pedido");
      }

      // Update the order in the local state
      setOrders((prev) =>
        prev.map((o) =>
          o.id === editingOrder.id
            ? {
                ...o,
                address: editOrderData.address,
                latitude: editOrderData.latitude || null,
                longitude: editOrderData.longitude || null,
              }
            : o,
        ),
      );

      setEditingOrder(null);
    } catch (err) {
      setUpdateOrderError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setIsUpdatingOrder(false);
    }
  }, [editingOrder, companyId, editOrderData]);

  // Create Sets for O(1) lookups - React Compiler handles memoization automatically
  const selectedVehicleIdsSet = new Set(selectedVehicleIds);
  const selectedOrderIdsSet = new Set(selectedOrderIds);

  // Selected vehicles data for map - React Compiler handles memoization
  const selectedVehicles = vehicles.filter((v) => selectedVehicleIdsSet.has(v.id));

  // Selected orders data for map - React Compiler handles memoization
  const selectedOrders = orders.filter((o) => selectedOrderIdsSet.has(o.id));

  // Step navigation
  const goToStep = (step: StepId) => {
    setCurrentStep(step);
  };

  const nextStep = () => {
    const currentIndex = STEPS.findIndex((s) => s.id === currentStep);
    if (currentIndex < STEPS.length - 1) {
      setCompletedSteps((prev) => new Set([...prev, currentStep]));
      setCurrentStep(STEPS[currentIndex + 1].id);
    }
  };

  const prevStep = () => {
    const currentIndex = STEPS.findIndex((s) => s.id === currentStep);
    if (currentIndex > 0) {
      setCurrentStep(STEPS[currentIndex - 1].id);
    }
  };

  // Vehicle selection handlers
  const toggleVehicle = (id: string) => {
    setSelectedVehicleIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
  };

  const selectAllVehicles = () => {
    const allSelected = filteredVehicles.every((v) =>
      selectedVehicleIdsSet.has(v.id),
    );
    if (allSelected) {
      const filteredSet = new Set(filteredVehicles.map((v) => v.id));
      setSelectedVehicleIds((prev) =>
        prev.filter((id) => !filteredSet.has(id)),
      );
    } else {
      const newIds = filteredVehicles.map((v) => v.id);
      setSelectedVehicleIds((prev) => [...new Set([...prev, ...newIds])]);
    }
  };

  // Order selection handlers
  const toggleOrder = (id: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((o) => o !== id) : [...prev, id],
    );
  };

  const selectAllOrders = () => {
    const allSelected = filteredOrders.every((o) =>
      selectedOrderIdsSet.has(o.id),
    );
    if (allSelected) {
      const filteredSet = new Set(filteredOrders.map((o) => o.id));
      setSelectedOrderIds((prev) =>
        prev.filter((id) => !filteredSet.has(id)),
      );
    } else {
      const newIds = filteredOrders.map((o) => o.id);
      setSelectedOrderIds((prev) => [...new Set([...prev, ...newIds])]);
    }
  };

  // Submit optimization
  const handleSubmit = async () => {
    if (selectedVehicleIds.length === 0) {
      setError("Selecciona al menos un vehículo");
      return;
    }
    if (selectedOrderIds.length === 0) {
      setError("Selecciona al menos una visita");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Get driver IDs from selected vehicles
      const driverIds = selectedVehicles
        .filter((v) => v.assignedDriver)
        .map((v) => v.assignedDriver?.id)
        .filter((id): id is string => id !== undefined);

      // First, create configuration
      const configResponse = await fetch("/api/optimization/configure", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId ?? "",
        },
        body: JSON.stringify({
          name: `Plan ${planDate} ${planTime}`,
          // Use first vehicle's origin as depot if available, otherwise use a default
          depotLatitude: selectedVehicles[0]?.originLatitude || "-12.0464",
          depotLongitude: selectedVehicles[0]?.originLongitude || "-77.0428",
          depotAddress: selectedVehicles[0]?.originAddress || "Depot",
          selectedVehicleIds: JSON.stringify(selectedVehicleIds),
          selectedDriverIds: JSON.stringify(driverIds),
          selectedOrderIds: JSON.stringify(selectedOrderIds),
          objective,
          capacityEnabled,
          workWindowStart: planTime,
          workWindowEnd: "20:00",
          serviceTimeMinutes: serviceTime,
          timeWindowStrictness: "SOFT",
          penaltyFactor: 5,
        }),
      });

      if (!configResponse.ok) {
        const data = await configResponse.json();
        throw new Error(data.error || "Error al crear la configuración");
      }

      const configData = await configResponse.json();
      router.push(`/planificacion/${configData.data.id}/results`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al iniciar la optimización",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Validation for step completion
  const canProceedFromVehiculos = selectedVehicleIds.length > 0;
  const canProceedFromVisitas = selectedOrderIds.length > 0;

  if (!isReady) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Planificación de Rutas</h1>
            <p className="text-sm text-muted-foreground">
              Optimiza las rutas de entrega para tu flota
            </p>
          </div>
          <CompanySelector
            companies={companies}
            selectedCompanyId={selectedCompanyId}
            authCompanyId={authCompanyId}
            onCompanyChange={setSelectedCompanyId}
            isSystemAdmin={isSystemAdmin}
          />

          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {STEPS.map((step, index) => {
              const isActive = step.id === currentStep;
              const isCompleted = completedSteps.has(step.id);
              const StepIcon = step.icon;

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => goToStep(step.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-md"
                      : isCompleted
                        ? "bg-primary/10 text-primary hover:bg-primary/20"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isCompleted && !isActive ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <StepIcon className="w-4 h-4" />
                    )}
                    <span className="font-medium">{step.label}</span>
                  </div>
                  {index < STEPS.length - 1 && (
                    <ChevronRight className="w-4 h-4 ml-2 text-muted-foreground" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main content - Split layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel - Controls */}
        <div className="w-[450px] border-r bg-background overflow-y-auto">
          {error && (
            <div className="m-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Step: Vehículos */}
          {currentStep === "vehiculos" && (
            <div className="p-4 space-y-4">
              {/* Date/Time selector */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Fecha y hora de inicio
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="plan-date" className="text-xs">
                        Fecha
                      </Label>
                      <Input
                        id="plan-date"
                        type="date"
                        value={planDate}
                        onChange={(e) => setPlanDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="plan-time" className="text-xs">
                        Hora inicio
                      </Label>
                      <Input
                        id="plan-time"
                        type="time"
                        value={planTime}
                        onChange={(e) => setPlanTime(e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Fleet filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Flota</Label>
                <Select value={fleetFilter} onValueChange={setFleetFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas las flotas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todas las flotas</SelectItem>
                    {fleets.map((fleet) => (
                      <SelectItem key={fleet.id} value={fleet.id}>
                        {fleet.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar vehículo o conductor..."
                  value={vehicleSearch}
                  onChange={(e) => setVehicleSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Select all */}
              {filteredVehicles.length > 0 && (
                <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="select-all-vehicles"
                      checked={filteredVehicles.every((v) =>
                        selectedVehicleIdsSet.has(v.id),
                      )}
                      onCheckedChange={selectAllVehicles}
                    />
                    <Label
                      htmlFor="select-all-vehicles"
                      className="text-sm cursor-pointer"
                    >
                      Seleccionar todos
                    </Label>
                  </div>
                  <Badge variant="secondary">
                    {selectedVehicleIds.length} / {filteredVehicles.length}
                  </Badge>
                </div>
              )}

              {/* Vehicle list */}
              <div className="space-y-2 max-h-[calc(100vh-32rem)] overflow-y-auto">
                {vehiclesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : filteredVehicles.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Truck className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No hay vehículos disponibles</p>
                  </div>
                ) : (
                  filteredVehicles.map((vehicle) => (
                    <label
                      key={vehicle.id}
                      htmlFor={`vehicle-${vehicle.id}`}
                      className={`block p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedVehicleIdsSet.has(vehicle.id)
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-primary/50 hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id={`vehicle-${vehicle.id}`}
                          checked={selectedVehicleIdsSet.has(vehicle.id)}
                          onCheckedChange={() => toggleVehicle(vehicle.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {vehicle.plate || vehicle.name}
                            </span>
                            {vehicle.type && (
                              <Badge variant="outline" className="text-xs">
                                {vehicle.type}
                              </Badge>
                            )}
                          </div>
                          {vehicle.assignedDriver && (
                            <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                              <User className="w-3 h-3" />
                              <span>{vehicle.assignedDriver.name}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            {vehicle.weightCapacity && (
                              <span>{vehicle.weightCapacity} kg</span>
                            )}
                            {vehicle.volumeCapacity && (
                              <span>{vehicle.volumeCapacity} L</span>
                            )}
                            {vehicle.maxOrders && (
                              <span>Max {vehicle.maxOrders} pedidos</span>
                            )}
                          </div>
                          {vehicle.originAddress && (
                            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                              <MapPin className="w-3 h-3" />
                              <span className="truncate">
                                {vehicle.originAddress}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </label>
                  ))
                )}
              </div>

              {/* Next button */}
              <div className="pt-4 border-t">
                <Button
                  className="w-full"
                  onClick={nextStep}
                  disabled={!canProceedFromVehiculos}
                >
                  Continuar a Visitas
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Step: Visitas (Orders) */}
          {currentStep === "visitas" && (
            <div className="p-4 space-y-4">
              {/* Header with upload button */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  Pedidos pendientes
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCsvUpload(true)}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Subir CSV
                </Button>
              </div>

              {/* Tabs */}
              <Tabs value={orderTab} onValueChange={setOrderTab}>
                <TabsList className="w-full">
                  <TabsTrigger value="todas" className="flex-1">
                    Todas ({orders.length})
                  </TabsTrigger>
                  <TabsTrigger value="alertas" className="flex-1">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Alertas ({ordersWithIssues.length})
                  </TabsTrigger>
                  <TabsTrigger value="conHorario" className="flex-1">
                    <Clock className="w-3 h-3 mr-1" />
                    Con horario
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="todas" className="mt-0" />
                <TabsContent value="alertas" className="mt-0" />
                <TabsContent value="conHorario" className="mt-0" />
              </Tabs>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar pedido..."
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Select all */}
              {filteredOrders.length > 0 && (
                <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="select-all-orders"
                      checked={filteredOrders.every((o) =>
                        selectedOrderIdsSet.has(o.id),
                      )}
                      onCheckedChange={selectAllOrders}
                    />
                    <Label
                      htmlFor="select-all-orders"
                      className="text-sm cursor-pointer"
                    >
                      Seleccionar todos
                    </Label>
                  </div>
                  <Badge variant="secondary">
                    {selectedOrderIds.length} / {filteredOrders.length}
                  </Badge>
                </div>
              )}

              {/* Order list */}
              <div className="space-y-2 max-h-[calc(100vh-26rem)] overflow-y-auto">
                {ordersLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No hay pedidos pendientes</p>
                  </div>
                ) : (
                  filteredOrders.map((order) => {
                    const hasIssue = !order.latitude || !order.longitude;
                    return (
                      <div
                        key={order.id}
                        className={`p-3 rounded-lg border transition-all ${
                          selectedOrderIdsSet.has(order.id)
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border hover:border-primary/50 hover:bg-muted/50"
                        } ${hasIssue ? "border-orange-300 bg-orange-50/50" : ""}`}
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox
                            id={`order-${order.id}`}
                            checked={selectedOrderIdsSet.has(order.id)}
                            onCheckedChange={() => toggleOrder(order.id)}
                            className="mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <label
                                htmlFor={`order-${order.id}`}
                                className="font-medium cursor-pointer"
                              >
                                {order.trackingId}
                              </label>
                              {hasIssue && (
                                <Badge
                                  variant="outline"
                                  className="text-xs border-orange-400 text-orange-600"
                                >
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  Sin ubicación
                                </Badge>
                              )}
                              {order.priority === "HIGH" && (
                                <Badge
                                  variant="destructive"
                                  className="text-xs"
                                >
                                  Urgente
                                </Badge>
                              )}
                            </div>
                            {order.customerName && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {order.customerName}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1 truncate">
                              {order.address}
                            </p>
                            {order.presetName && (
                              <div className="flex items-center gap-1 mt-1 text-xs text-blue-600">
                                <Clock className="w-3 h-3" />
                                <span>{order.presetName}</span>
                              </div>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 h-8 w-8 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditOrder(order);
                            }}
                            title="Editar dirección y coordenadas"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Navigation buttons */}
              <div className="pt-4 border-t flex gap-2">
                <Button variant="outline" onClick={prevStep} className="flex-1">
                  Volver
                </Button>
                <Button
                  className="flex-1"
                  onClick={nextStep}
                  disabled={!canProceedFromVisitas}
                >
                  Continuar
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Step: Configuración */}
          {currentStep === "configuracion" && (
            <div className="p-4 space-y-4">
              {/* Summary */}
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="py-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Vehículos</p>
                      <p className="font-semibold text-lg">
                        {selectedVehicleIds.length}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Visitas</p>
                      <p className="font-semibold text-lg">
                        {selectedOrderIds.length}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Objective */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Objetivo de optimización
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Define qué debe priorizar el algoritmo
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {OBJECTIVES.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setObjective(opt.value)}
                      className={`w-full p-3 rounded-lg border text-left transition-all ${
                        objective === opt.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <p className="font-medium text-sm">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {opt.description}
                      </p>
                    </button>
                  ))}
                </CardContent>
              </Card>

              {/* Service time */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Tiempo de servicio
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Tiempo promedio por entrega
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      value={serviceTime}
                      onChange={(e) => setServiceTime(Number(e.target.value))}
                      className="w-20"
                    />
                    <span className="text-sm text-muted-foreground">
                      minutos
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Capacity */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Restricciones de capacidad
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="capacity-enabled"
                      checked={capacityEnabled}
                      onCheckedChange={(checked) =>
                        setCapacityEnabled(!!checked)
                      }
                    />
                    <Label
                      htmlFor="capacity-enabled"
                      className="cursor-pointer"
                    >
                      <span className="text-sm">
                        Respetar capacidad de vehículos
                      </span>
                      <p className="text-xs text-muted-foreground">
                        Considera peso y volumen máximo
                      </p>
                    </Label>
                  </div>
                </CardContent>
              </Card>

              {/* Submit */}
              <div className="pt-4 border-t space-y-2">
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Optimizando...
                    </>
                  ) : (
                    <>
                      <Route className="w-4 h-4 mr-2" />
                      Optimizar rutas
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={prevStep} className="w-full">
                  Volver
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right panel - Map */}
        <div className="flex-1 relative">
          <PlanningMap
            vehicles={currentStep === "vehiculos" ? filteredVehicles : selectedVehicles}
            orders={selectedOrders}
            zones={showZones ? zones : []}
            showVehicleOrigins={currentStep === "vehiculos"}
            showOrders={
              currentStep === "visitas" || currentStep === "configuracion"
            }
            selectedVehicleIds={currentStep === "vehiculos" ? selectedVehicleIds : undefined}
          />

          {/* Map controls */}
          <div className="absolute top-4 right-4 flex flex-col gap-2">
            {/* Zone toggle */}
            {zones.length > 0 && (
              <button
                type="button"
                onClick={() => setShowZones(!showZones)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg text-sm font-medium transition-all ${
                  showZones
                    ? "bg-primary text-primary-foreground"
                    : "bg-background/95 backdrop-blur text-muted-foreground hover:text-foreground"
                }`}
              >
                {showZones ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                Zonas ({zones.length})
              </button>
            )}
          </div>

          {/* Map overlay stats */}
          <div className="absolute bottom-4 left-4 bg-background/95 backdrop-blur rounded-lg shadow-lg p-3 text-sm">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-primary" />
                <span className="font-medium">{selectedVehicleIds.length}</span>
                <span className="text-muted-foreground">vehículos</span>
              </div>
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-green-600" />
                <span className="font-medium">{selectedOrderIds.length}</span>
                <span className="text-muted-foreground">visitas</span>
              </div>
              {zones.length > 0 && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  <span className="font-medium">{zones.length}</span>
                  <span className="text-muted-foreground">zonas</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CSV Upload Dialog */}
      <Dialog open={showCsvUpload} onOpenChange={setShowCsvUpload}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Subir pedidos desde CSV</DialogTitle>
            <DialogDescription>
              Sube un archivo CSV con los siguientes headers: trackcode,
              direccion, referencia, departamento, provincia, distrito,
              longitud, latitud
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-4">
            {/* File input */}
            <div className="space-y-2">
              <Label htmlFor="csv-file">Archivo CSV</Label>
              <Input
                id="csv-file"
                type="file"
                accept=".csv"
                onChange={handleCsvFileChange}
              />
            </div>

            {/* Error message */}
            {csvError && (
              <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm whitespace-pre-wrap">
                {csvError}
              </div>
            )}

            {/* Preview table */}
            {csvPreview.length > 0 && (
              <div className="space-y-2">
                <Label>Vista previa ({csvPreview.length} filas)</Label>
                <div className="border rounded-lg overflow-hidden">
                  <div className="max-h-[300px] overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="px-2 py-2 text-left font-medium">
                            Trackcode
                          </th>
                          <th className="px-2 py-2 text-left font-medium">
                            Dirección
                          </th>
                          <th className="px-2 py-2 text-left font-medium">
                            Distrito
                          </th>
                          <th className="px-2 py-2 text-left font-medium">
                            Coords
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreview.slice(0, 10).map((row, index) => (
                          <tr key={index} className="border-t">
                            <td className="px-2 py-1.5 font-mono text-xs">
                              {row.trackcode}
                            </td>
                            <td className="px-2 py-1.5 truncate max-w-[150px]">
                              {row.direccion}
                            </td>
                            <td className="px-2 py-1.5">{row.distrito}</td>
                            <td className="px-2 py-1.5 text-xs text-muted-foreground">
                              {row.latitud && row.longitud ? (
                                <span className="text-green-600">OK</span>
                              ) : (
                                <span className="text-orange-600">
                                  Sin coords
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {csvPreview.length > 10 && (
                    <div className="px-2 py-1.5 bg-muted text-xs text-muted-foreground text-center">
                      Y {csvPreview.length - 10} filas más...
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCsvUpload(false);
                setCsvFile(null);
                setCsvPreview([]);
                setCsvError(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCsvUpload}
              disabled={csvUploading || csvPreview.length === 0}
            >
              {csvUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Subiendo...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Subir {csvPreview.length} pedidos
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Edit Dialog */}
      <Dialog open={!!editingOrder} onOpenChange={(open) => !open && setEditingOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar ubicación del pedido</DialogTitle>
            <DialogDescription>
              {editingOrder?.trackingId} - {editingOrder?.customerName || "Sin nombre"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Address */}
            <div className="space-y-2">
              <Label htmlFor="edit-address">Dirección</Label>
              <Input
                id="edit-address"
                value={editOrderData.address}
                onChange={(e) =>
                  setEditOrderData((prev) => ({ ...prev, address: e.target.value }))
                }
                placeholder="Ingresa la dirección completa"
              />
            </div>

            {/* Coordinates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-latitude">Latitud</Label>
                <Input
                  id="edit-latitude"
                  value={editOrderData.latitude}
                  onChange={(e) =>
                    setEditOrderData((prev) => ({ ...prev, latitude: e.target.value }))
                  }
                  placeholder="-12.0464"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-longitude">Longitud</Label>
                <Input
                  id="edit-longitude"
                  value={editOrderData.longitude}
                  onChange={(e) =>
                    setEditOrderData((prev) => ({ ...prev, longitude: e.target.value }))
                  }
                  placeholder="-77.0428"
                />
              </div>
            </div>

            {/* Coordinates hint */}
            <p className="text-xs text-muted-foreground">
              Puedes obtener las coordenadas desde Google Maps haciendo clic derecho
              en el punto y copiando las coordenadas.
            </p>

            {/* Error message */}
            {updateOrderError && (
              <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                {updateOrderError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingOrder(null)}
              disabled={isUpdatingOrder}
            >
              Cancelar
            </Button>
            <Button
              onClick={saveOrderChanges}
              disabled={isUpdatingOrder || !editOrderData.address}
            >
              {isUpdatingOrder ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar cambios"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PlanificacionPage() {
  return (
    <ProtectedPage requiredPermission="planificacion:VIEW">
      <PlanificacionPageContent />
    </ProtectedPage>
  );
}
