// Types for Planificacion
export interface Vehicle {
  id: string;
  name: string;
  plate: string | null;
  type: string | null;
  weightCapacity: number | null;
  volumeCapacity: number | null;
  maxValueCapacity: number | null;
  maxUnitsCapacity: number | null;
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

export interface Fleet {
  id: string;
  name: string;
}

export interface Order {
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

export interface OptimizerEngine {
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

export interface CompanyProfile {
  enableOrderValue: boolean;
  enableWeight: boolean;
  enableVolume: boolean;
  enableUnits: boolean;
  enableOrderType: boolean;
}

export interface CsvRow {
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
}

export type StepId = "vehiculos" | "visitas" | "configuracion";

export interface StepConfig {
  id: StepId;
  label: string;
  icon: React.ElementType;
}

export const OBJECTIVES = [
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
] as const;
