"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useCompanyContext } from "@/hooks/use-company-context";
import { useToast } from "@/hooks/use-toast";
import { parseCSVLine } from "@/lib/csv/parse-csv-line";
import type {
  Vehicle,
  Fleet,
  Order,
  Zone,
  OptimizerEngine,
  CompanyProfile,
  CsvRow,
  StepId,
  FieldDefinition,
} from "./planificacion-types";

// State
export interface PlanificacionState {
  // Step management
  currentStep: StepId;
  completedSteps: Set<StepId>;
  // Vehicles
  vehicles: Vehicle[];
  fleets: Fleet[];
  selectedVehicleIds: string[];
  vehicleSearch: string;
  fleetFilter: string;
  vehiclesLoading: boolean;
  // Orders
  orders: Order[];
  selectedOrderIds: string[];
  orderSearch: string;
  orderTab: string;
  ordersLoading: boolean;
  deletingOrderId: string | null;
  // Configuration
  planName: string;
  planDate: string;
  planTime: string;
  objective: string;
  serviceTime: number;
  capacityEnabled: boolean;
  optimizerType: string;
  optimizers: OptimizerEngine[];
  optimizersLoading: boolean;
  // Zones
  zones: Zone[];
  showZones: boolean;
  // Company profile
  companyProfile: CompanyProfile | null;
  // Submission
  isSubmitting: boolean;
  error: string | null;
  // CSV Upload
  showCsvUpload: boolean;
  csvFile: File | null;
  csvUploading: boolean;
  csvError: string | null;
  csvPreview: CsvRow[];
  // Order edit
  editingOrder: Order | null;
  editOrderData: { address: string; latitude: string; longitude: string };
  isUpdatingOrder: boolean;
  updateOrderError: string | null;
  // Custom field definitions
  fieldDefinitions: FieldDefinition[];
  // CSV custom field column mappings (CSV header -> field definition code)
  csvCustomFieldMappings: Array<{ csvHeader: string; code: string; label: string }>;
}

// Actions
export interface PlanificacionActions {
  // Navigation
  goToStep: (step: StepId) => void;
  nextStep: () => void;
  prevStep: () => void;
  // Vehicles
  setVehicleSearch: (search: string) => void;
  setFleetFilter: (filter: string) => void;
  toggleVehicle: (id: string) => void;
  selectAllVehicles: () => void;
  // Orders
  setOrderSearch: (search: string) => void;
  setOrderTab: (tab: string) => void;
  toggleOrder: (id: string) => void;
  selectAllOrders: () => void;
  deleteOrder: (id: string) => Promise<void>;
  // Configuration
  setPlanName: (name: string) => void;
  setPlanDate: (date: string) => void;
  setPlanTime: (time: string) => void;
  setObjective: (objective: string) => void;
  setServiceTime: (time: number) => void;
  setCapacityEnabled: (enabled: boolean) => void;
  setOptimizerType: (type: string) => void;
  setShowZones: (show: boolean) => void;
  // Submit
  handleSubmit: () => Promise<void>;
  setError: (error: string | null) => void;
  // CSV
  setShowCsvUpload: (show: boolean) => void;
  handleCsvFileChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleCsvUpload: () => Promise<void>;
  resetCsvState: () => void;
  downloadCsvTemplate: () => Promise<void>;
  // Order edit
  openEditOrder: (order: Order) => void;
  setEditOrderData: (data: { address: string; latitude: string; longitude: string }) => void;
  saveOrderChanges: () => Promise<void>;
  closeEditOrder: () => void;
}

// Meta
export interface PlanificacionMeta {
  companyId: string | null;
  isReady: boolean;
  isSystemAdmin: boolean;
  companies: Array<{ id: string; commercialName: string }>;
  selectedCompanyId: string | null;
  setSelectedCompanyId: (id: string | null) => void;
  authCompanyId: string | null;
}

// Derived
export interface PlanificacionDerived {
  filteredVehicles: Vehicle[];
  filteredOrders: Order[];
  ordersWithIssues: Order[];
  selectedVehicles: Vehicle[];
  selectedOrders: Order[];
  selectedVehicleIdsSet: Set<string>;
  selectedOrderIdsSet: Set<string>;
  canProceedFromVehiculos: boolean;
  canProceedFromVisitas: boolean;
}

interface PlanificacionContextValue {
  state: PlanificacionState;
  actions: PlanificacionActions;
  meta: PlanificacionMeta;
  derived: PlanificacionDerived;
}

