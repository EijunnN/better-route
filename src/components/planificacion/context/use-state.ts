"use client";

import { useState } from "react";
import type {
  Vehicle,
  Fleet,
  Order,
  Zone,
  CompanyProfile,
  CsvRow,
  StepId,
  FieldDefinition,
} from "../planificacion-types";

/**
 * Owns every useState for the planificacion feature.
 * Returning the raw setters lets sibling hooks (actions/effects) mutate state
 * without disturbing the hook-call order of the provider.
 */
export function usePlanificacionState() {
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
  /** Headers parsed from the picked CSV — fed into CsvSchemaGuide for live validation. */
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  /**
   * Raw decoded CSV text kept in state so handleCsvUpload can base64-encode it
   * and POST to /api/orders/import without re-reading the File.
   */
  const [csvRawText, setCsvRawText] = useState<string>("");

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

  return {
    // step
    currentStep,
    setCurrentStep,
    completedSteps,
    setCompletedSteps,
    // vehicles
    vehicles,
    setVehicles,
    fleets,
    setFleets,
    selectedVehicleIds,
    setSelectedVehicleIds,
    vehicleSearch,
    setVehicleSearch,
    fleetFilter,
    setFleetFilter,
    vehiclesLoading,
    setVehiclesLoading,
    // orders
    orders,
    setOrders,
    selectedOrderIds,
    setSelectedOrderIds,
    orderSearch,
    setOrderSearch,
    orderTab,
    setOrderTab,
    ordersLoading,
    setOrdersLoading,
    deletingOrderId,
    setDeletingOrderId,
    // configuration
    planName,
    setPlanName,
    planDate,
    setPlanDate,
    planTime,
    setPlanTime,
    objective,
    setObjective,
    serviceTime,
    setServiceTime,
    capacityEnabled,
    setCapacityEnabled,
    // zones
    zones,
    setZones,
    showZones,
    setShowZones,
    // company profile
    companyProfile,
    setCompanyProfile,
    // submission
    isSubmitting,
    setIsSubmitting,
    error,
    setError,
    // csv
    showCsvUpload,
    setShowCsvUpload,
    csvFile,
    setCsvFile,
    csvUploading,
    setCsvUploading,
    csvError,
    setCsvError,
    csvPreview,
    setCsvPreview,
    csvHeaders,
    setCsvHeaders,
    csvRawText,
    setCsvRawText,
    // field definitions
    fieldDefinitions,
    setFieldDefinitions,
    csvCustomFieldMappings,
    setCsvCustomFieldMappings,
    // order edit
    editingOrder,
    setEditingOrder,
    editOrderData,
    setEditOrderData,
    isUpdatingOrder,
    setIsUpdatingOrder,
    updateOrderError,
    setUpdateOrderError,
  };
}

export type PlanificacionStateBag = ReturnType<typeof usePlanificacionState>;
