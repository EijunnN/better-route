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
  activeStopsCount?: number;
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

export interface CompanyProfile {
  enableOrderValue: boolean;
  enableWeight: boolean;
  enableVolume: boolean;
  enableUnits: boolean;
  enableOrderType: boolean;
}

/**
 * One parsed CSV row keyed by the raw header as it appeared in the file.
 * The server (/api/orders/import) does the actual mapping + validation via
 * profile-schema; the client only parses for a lightweight preview.
 */
export type CsvRow = Record<string, string>;

export interface FieldDefinition {
  id: string;
  code: string;
  label: string;
  fieldType: string;
  required: boolean;
  showInList: boolean;
  showInMobile: boolean;
  showInCsv: boolean;
  options: string[] | null;
  defaultValue: string | null;
  active: boolean;
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
