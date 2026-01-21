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
  Zap,
  Target,
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

interface OptimizerEngine {
  type: string;
  name: string;
  displayName: string;
  description: string;
  available: boolean;
  capabilities: {
    supportsTimeWindows: boolean;
    supportsSkills: boolean;
    supportsMultiDimensionalCapacity: boolean;
    supportsPriorities: boolean;
    supportsBalancing: boolean;
    maxOrders: number;
    maxVehicles: number;
    speed: string;
    quality: string;
  };
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
  const [optimizerType, setOptimizerType] = useState("VROOM");
  const [optimizers, setOptimizers] = useState<OptimizerEngine[]>([]);
  const [optimizersLoading, setOptimizersLoading] = useState(true);

  // Zones state
  const [zones, setZones] = useState<Zone[]>([]);
  const [showZones, setShowZones] = useState(true);

  // Company profile state (for dynamic CSV fields)
  const [companyProfile, setCompanyProfile] = useState<{
    enableOrderValue: boolean;
    enableWeight: boolean;
    enableVolume: boolean;
    enableUnits: boolean;
    enableOrderType: boolean;
  } | null>(null);

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
      nombre_cliente: string;
      direccion: string;
      referencia: string;
      departamento: string;
      provincia: string;
      distrito: string;
      latitud: string;
      longitud: string;
      telefono: string;
      // Optional capacity fields based on company profile
      valorizado?: string;
      peso?: string;
      volumen?: string;
      unidades?: string;
      tipo_pedido?: string;
      prioridad?: string;
      ventana_horaria_inicio?: string;
      ventana_horaria_fin?: string;
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

  // Load available optimizers
  const loadOptimizers = useCallback(async () => {
    setOptimizersLoading(true);
    try {
      const response = await fetch("/api/optimization/engines");
      if (response.ok) {
        const data = await response.json();
        setOptimizers(data.data?.optimizers || []);
        // Set recommended optimizer as default
        if (data.data?.recommended) {
          setOptimizerType(data.data.recommended);
        }
      }
    } catch (err) {
      console.error("Failed to fetch optimizers:", err);
    } finally {
      setOptimizersLoading(false);
    }
  }, []);

