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
} from "../planificacion-types";

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
  updateOrderLocation: (orderId: string, latitude: string, longitude: string) => Promise<void>;
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

export interface PlanificacionContextValue {
  state: PlanificacionState;
  actions: PlanificacionActions;
  meta: PlanificacionMeta;
  derived: PlanificacionDerived;
}

export const STEPS: StepId[] = ["vehiculos", "visitas", "configuracion"];