const PlanificacionContext = createContext<PlanificacionContextValue | undefined>(undefined);

const STEPS: StepId[] = ["vehiculos", "visitas", "configuracion"];

export function PlanificacionProvider({ children }: { children: ReactNode }) {
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
  const { toast } = useToast();

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
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);

  // Configuration state
  const [planName, setPlanName] = useState("");

  const [planDate, setPlanDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  });
  const [planTime, setPlanTime] = useState("08:00");
  const [objective, setObjective] = useState("BALANCED");
  const [serviceTime, setServiceTime] = useState(10);
  const [capacityEnabled, setCapacityEnabled] = useState(true);
  const [optimizerType, setOptimizerType] = useState("VROOM");
  const [optimizers, setOptimizers] = useState<OptimizerEngine[]>([]);
  const [optimizersLoading, setOptimizersLoading] = useState(true);

  // Zones state
  const [zones, setZones] = useState<Zone[]>([]);
  const [showZones, setShowZones] = useState(true);

  // Company profile state
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CSV Upload state
  const [showCsvUpload, setShowCsvUpload] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvPreview, setCsvPreview] = useState<CsvRow[]>([]);

  // Custom field definitions
  const [fieldDefinitions, setFieldDefinitions] = useState<FieldDefinition[]>([]);
  const [csvCustomFieldMappings, setCsvCustomFieldMappings] = useState<
    Array<{ csvHeader: string; code: string; label: string }>
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

  // Data loaders
  const loadFleets = useCallback(async (signal?: AbortSignal) => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/fleets?limit=100&active=true", {
        headers: { "x-company-id": companyId },
        signal,
      });
      if (response.ok) {
        const data = await response.json();
        setFleets(data.data || []);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to fetch fleets:", err);
    }
  }, [companyId]);

  const loadVehicles = useCallback(async (signal?: AbortSignal) => {
    if (!companyId) return;
    setVehiclesLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (fleetFilter !== "ALL") {
        params.append("fleetId", fleetFilter);
      }
      const response = await fetch(`/api/vehicles/available?${params}`, {
        headers: { "x-company-id": companyId },
        signal,
      });
      if (response.ok) {
        const data = await response.json();
        setVehicles(data.data || []);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to fetch vehicles:", err);
    } finally {
      setVehiclesLoading(false);
    }
  }, [companyId, fleetFilter]);

  const loadOrders = useCallback(async (signal?: AbortSignal) => {
    if (!companyId) return;
    setOrdersLoading(true);
    try {
      const limit = 100;
      const maxOrders = 5000;
      const maxBatches = Math.ceil(maxOrders / limit);

      const firstResponse = await fetch(
        `/api/orders?status=PENDING&active=true&limit=${limit}&offset=0`,
        { headers: { "x-company-id": companyId }, signal }
      );

      if (!firstResponse.ok) return;

      const firstData = await firstResponse.json();
      const firstBatch = firstData.data || [];

      if (firstBatch.length < limit) {
        setOrders(firstBatch);
        setSelectedOrderIds(firstBatch.map((o: Order) => o.id));
        return;
      }

      const batchPromises: Promise<Order[]>[] = [];
      for (let batch = 1; batch < maxBatches; batch++) {
        const offset = batch * limit;
        batchPromises.push(
          fetch(
            `/api/orders?status=PENDING&active=true&limit=${limit}&offset=${offset}`,
            { headers: { "x-company-id": companyId }, signal }
          ).then(async (res) => {
            if (!res.ok) return [];
            const data = await res.json();
            return data.data || [];
          })
        );
      }

      const batchResults = await Promise.all(batchPromises);
      const allOrders: Order[] = [...firstBatch];
      for (const batch of batchResults) {
        allOrders.push(...batch);
        if (batch.length < limit) break;
      }

      setOrders(allOrders);
      setSelectedOrderIds(allOrders.map((o: Order) => o.id));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to fetch orders:", err);
    } finally {
      setOrdersLoading(false);
    }
  }, [companyId]);

  const loadZones = useCallback(async (signal?: AbortSignal) => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/zones?active=true&limit=100", {
        headers: { "x-company-id": companyId },
        signal,
      });
      if (response.ok) {
        const data = await response.json();
        const mappedZones: Zone[] = (data.data || [])
          .filter((z: { parsedGeometry: unknown }) => z.parsedGeometry)
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
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to fetch zones:", err);
    }
  }, [companyId]);

  const loadOptimizers = useCallback(async (signal?: AbortSignal) => {
    setOptimizersLoading(true);
    try {
      const response = await fetch("/api/optimization/engines", { signal });
      if (response.ok) {
        const data = await response.json();
        setOptimizers(data.data?.optimizers || []);
        if (data.data?.recommended) {
          setOptimizerType(data.data.recommended);
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to fetch optimizers:", err);
    } finally {
      setOptimizersLoading(false);
    }
  }, []);

  const loadCompanyProfile = useCallback(async (signal?: AbortSignal) => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/company-profiles", {
        headers: { "x-company-id": companyId },
        signal,
      });
      if (response.ok) {
        const data = await response.json();
        if (data.data?.profile) {
          setCompanyProfile({
            enableOrderValue: data.data.profile.enableOrderValue ?? false,
            enableWeight: data.data.profile.enableWeight ?? false,
            enableVolume: data.data.profile.enableVolume ?? false,
            enableUnits: data.data.profile.enableUnits ?? false,
            enableOrderType: data.data.profile.enableOrderType ?? false,
          });
        } else {
          setCompanyProfile({
            enableOrderValue: false,
            enableWeight: false,
            enableVolume: false,
            enableUnits: false,
            enableOrderType: false,
          });
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to fetch company profile:", err);
      setCompanyProfile({
        enableOrderValue: false,
        enableWeight: false,
        enableVolume: false,
        enableUnits: false,
        enableOrderType: false,
      });
    }
  }, [companyId]);

  const loadFieldDefinitions = useCallback(async (signal?: AbortSignal) => {
    if (!companyId) return;
    try {
      const response = await fetch(`/api/companies/${companyId}/field-definitions?entity=orders`, {
        headers: { "x-company-id": companyId },
        signal,
      });
      if (response.ok) {
        const data = await response.json();
        setFieldDefinitions((data.data || []).filter((d: FieldDefinition) => d.active));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to fetch field definitions:", err);
    }
  }, [companyId]);

  // Initial data load
  useEffect(() => {
    if (!companyId) return;

    const controller = new AbortController();

    Promise.all([
      loadFleets(controller.signal),
      loadVehicles(controller.signal),
      loadOrders(controller.signal),
      loadZones(controller.signal),
      loadOptimizers(controller.signal),
      loadCompanyProfile(controller.signal),
      loadFieldDefinitions(controller.signal),
    ]).catch(() => {
      // Ignore abort errors
    });

    return () => controller.abort();
  }, [companyId, loadFleets, loadVehicles, loadOrders, loadZones, loadOptimizers, loadCompanyProfile, loadFieldDefinitions]);

  // Derived values
  const selectedVehicleIdsSet = useMemo(() => new Set(selectedVehicleIds), [selectedVehicleIds]);
  const selectedOrderIdsSet = useMemo(() => new Set(selectedOrderIds), [selectedOrderIds]);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      const searchLower = vehicleSearch.toLowerCase();
      return (
        !vehicleSearch ||
        v.name.toLowerCase().includes(searchLower) ||
        (v.plate?.toLowerCase().includes(searchLower) ?? false) ||
        (v.assignedDriver?.name.toLowerCase().includes(searchLower) ?? false)
      );
    });
  }, [vehicles, vehicleSearch]);

  const filteredOrders = useMemo(() => {
    let filtered = orders;
    if (orderTab === "alertas") {
      filtered = filtered.filter((o) => !o.latitude || !o.longitude);
    } else if (orderTab === "conHorario") {
      filtered = filtered.filter((o) => o.timeWindowPresetId);
    }
    if (orderSearch) {
      const searchLower = orderSearch.toLowerCase();
      filtered = filtered.filter(
        (o) =>
          o.trackingId.toLowerCase().includes(searchLower) ||
          (o.customerName?.toLowerCase().includes(searchLower) ?? false) ||
          o.address.toLowerCase().includes(searchLower)
      );
    }
    return filtered;
  }, [orders, orderTab, orderSearch]);

  const ordersWithIssues = useMemo(
    () => orders.filter((o) => !o.latitude || !o.longitude),
    [orders]
  );

  const selectedVehicles = useMemo(
    () => vehicles.filter((v) => selectedVehicleIdsSet.has(v.id)),
    [vehicles, selectedVehicleIdsSet]
  );

  const selectedOrders = useMemo(
    () => orders.filter((o) => selectedOrderIdsSet.has(o.id)),
    [orders, selectedOrderIdsSet]
  );

  // Actions
  const goToStep = useCallback((step: StepId) => {
    setCurrentStep(step);
  }, []);

  const nextStep = useCallback(() => {
    const currentIndex = STEPS.indexOf(currentStep);
    if (currentIndex < STEPS.length - 1) {
      setCompletedSteps((prev) => new Set([...prev, currentStep]));
      setCurrentStep(STEPS[currentIndex + 1]);
    }
  }, [currentStep]);

  const prevStep = useCallback(() => {
    const currentIndex = STEPS.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(STEPS[currentIndex - 1]);
    }
  }, [currentStep]);

  const toggleVehicle = useCallback((id: string) => {
    setSelectedVehicleIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );
  }, []);

  const selectAllVehicles = useCallback(() => {
    const allSelected = filteredVehicles.every((v) => selectedVehicleIdsSet.has(v.id));
    if (allSelected) {
      const filteredSet = new Set(filteredVehicles.map((v) => v.id));
      setSelectedVehicleIds((prev) => prev.filter((id) => !filteredSet.has(id)));
    } else {
      const newIds = filteredVehicles.map((v) => v.id);
      setSelectedVehicleIds((prev) => [...new Set([...prev, ...newIds])]);
    }
  }, [filteredVehicles, selectedVehicleIdsSet]);

  const toggleOrder = useCallback((id: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((o) => o !== id) : [...prev, id]
    );
  }, []);

  const selectAllOrders = useCallback(() => {
    const allSelected = filteredOrders.every((o) => selectedOrderIdsSet.has(o.id));
    if (allSelected) {
      const filteredSet = new Set(filteredOrders.map((o) => o.id));
      setSelectedOrderIds((prev) => prev.filter((id) => !filteredSet.has(id)));
    } else {
      const newIds = filteredOrders.map((o) => o.id);
      setSelectedOrderIds((prev) => [...new Set([...prev, ...newIds])]);
    }
  }, [filteredOrders, selectedOrderIdsSet]);

  const deleteOrder = useCallback(
    async (id: string) => {
      if (!companyId) return;
      setDeletingOrderId(id);
      try {
        const res = await fetch(`/api/orders/${id}`, {
          method: "DELETE",
          headers: { "x-company-id": companyId },
        });
        if (res.ok) {
          setOrders((prev) => prev.filter((o) => o.id !== id));
          setSelectedOrderIds((prev) => prev.filter((oid) => oid !== id));
        }
      } catch (error) {
        toast({
          title: "Error al eliminar pedido",
          description: error instanceof Error ? error.message : "Ocurrió un error inesperado",
          variant: "destructive",
        });
      } finally {
        setDeletingOrderId(null);
      }
    },
    [companyId, toast]
  );

  const handleSubmit = useCallback(async () => {
    if (!companyId) return;
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
      const driverIds = selectedVehicles
        .filter((v) => v.assignedDriver)
        .map((v) => v.assignedDriver?.id)
        .filter((id): id is string => id !== undefined);

      const finalName = planName.trim() || `Plan ${planDate} ${planTime}`;

      const configResponse = await fetch("/api/optimization/configure", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId,
        },
        body: JSON.stringify({
          name: finalName,
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
          optimizerType,
        }),
      });

      if (!configResponse.ok) {
        const data = await configResponse.json();
        throw new Error(data.error || "Error al crear la configuración");
      }

      const configData = await configResponse.json();
      router.push(`/planificacion/${configData.data.id}/results`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar la optimización");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    selectedVehicleIds,
    selectedOrderIds,
    selectedVehicles,
    companyId,
    planName,
    planDate,
    planTime,
    objective,
    capacityEnabled,
    serviceTime,
    optimizerType,
    router,
  ]);

  // CSV parsing
  const parseCSV = useCallback(
    (text: string): CsvRow[] => {
      const cleanText = text.replace(/^\uFEFF/, "");
      const lines = cleanText.split("\n").filter((line) => line.trim());
      if (lines.length < 2) {
        throw new Error("El archivo CSV debe tener al menos una fila de encabezados y una de datos");
      }

      const firstLine = lines[0];
      let delimiter = ",";
      if (firstLine.includes("\t")) delimiter = "\t";
      else if (firstLine.includes(";")) delimiter = ";";

      const normalizeHeader = (h: string) => {
        return h
          .trim()
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/ñ/g, "n")
          .replace(/[^a-z0-9_]/g, "_");
      };

      const headerFields = parseCSVLine(firstLine, delimiter);
      const headers = headerFields.map((h) => normalizeHeader(h));
      const originalHeaders = headerFields.map((h) => h.trim().toLowerCase());
      const rawHeaders = headerFields.map((h) => h.trim());

      const requiredHeaders = [
        "trackcode", "nombre_cliente", "direccion", "referencia",
        "departamento", "provincia", "distrito", "latitud", "longitud", "telefono",
        ...(companyProfile?.enableOrderValue ? ["valorizado"] : []),
        ...(companyProfile?.enableWeight ? ["peso"] : []),
        ...(companyProfile?.enableVolume ? ["volumen"] : []),
        ...(companyProfile?.enableUnits ? ["unidades"] : []),
        ...(companyProfile?.enableOrderType ? ["tipo_pedido"] : []),
      ];

      const missingHeaders = requiredHeaders.filter((h) => {
        const normalizedH = normalizeHeader(h);
        return !headers.includes(normalizedH) && !originalHeaders.includes(h);
      });

      if (missingHeaders.length > 0) {
        throw new Error(`Faltan columnas requeridas: ${missingHeaders.join(", ")}`);
      }

      const getIndex = (name: string) => {
        const idx = headers.indexOf(normalizeHeader(name));
        return idx !== -1 ? idx : originalHeaders.indexOf(name);
      };

      const indexes = {
        trackcode: getIndex("trackcode"),
        nombre_cliente: getIndex("nombre_cliente"),
        direccion: getIndex("direccion"),
        referencia: getIndex("referencia"),
        departamento: getIndex("departamento"),
        provincia: getIndex("provincia"),
        distrito: getIndex("distrito"),
        latitud: getIndex("latitud"),
        longitud: getIndex("longitud"),
        telefono: getIndex("telefono"),
        valorizado: getIndex("valorizado"),
        peso: getIndex("peso"),
        volumen: getIndex("volumen"),
        unidades: getIndex("unidades"),
        tipo_pedido: getIndex("tipo_pedido"),
        prioridad: getIndex("prioridad"),
        ventana_horaria_inicio:
          getIndex("ventana_horaria_inicio") !== -1
            ? getIndex("ventana_horaria_inicio")
            : getIndex("ventana horaria inicio"),
        ventana_horaria_fin:
          getIndex("ventana_horaria_fin") !== -1
            ? getIndex("ventana_horaria_fin")
            : getIndex("ventana horaria fin"),
      };

      // Detect custom field columns: columns not mapped to any standard field
      const standardIndexes = new Set(Object.values(indexes).filter((i) => i !== -1));
      const customFieldMappings: Array<{ csvHeader: string; code: string; label: string; index: number }> = [];

      if (fieldDefinitions.length > 0) {
        for (let colIdx = 0; colIdx < headers.length; colIdx++) {
          if (standardIndexes.has(colIdx)) continue;
          const normalizedCol = headers[colIdx];
          const matchedDef = fieldDefinitions.find(
            (fd) => fd.showInCsv && normalizeHeader(fd.code) === normalizedCol
          );
          if (matchedDef) {
            customFieldMappings.push({
              csvHeader: rawHeaders[colIdx],
              code: matchedDef.code,
              label: matchedDef.label,
              index: colIdx,
            });
          }
        }
      }

      setCsvCustomFieldMappings(
        customFieldMappings.map(({ csvHeader, code, label }) => ({ csvHeader, code, label }))
      );

      // Validate that all required custom fields with showInCsv have a column in the CSV
      if (fieldDefinitions.length > 0) {
        const mappedCodes = new Set(customFieldMappings.map((m) => m.code));
        const missingRequiredCustomFields = fieldDefinitions.filter(
          (fd) => fd.showInCsv && fd.required && !mappedCodes.has(fd.code)
        );
        if (missingRequiredCustomFields.length > 0) {
          const names = missingRequiredCustomFields.map((fd) => fd.label).join(", ");
          throw new Error(`Faltan columnas de campos personalizados requeridos: ${names}`);
        }
      }

      const data: CsvRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i], delimiter).map((v) => v.trim());
        if (values.length >= requiredHeaders.length) {
          const row: CsvRow = {
            trackcode: values[indexes.trackcode] || "",
            nombre_cliente: values[indexes.nombre_cliente] || "",
            direccion: values[indexes.direccion] || "",
            referencia: values[indexes.referencia] || "",
            departamento: values[indexes.departamento] || "",
            provincia: values[indexes.provincia] || "",
            distrito: values[indexes.distrito] || "",
            latitud: values[indexes.latitud] || "",
            longitud: values[indexes.longitud] || "",
            telefono: values[indexes.telefono] || "",
          };

          if (indexes.valorizado !== -1 && values[indexes.valorizado]) {
            row.valorizado = values[indexes.valorizado];
          }
          if (indexes.peso !== -1 && values[indexes.peso]) {
            row.peso = values[indexes.peso];
          }
          if (indexes.volumen !== -1 && values[indexes.volumen]) {
            row.volumen = values[indexes.volumen];
          }
          if (indexes.unidades !== -1 && values[indexes.unidades]) {
            row.unidades = values[indexes.unidades];
          }
          if (indexes.tipo_pedido !== -1 && values[indexes.tipo_pedido]) {
            row.tipo_pedido = values[indexes.tipo_pedido];
          }
          if (indexes.prioridad !== -1 && values[indexes.prioridad]) {
            row.prioridad = values[indexes.prioridad];
          }
          if (indexes.ventana_horaria_inicio !== -1 && values[indexes.ventana_horaria_inicio]) {
            row.ventana_horaria_inicio = values[indexes.ventana_horaria_inicio];
          }
          if (indexes.ventana_horaria_fin !== -1 && values[indexes.ventana_horaria_fin]) {
            row.ventana_horaria_fin = values[indexes.ventana_horaria_fin];
          }

          // Map custom field columns with type conversion
          if (customFieldMappings.length > 0) {
            const cf: Record<string, string | number | boolean> = {};
            for (const mapping of customFieldMappings) {
              const val = values[mapping.index];
              if (val) {
                const matchedDef = fieldDefinitions.find((fd) => fd.code === mapping.code);
                const fieldType = matchedDef?.fieldType;
                if ((fieldType === "number" || fieldType === "currency") && val.trim()) {
                  const parsed = parseFloat(val.replace(",", "."));
                  cf[mapping.code] = isNaN(parsed) ? val : parsed;
                } else if (fieldType === "boolean") {
                  const lower = val.trim().toLowerCase();
                  cf[mapping.code] = lower === "true" || lower === "1" || lower === "si" || lower === "yes";
                } else {
                  cf[mapping.code] = val;
                }
              }
            }
            if (Object.keys(cf).length > 0) {
              row.customFields = cf as Record<string, string>;
            }
          }

          data.push(row);
        }
      }

      return data;
    },
    [companyProfile, fieldDefinitions]
  );

  const handleCsvFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setCsvFile(file);
      setCsvError(null);

      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        let text: string;
        if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
          text = new TextDecoder("utf-8").decode(buffer);
        } else if (bytes[0] === 0xff && bytes[1] === 0xfe) {
          text = new TextDecoder("utf-16le").decode(buffer);
        } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
          text = new TextDecoder("utf-16be").decode(buffer);
        } else {
          const utf8Text = new TextDecoder("utf-8").decode(buffer);
          if (utf8Text.includes("\uFFFD")) {
            text = new TextDecoder("windows-1252").decode(buffer);
          } else {
            text = utf8Text;
          }
        }

        const data = parseCSV(text);
        setCsvPreview(data);
      } catch (err) {
        setCsvError(err instanceof Error ? err.message : "Error al leer el archivo");
        setCsvPreview([]);
      }
    },
    [parseCSV]
  );

  const handleCsvUpload = useCallback(async () => {
    if (!companyId || csvPreview.length === 0) return;

    setCsvUploading(true);
    setCsvError(null);

    try {
      const cleanCoord = (val: string) => val.replace(",", ".").replace(/[^\d.-]/g, "");

      const validOrders: Array<{
        trackingId: string;
        address: string;
        latitude: string;
        longitude: string;
        notes?: string;
        customerName?: string;
        customerPhone?: string;
        orderValue?: number;
        weightRequired?: number;
        volumeRequired?: number;
        unitsRequired?: number;
        orderType?: "NEW" | "RESCHEDULED" | "URGENT";
        priority?: number;
        timeWindowStart?: string;
        timeWindowEnd?: string;
        customFields?: Record<string, string>;
      }> = [];
      const skippedRows: string[] = [];

      for (const row of csvPreview) {
        if (!row.trackcode?.trim()) {
          skippedRows.push("Fila sin trackcode");
          continue;
        }

        if (!row.latitud?.trim() || !row.longitud?.trim()) {
          skippedRows.push(`${row.trackcode}: Sin coordenadas`);
          continue;
        }

        const fullAddress = [row.direccion, row.distrito, row.provincia, row.departamento]
          .filter(Boolean)
          .join(", ");

        if (!fullAddress.trim()) {
          skippedRows.push(`${row.trackcode}: Sin dirección`);
          continue;
        }

        const lat = cleanCoord(row.latitud);
        const lng = cleanCoord(row.longitud);

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
          customerName?: string;
          customerPhone?: string;
          orderValue?: number;
          weightRequired?: number;
          volumeRequired?: number;
          unitsRequired?: number;
          orderType?: "NEW" | "RESCHEDULED" | "URGENT";
          priority?: number;
          timeWindowStart?: string;
          timeWindowEnd?: string;
          customFields?: Record<string, string>;
        } = {
          trackingId: String(row.trackcode).trim().slice(0, 50),
          address: fullAddress.slice(0, 500),
          latitude: lat,
          longitude: lng,
        };

        const notesParts: string[] = [];
        if (row.referencia?.trim()) notesParts.push(row.referencia.trim());
        if (row.nombre_cliente?.trim()) {
          notesParts.push(`Cliente: ${row.nombre_cliente.trim()}`);
          orderData.customerName = row.nombre_cliente.trim().slice(0, 100);
        }
        if (row.telefono?.trim()) {
          notesParts.push(`Tel: ${row.telefono.trim()}`);
          orderData.customerPhone = row.telefono.trim().slice(0, 20);
        }
        if (notesParts.length > 0) {
          orderData.notes = notesParts.join(" | ").slice(0, 500);
        }

        if (row.valorizado?.trim()) {
          const val = parseInt(row.valorizado.trim(), 10);
          if (!isNaN(val) && val >= 0) orderData.orderValue = val;
        }
        if (row.peso?.trim()) {
          const val = parseInt(row.peso.trim(), 10);
          if (!isNaN(val) && val > 0) orderData.weightRequired = val;
        }
        if (row.volumen?.trim()) {
          const val = parseInt(row.volumen.trim(), 10);
          if (!isNaN(val) && val > 0) orderData.volumeRequired = val;
        }
        if (row.unidades?.trim()) {
          const val = parseInt(row.unidades.trim(), 10);
          if (!isNaN(val) && val > 0) orderData.unitsRequired = val;
        }
        if (row.tipo_pedido?.trim()) {
          const type = row.tipo_pedido.trim().toUpperCase();
          if (type === "NEW" || type === "NUEVO") orderData.orderType = "NEW";
          else if (type === "RESCHEDULED" || type === "REPROGRAMADO") orderData.orderType = "RESCHEDULED";
          else if (type === "URGENT" || type === "URGENTE") orderData.orderType = "URGENT";
        }
        if (row.prioridad?.trim()) {
          const val = parseInt(row.prioridad.trim(), 10);
          if (!isNaN(val) && val >= 0 && val <= 100) orderData.priority = val;
        }
        if (row.ventana_horaria_inicio?.trim()) {
          const timeStr = row.ventana_horaria_inicio.trim();
          if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeStr)) {
            orderData.timeWindowStart = timeStr;
          }
        }
        if (row.ventana_horaria_fin?.trim()) {
          const timeStr = row.ventana_horaria_fin.trim();
          if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeStr)) {
            orderData.timeWindowEnd = timeStr;
          }
        }

        if (row.customFields && Object.keys(row.customFields).length > 0) {
          orderData.customFields = row.customFields;
        }

        // Validate required custom fields have values
        if (fieldDefinitions.length > 0) {
          const requiredCsvFields = fieldDefinitions.filter(
            (fd) => fd.showInCsv && fd.required
          );
          const missingFields = requiredCsvFields.filter((fd) => {
            const val = row.customFields?.[fd.code];
            return val === undefined || val === null || val === "";
          });
          if (missingFields.length > 0) {
            const names = missingFields.map((fd) => fd.label).join(", ");
            skippedRows.push(`${row.trackcode}: Campos requeridos vacíos: ${names}`);
            continue;
          }
        }

        validOrders.push(orderData);
      }

      if (validOrders.length === 0) {
        setCsvError(`No hay órdenes válidas para subir.\n${skippedRows.slice(0, 5).join("\n")}`);
        return;
      }

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
        await loadOrders();

        const messages: string[] = [];
        if (result.created > 0) messages.push(`${result.created} órdenes creadas`);
        if (result.skipped > 0) messages.push(`${result.skipped} duplicados saltados`);
        if (result.invalid > 0) messages.push(`${result.invalid} inválidos`);
        if (skippedRows.length > 0) messages.push(`${skippedRows.length} filas sin datos`);

        if (result.skipped > 0 || result.invalid > 0 || skippedRows.length > 0) {
          const details: string[] = [];
          if (result.duplicates?.length > 0) {
            details.push(
              `Duplicados: ${result.duplicates.slice(0, 3).join(", ")}${result.duplicates.length > 3 ? "..." : ""}`
            );
          }
          if (skippedRows.length > 0) {
            details.push(...skippedRows.slice(0, 3));
          }
          setCsvError(`${messages.join(", ")}\n${details.join("\n")}`);
        }

        if (result.created > 0) {
          setShowCsvUpload(false);
          setCsvFile(null);
          setCsvPreview([]);
        }
      } else {
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
  }, [companyId, csvPreview, loadOrders, fieldDefinitions]);

  const resetCsvState = useCallback(() => {
    setShowCsvUpload(false);
    setCsvFile(null);
    setCsvPreview([]);
    setCsvError(null);
    setCsvCustomFieldMappings([]);
  }, []);

  const downloadCsvTemplate = useCallback(async () => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/orders/csv-template?format=csv&locale=es", {
        headers: { "x-company-id": companyId },
      });
      if (!response.ok) throw new Error("Error al descargar la plantilla");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ordenes_template.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : "Error al descargar la plantilla");
    }
  }, [companyId]);

  const openEditOrder = useCallback((order: Order) => {
    setEditingOrder(order);
    setEditOrderData({
      address: order.address || "",
      latitude: order.latitude || "",
      longitude: order.longitude || "",
    });
    setUpdateOrderError(null);
  }, []);

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

      setOrders((prev) =>
        prev.map((o) =>
          o.id === editingOrder.id
            ? {
                ...o,
                address: editOrderData.address,
                latitude: editOrderData.latitude || null,
                longitude: editOrderData.longitude || null,
              }
            : o
        )
      );

      setEditingOrder(null);
    } catch (err) {
      setUpdateOrderError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setIsUpdatingOrder(false);
    }
  }, [editingOrder, companyId, editOrderData]);

  const closeEditOrder = useCallback(() => {
    setEditingOrder(null);
  }, []);

  // Build context value
  const state: PlanificacionState = {
    currentStep,
    completedSteps,
    vehicles,
    fleets,
    selectedVehicleIds,
    vehicleSearch,
    fleetFilter,
    vehiclesLoading,
    orders,
    selectedOrderIds,
    orderSearch,
    orderTab,
    ordersLoading,
    deletingOrderId,
    planName,
    planDate,
    planTime,
    objective,
    serviceTime,
    capacityEnabled,
    optimizerType,
    optimizers,
    optimizersLoading,
    zones,
    showZones,
    companyProfile,
    isSubmitting,
    error,
    showCsvUpload,
    csvFile,
    csvUploading,
    csvError,
    csvPreview,
    editingOrder,
    editOrderData,
    isUpdatingOrder,
    updateOrderError,
    fieldDefinitions,
    csvCustomFieldMappings,
  };

  const actions: PlanificacionActions = {
    goToStep,
    nextStep,
    prevStep,
    setVehicleSearch,
    setFleetFilter,
    toggleVehicle,
    selectAllVehicles,
    setOrderSearch,
    setOrderTab,
    toggleOrder,
    selectAllOrders,
    deleteOrder,
    setPlanName,
    setPlanDate,
    setPlanTime,
    setObjective,
    setServiceTime,
    setCapacityEnabled,
    setOptimizerType,
    setShowZones,
    handleSubmit,
    setError,
    setShowCsvUpload,
    handleCsvFileChange,
    handleCsvUpload,
    resetCsvState,
    downloadCsvTemplate,
    openEditOrder,
    setEditOrderData,
    saveOrderChanges,
    closeEditOrder,
  };

  const meta: PlanificacionMeta = {
    companyId,
    isReady,
    isSystemAdmin,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    authCompanyId,
  };

  const derived: PlanificacionDerived = {
    filteredVehicles,
    filteredOrders,
    ordersWithIssues,
    selectedVehicles,
    selectedOrders,
    selectedVehicleIdsSet,
    selectedOrderIdsSet,
    canProceedFromVehiculos: selectedVehicleIds.length > 0,
    canProceedFromVisitas: selectedOrderIds.length > 0,
  };

  return (
    <PlanificacionContext value={{ state, actions, meta, derived }}>
      {children}
    </PlanificacionContext>
  );
}

export function usePlanificacion(): PlanificacionContextValue {
  const context = use(PlanificacionContext);
  if (context === undefined) {
    throw new Error("usePlanificacion must be used within a PlanificacionProvider");
  }
  return context;
}