  // Load company profile for dynamic CSV fields
  const loadCompanyProfile = useCallback(async () => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/company-profiles", {
        headers: { "x-company-id": companyId },
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

  // Parse CSV file (supports comma, tab, and semicolon delimiters)
  const parseCSV = useCallback((text: string) => {
    // Remove BOM if present (UTF-8 BOM: \uFEFF)
    const cleanText = text.replace(/^\uFEFF/, "");

    const lines = cleanText.split("\n").filter((line) => line.trim());
    if (lines.length < 2) {
      throw new Error(
        "El archivo CSV debe tener al menos una fila de encabezados y una de datos",
      );
    }

    // Auto-detect delimiter from first line
    const firstLine = lines[0];
    let delimiter = ",";
    if (firstLine.includes("\t")) {
      delimiter = "\t";
    } else if (firstLine.includes(";")) {
      delimiter = ";";
    }

    // Parse headers (first line) - normalize accents and special chars
    const normalizeHeader = (h: string) => {
      return h
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/ñ/g, "n")
        .replace(/[^a-z0-9_]/g, "_"); // Replace special chars with underscore
    };

    const headers = firstLine.split(delimiter).map((h) => normalizeHeader(h));
    const originalHeaders = firstLine
      .split(delimiter)
      .map((h) => h.trim().toLowerCase());

    const requiredHeaders = [
      "trackcode",
      "nombre_cliente",
      "direccion",
      "referencia",
      "departamento",
      "provincia",
      "distrito",
      "latitud",
      "longitud",
      "telefono",
      // Dynamic fields based on company profile
      ...(companyProfile?.enableOrderValue ? ["valorizado"] : []),
      ...(companyProfile?.enableWeight ? ["peso"] : []),
      ...(companyProfile?.enableVolume ? ["volumen"] : []),
      ...(companyProfile?.enableUnits ? ["unidades"] : []),
      ...(companyProfile?.enableOrderType ? ["tipo_pedido"] : []),
    ];

    // Check for missing headers (check both normalized and original)
    const missingHeaders = requiredHeaders.filter((h) => {
      const normalizedH = normalizeHeader(h);
      return !headers.includes(normalizedH) && !originalHeaders.includes(h);
    });

    if (missingHeaders.length > 0) {
      throw new Error(
        `Faltan columnas requeridas: ${missingHeaders.join(", ")}`,
      );
    }

    // Get column indexes (check both normalized and original headers)
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
      // Optional capacity fields
      valorizado: getIndex("valorizado"),
      peso: getIndex("peso"),
      volumen: getIndex("volumen"),
      unidades: getIndex("unidades"),
      tipo_pedido: getIndex("tipo_pedido"),
      prioridad: getIndex("prioridad"),
      // Time windows
      ventana_horaria_inicio: getIndex("ventana_horaria_inicio") !== -1
        ? getIndex("ventana_horaria_inicio")
        : getIndex("ventana horaria inicio"),
      ventana_horaria_fin: getIndex("ventana_horaria_fin") !== -1
        ? getIndex("ventana_horaria_fin")
        : getIndex("ventana horaria fin"),
    };

    // Parse data rows
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(delimiter).map((v) => v.trim());
      if (values.length >= requiredHeaders.length) {
        const row: {
          trackcode: string;
          nombre_cliente: string;
          direccion: string;
          referencia: string;
          departamento: string;
          provincia: string;
          distrito: string;
          latitud: string;
          longitud: string;
          telefono: string;
          valorizado?: string;
          peso?: string;
          volumen?: string;
          unidades?: string;
          tipo_pedido?: string;
          prioridad?: string;
          ventana_horaria_inicio?: string;
          ventana_horaria_fin?: string;
        } = {
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

        // Add optional fields if present in CSV
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

        data.push(row);
      }
    }

    return data;
  }, [companyProfile]);

  // Handle CSV file selection with proper encoding detection
  const handleCsvFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setCsvFile(file);
      setCsvError(null);

      try {
        // Read file as ArrayBuffer to detect encoding
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        // Detect encoding by checking BOM or trying to decode
        let text: string;

        // Check for UTF-8 BOM (EF BB BF)
        if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
          text = new TextDecoder("utf-8").decode(buffer);
        }
        // Check for UTF-16 LE BOM (FF FE)
        else if (bytes[0] === 0xff && bytes[1] === 0xfe) {
          text = new TextDecoder("utf-16le").decode(buffer);
        }
        // Check for UTF-16 BE BOM (FE FF)
        else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
          text = new TextDecoder("utf-16be").decode(buffer);
        }
        // Try UTF-8 first, if it fails or has replacement chars, try Windows-1252 (Latin-1)
        else {
          const utf8Text = new TextDecoder("utf-8").decode(buffer);
          // Check if UTF-8 decoding produced replacement characters (indicates wrong encoding)
          if (utf8Text.includes("\uFFFD")) {
            // Fallback to Windows-1252 (common for Excel CSV exports)
            text = new TextDecoder("windows-1252").decode(buffer);
          } else {
            text = utf8Text;
          }
        }

        const data = parseCSV(text);
        setCsvPreview(data);
      } catch (err) {
        setCsvError(
          err instanceof Error ? err.message : "Error al leer el archivo",
        );
        setCsvPreview([]);
      }
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
        } = {
          trackingId: String(row.trackcode).trim().slice(0, 50),
          address: fullAddress.slice(0, 500),
          latitude: lat,
          longitude: lng,
        };

        // Build notes with referencia, cliente and phone
        const notesParts: string[] = [];
        if (row.referencia?.trim()) {
          notesParts.push(row.referencia.trim());
        }
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

        // Extract capacity fields based on company profile
        if (row.valorizado?.trim()) {
          const val = parseInt(row.valorizado.trim(), 10);
          if (!isNaN(val) && val >= 0) {
            orderData.orderValue = val;
          }
        }
        if (row.peso?.trim()) {
          const val = parseInt(row.peso.trim(), 10);
          if (!isNaN(val) && val > 0) {
            orderData.weightRequired = val;
          }
        }
        if (row.volumen?.trim()) {
          const val = parseInt(row.volumen.trim(), 10);
          if (!isNaN(val) && val > 0) {
            orderData.volumeRequired = val;
          }
        }
        if (row.unidades?.trim()) {
          const val = parseInt(row.unidades.trim(), 10);
          if (!isNaN(val) && val > 0) {
            orderData.unitsRequired = val;
          }
        }
        if (row.tipo_pedido?.trim()) {
          const type = row.tipo_pedido.trim().toUpperCase();
          // Accept both English and Spanish values
          if (type === "NEW" || type === "NUEVO") {
            orderData.orderType = "NEW";
          } else if (type === "RESCHEDULED" || type === "REPROGRAMADO") {
            orderData.orderType = "RESCHEDULED";
          } else if (type === "URGENT" || type === "URGENTE") {
            orderData.orderType = "URGENT";
          }
        }
        if (row.prioridad?.trim()) {
          const val = parseInt(row.prioridad.trim(), 10);
          if (!isNaN(val) && val >= 0 && val <= 100) {
            orderData.priority = val;
          }
        }
        // Time windows (format: HH:mm)
        if (row.ventana_horaria_inicio?.trim()) {
          const timeStr = row.ventana_horaria_inicio.trim();
          // Validate HH:mm format
          if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeStr)) {
            orderData.timeWindowStart = timeStr;
          }
        }
        if (row.ventana_horaria_fin?.trim()) {
          const timeStr = row.ventana_horaria_fin.trim();
          // Validate HH:mm format
          if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeStr)) {
            orderData.timeWindowEnd = timeStr;
          }
        }

        validOrders.push(orderData);
      }

      if (validOrders.length === 0) {
        setCsvError(
          `No hay órdenes válidas para subir.\n${skippedRows.slice(0, 5).join("\n")}`,
        );
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
        if (result.created > 0)
          messages.push(`${result.created} órdenes creadas`);
        if (result.skipped > 0)
          messages.push(`${result.skipped} duplicados saltados`);
        if (result.invalid > 0) messages.push(`${result.invalid} inválidos`);
        if (skippedRows.length > 0)
          messages.push(`${skippedRows.length} filas sin datos`);

        if (
          result.skipped > 0 ||
          result.invalid > 0 ||
          skippedRows.length > 0
        ) {
          const details: string[] = [];
          if (result.duplicates?.length > 0) {
            details.push(
              `Duplicados: ${result.duplicates.slice(0, 3).join(", ")}${result.duplicates.length > 3 ? "..." : ""}`,
            );
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
            .map(
              (d: { field?: string; message?: string }) =>
                `${d.field}: ${d.message}`,
            )
            .join(", ");
          errorMsg = `${errorMsg}: ${details}`;
        }
        setCsvError(errorMsg);
      }
    } catch (err) {
      setCsvError(
        err instanceof Error ? err.message : "Error al subir órdenes",
      );
    } finally {
      setCsvUploading(false);
    }
  }, [companyId, csvPreview, loadOrders]);

  // Initial data load - fetch all in parallel for better performance
  useEffect(() => {
    if (companyId) {
      // Use Promise.all to fetch all data in parallel (async-parallel rule)
      Promise.all([loadFleets(), loadVehicles(), loadOrders(), loadZones(), loadOptimizers(), loadCompanyProfile()]);
    }
  }, [companyId, loadFleets, loadVehicles, loadOrders, loadZones, loadOptimizers, loadCompanyProfile]);

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
      setUpdateOrderError(
        err instanceof Error ? err.message : "Error desconocido",
      );
    } finally {
      setIsUpdatingOrder(false);
    }
  }, [editingOrder, companyId, editOrderData]);

  // Create Sets for O(1) lookups - React Compiler handles memoization automatically
  const selectedVehicleIdsSet = new Set(selectedVehicleIds);
  const selectedOrderIdsSet = new Set(selectedOrderIds);

  // Selected vehicles data for map - React Compiler handles memoization
  const selectedVehicles = vehicles.filter((v) =>
    selectedVehicleIdsSet.has(v.id),
  );

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
      setSelectedOrderIds((prev) => prev.filter((id) => !filteredSet.has(id)));
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
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
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
            <div className="h-full flex flex-col">
              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {/* Date/Time selector */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label
                      htmlFor="plan-date"
                      className="text-xs text-muted-foreground"
                    >
                      Fecha
                    </Label>
                    <Input
                      id="plan-date"
                      type="date"
                      value={planDate}
                      onChange={(e) => setPlanDate(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <Label
                      htmlFor="plan-time"
                      className="text-xs text-muted-foreground"
                    >
                      Hora inicio
                    </Label>
                    <Input
                      id="plan-time"
                      type="time"
                      value={planTime}
                      onChange={(e) => setPlanTime(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>

                {/* Fleet filter and Search in row */}
                <div className="flex gap-2">
                  <Select value={fleetFilter} onValueChange={setFleetFilter}>
                    <SelectTrigger className="w-[140px] h-9">
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
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar..."
                      value={vehicleSearch}
                      onChange={(e) => setVehicleSearch(e.target.value)}
                      className="pl-8 h-9"
                    />
                  </div>
                </div>

                {/* Select all */}
                {filteredVehicles.length > 0 && (
                  <div className="flex items-center justify-between py-1.5 px-2 bg-muted/50 rounded-md">
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
                    <Badge variant="secondary" className="text-xs">
                      {selectedVehicleIds.length}/{filteredVehicles.length}
                    </Badge>
                  </div>
                )}

                {/* Vehicle list */}
                <div className="space-y-1.5">
                  {vehiclesLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                  ) : filteredVehicles.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <Truck className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No hay vehículos disponibles</p>
                    </div>
                  ) : (
                    filteredVehicles.map((vehicle) => (
                      <label
                        key={vehicle.id}
                        htmlFor={`vehicle-${vehicle.id}`}
                        className={`block p-2 rounded-md border cursor-pointer transition-colors ${
                          selectedVehicleIdsSet.has(vehicle.id)
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50 hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`vehicle-${vehicle.id}`}
                            checked={selectedVehicleIdsSet.has(vehicle.id)}
                            onCheckedChange={() => toggleVehicle(vehicle.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">
                                {vehicle.plate || vehicle.name}
                              </span>
                              {vehicle.type && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  {vehicle.type}
                                </Badge>
                              )}
                              {vehicle.assignedDriver && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  {vehicle.assignedDriver.name}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                              {vehicle.weightCapacity && (
                                <span>{vehicle.weightCapacity}kg</span>
                              )}
                              {vehicle.volumeCapacity && (
                                <span>{vehicle.volumeCapacity}L</span>
                              )}
                              {vehicle.maxOrders && (
                                <span>Max {vehicle.maxOrders}</span>
                              )}
                              {vehicle.originAddress && (
                                <span className="truncate flex items-center gap-1">
                                  <MapPin className="w-3 h-3 shrink-0" />
                                  {vehicle.originAddress}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Next button - Fixed at bottom */}
              <div className="p-4 border-t bg-background">
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
            <div className="h-full flex flex-col">
              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {/* Header with upload button */}
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted-foreground">
                    Pedidos pendientes
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => setShowCsvUpload(true)}
                  >
                    <Upload className="w-3.5 h-3.5 mr-1.5" />
                    CSV
                  </Button>
                </div>

                {/* Tabs */}
                <Tabs value={orderTab} onValueChange={setOrderTab}>
                  <TabsList className="w-full h-8">
                    <TabsTrigger value="todas" className="flex-1 text-xs h-7">
                      Todas ({orders.length})
                    </TabsTrigger>
                    <TabsTrigger value="alertas" className="flex-1 text-xs h-7">
                      <AlertTriangle className="w-3 h-3 mr-1" />(
                      {ordersWithIssues.length})
                    </TabsTrigger>
                    <TabsTrigger
                      value="conHorario"
                      className="flex-1 text-xs h-7"
                    >
                      <Clock className="w-3 h-3 mr-1" />
                      Horario
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="todas" className="mt-0" />
                  <TabsContent value="alertas" className="mt-0" />
                  <TabsContent value="conHorario" className="mt-0" />
                </Tabs>

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar..."
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>

                {/* Select all */}
                {filteredOrders.length > 0 && (
                  <div className="flex items-center justify-between py-1.5 px-2 bg-muted/50 rounded-md">
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
                    <Badge variant="secondary" className="text-xs">
                      {selectedOrderIds.length}/{filteredOrders.length}
                    </Badge>
                  </div>
                )}

                {/* Order list - compact */}
                <div className="space-y-1">
                  {ordersLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                  ) : filteredOrders.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No hay pedidos pendientes</p>
                    </div>
                  ) : (
                    filteredOrders.map((order) => {
                      const hasIssue = !order.latitude || !order.longitude;
                      return (
                        <label
                          key={order.id}
                          htmlFor={`order-${order.id}`}
                          className={`block p-2 rounded-md border cursor-pointer transition-colors ${
                            selectedOrderIdsSet.has(order.id)
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50 hover:bg-muted/50"
                          } ${hasIssue ? "border-orange-300 bg-orange-50/50 dark:bg-orange-950/20" : ""}`}
                        >
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`order-${order.id}`}
                              checked={selectedOrderIdsSet.has(order.id)}
                              onCheckedChange={() => toggleOrder(order.id)}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-sm truncate">
                                  {order.trackingId}
                                </span>
                                {hasIssue && (
                                  <AlertTriangle className="w-3 h-3 text-orange-500 shrink-0" />
                                )}
                                {order.priority === "HIGH" && (
                                  <Badge
                                    variant="destructive"
                                    className="text-[10px] px-1 py-0 h-4"
                                  >
                                    !
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                {order.customerName && (
                                  <span className="truncate">
                                    {order.customerName}
                                  </span>
                                )}
                                {order.customerName && order.address && (
                                  <span>·</span>
                                )}
                                <span className="truncate">
                                  {order.address}
                                </span>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="shrink-0 h-6 w-6 p-0"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                openEditOrder(order);
                              }}
                              title="Editar"
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Navigation buttons - Fixed at bottom */}
              <div className="p-4 border-t bg-background flex gap-2">
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
            <div className="h-full flex flex-col">
              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
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

                {/* Optimizer Engine */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      Motor de optimización
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Selecciona el algoritmo de optimización
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {optimizersLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin" />
                      </div>
                    ) : optimizers.length === 0 ? (
                      <div className="text-sm text-muted-foreground text-center py-4">
                        No hay motores disponibles
                      </div>
                    ) : (
                      optimizers.map((opt) => (
                        <button
                          key={opt.type}
                          type="button"
                          onClick={() => opt.available && setOptimizerType(opt.type)}
                          disabled={!opt.available}
                          className={`w-full p-3 rounded-lg border text-left transition-colors ${
                            optimizerType === opt.type
                              ? "border-primary bg-primary/5"
                              : opt.available
                                ? "border-border hover:border-primary/50"
                                : "border-border opacity-50 cursor-not-allowed"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {opt.type === "VROOM" ? (
                              <Zap className="w-4 h-4 text-yellow-500" />
                            ) : (
                              <Target className="w-4 h-4 text-blue-500" />
                            )}
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">
                                  {opt.type === "VROOM" ? "Optimización Rápida" : "Optimización Avanzada"}
                                </span>
                                {!opt.available && (
                                  <Badge variant="outline" className="text-[10px]">
                                    No disponible
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {opt.type === "VROOM"
                                  ? "Rutas en segundos - Ideal para planificación diaria"
                                  : "Máxima calidad - Para optimización a largo plazo"}
                              </p>
                            </div>
                          </div>
                          {opt.available && (
                            <div className="flex gap-2 mt-2 flex-wrap">
                              <Badge variant="secondary" className="text-[10px]">
                                {opt.capabilities.speed}
                              </Badge>
                              <Badge variant="secondary" className="text-[10px]">
                                {opt.capabilities.quality}
                              </Badge>
                              {opt.capabilities.supportsTimeWindows && (
                                <Badge variant="outline" className="text-[10px]">
                                  Ventanas horarias
                                </Badge>
                              )}
                              {opt.capabilities.supportsSkills && (
                                <Badge variant="outline" className="text-[10px]">
                                  Habilidades
                                </Badge>
                              )}
                            </div>
                          )}
                        </button>
                      ))
                    )}
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
                        className={`w-full p-3 rounded-lg border text-left transition-colors ${
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
              </div>

              {/* Action buttons - Fixed at bottom */}
              <div className="p-4 border-t bg-background space-y-2">
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
            vehicles={
              currentStep === "vehiculos" ? filteredVehicles : selectedVehicles
            }
            orders={selectedOrders}
            zones={showZones ? zones : []}
            showVehicleOrigins={currentStep === "vehiculos"}
            showOrders={
              currentStep === "visitas" || currentStep === "configuracion"
            }
            selectedVehicleIds={
              currentStep === "vehiculos" ? selectedVehicleIds : undefined
            }
          />

          {/* Map controls */}
          <div className="absolute top-4 right-4 flex flex-col gap-2">
            {/* Zone toggle */}
            {zones.length > 0 && (
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
            <DialogDescription className="space-y-1">
              <span className="block">
                Headers requeridos:{" "}
                <span className="font-mono text-xs">
                  trackcode, nombre_cliente, direccion, referencia, departamento, provincia,
                  distrito, latitud, longitud, telefono
                  {companyProfile?.enableOrderValue && ", valorizado"}
                  {companyProfile?.enableWeight && ", peso"}
                  {companyProfile?.enableVolume && ", volumen"}
                  {companyProfile?.enableUnits && ", unidades"}
                  {companyProfile?.enableOrderType && ", tipo_pedido"}
                </span>
              </span>
              <span className="block text-muted-foreground text-xs">
                * referencia y telefono: header requerido, datos opcionales
                {companyProfile?.enableOrderType && ". prioridad: opcional (0-100)"}
              </span>
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
                            Cliente
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
                            <td className="px-2 py-1.5 truncate max-w-[120px] text-xs">
                              {row.nombre_cliente || (
                                <span className="text-muted-foreground">-</span>
                              )}
                              {row.telefono && (
                                <span className="block text-muted-foreground">
                                  {row.telefono}
                                </span>
                              )}
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
      <Dialog
        open={!!editingOrder}
        onOpenChange={(open) => !open && setEditingOrder(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar ubicación del pedido</DialogTitle>
            <DialogDescription>
              {editingOrder?.trackingId} -{" "}
              {editingOrder?.customerName || "Sin nombre"}
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
                  setEditOrderData((prev) => ({
                    ...prev,
                    address: e.target.value,
                  }))
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
                    setEditOrderData((prev) => ({
                      ...prev,
                      latitude: e.target.value,
                    }))
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
                    setEditOrderData((prev) => ({
                      ...prev,
                      longitude: e.target.value,
                    }))
                  }
                  placeholder="-77.0428"
                />
              </div>
            </div>

            {/* Coordinates hint */}
            <p className="text-xs text-muted-foreground">
              Puedes obtener las coordenadas desde Google Maps haciendo clic
              derecho en el punto y copiando las coordenadas.
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
