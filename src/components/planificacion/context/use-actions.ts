"use client";

import type { useRouter } from "next/navigation";
import type { CsvImportPreview } from "@/components/orders/csv-import-preview-dialog";
import { ApiError, useApiMutation } from "@/hooks/use-api-mutation";
import type { useToast } from "@/hooks/use-toast";
import { parseCSVLine } from "@/lib/csv/parse-csv-line";
import type { CsvRow, Order, StepId } from "../planificacion-types";
import type { PlanificacionActions, PlanificacionDerived } from "./types";
import { STEPS } from "./types";
import type { PlanificacionStateBag } from "./use-state";

interface ActionsDeps {
  state: PlanificacionStateBag;
  derived: PlanificacionDerived;
  companyId: string | null;
  router: ReturnType<typeof useRouter>;
  toast: ReturnType<typeof useToast>["toast"];
  loadOrders: (signal?: AbortSignal) => Promise<void>;
}

/**
 * Assembles the PlanificacionActions bag. All functions are recreated on each
 * render, matching the original provider's behavior (no memoization).
 */
export function usePlanificacionActions(
  deps: ActionsDeps,
): PlanificacionActions {
  const { state, derived, companyId, router, toast, loadOrders } = deps;
  const apiMutate = useApiMutation();
  const {
    currentStep,
    setCurrentStep,
    setCompletedSteps,
    setSelectedVehicleIds,
    setSelectedOrderIds,
    setVehicleSearch,
    setFleetFilter,
    setOrderSearch,
    setOrderTab,
    setPlanName,
    setPlanDate,
    setPlanTime,
    setObjective,
    setServiceTime,
    setOptimizationPresetId,
    setShowZones,
    setError,
    setShowCsvUpload,
    setCsvFile,
    setCsvPreview,
    setCsvHeaders,
    setCsvRawText,
    setCsvError,
    setCsvUploading,
    setCsvPreviewData,
    setShowCsvPreviewDialog,
    setCsvCustomFieldMappings,
    setDeletingOrderId,
    setIsDiscardingPending,
    setOrders,
    setIsSubmitting,
    setEditingOrder,
    setEditOrderData,
    setIsUpdatingOrder,
    setUpdateOrderError,
    selectedVehicleIds,
    selectedOrderIds,
    planName,
    planDate,
    planTime,
    objective,
    serviceTime,
    optimizationPresetId,
    csvRawText,
    editingOrder,
    editOrderData,
  } = state;

  const {
    filteredVehicles,
    filteredOrders,
    selectedVehicles,
    selectedVehicleIdsSet,
    selectedOrderIdsSet,
    canProceedFromVehiculos,
    canProceedFromVisitas,
  } = derived;

  // Actions
  const goToStep = (step: StepId) => {
    const targetIndex = STEPS.indexOf(step);
    // Avanzar requiere que cada paso previo sea válido; retroceder siempre se permite.
    if (targetIndex >= 1 && !canProceedFromVehiculos) return;
    if (targetIndex >= 2 && !canProceedFromVisitas) return;
    if (targetIndex > STEPS.indexOf(currentStep)) {
      setCompletedSteps(
        (prev) => new Set([...prev, ...STEPS.slice(0, targetIndex)]),
      );
    }
    setCurrentStep(step);
  };

  const nextStep = () => {
    const currentIndex = STEPS.indexOf(currentStep);
    if (currentIndex < STEPS.length - 1) {
      setCompletedSteps((prev) => new Set([...prev, currentStep]));
      setCurrentStep(STEPS[currentIndex + 1]);
    }
  };

  const prevStep = () => {
    const currentIndex = STEPS.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(STEPS[currentIndex - 1]);
    }
  };

  const toggleVehicle = (id: string) => {
    setSelectedVehicleIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
  };

  const selectAllVehicles = () => {
    // Exclude vehicles with active route stops from selection
    const selectableVehicles = filteredVehicles.filter(
      (v) => !(v.activeStopsCount && v.activeStopsCount > 0),
    );
    const allSelected = selectableVehicles.every((v) =>
      selectedVehicleIdsSet.has(v.id),
    );
    if (allSelected) {
      const filteredSet = new Set(selectableVehicles.map((v) => v.id));
      setSelectedVehicleIds((prev) =>
        prev.filter((id) => !filteredSet.has(id)),
      );
    } else {
      const newIds = selectableVehicles.map((v) => v.id);
      setSelectedVehicleIds((prev) => [...new Set([...prev, ...newIds])]);
    }
  };

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

  const deselectOrders = (ids: string[]) => {
    const idsSet = new Set(ids);
    setSelectedOrderIds((prev) => prev.filter((id) => !idsSet.has(id)));
  };

  /**
   * Soft-delete dirigido (lasso): POST a /api/orders/batch/delete con ids
   * explícitos. Quedan inactivos — fuera de la próxima optimización pero
   * auditables, igual que el "Eliminar seleccionados" de results.
   */
  const deleteOrdersBulk = async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      const json = await apiMutate<{ deleted?: number }>(
        "/api/orders/batch/delete",
        {
          method: "DELETE",
          body: { orderIds: ids },
          errorTitle: "Error al eliminar pedidos",
          errorMessage: "No se pudieron eliminar los pedidos",
        },
      );
      const idsSet = new Set(ids);
      setOrders((prev) => prev.filter((o) => !idsSet.has(o.id)));
      setSelectedOrderIds((prev) => prev.filter((id) => !idsSet.has(id)));
      toast({
        title: "Pedidos eliminados",
        description: `${json?.deleted ?? ids.length} pedido(s) fuera de la planificación.`,
      });
    } catch {
      // apiMutate ya reportó el fallo por toast.
    }
  };

  const deleteOrder = async (id: string) => {
    setDeletingOrderId(id);
    try {
      await apiMutate(`/api/orders/${id}`, {
        method: "DELETE",
        errorTitle: "Error al eliminar pedido",
      });
      setOrders((prev) => prev.filter((o) => o.id !== id));
      setSelectedOrderIds((prev) => prev.filter((oid) => oid !== id));
    } catch {
      // apiMutate ya reportó el fallo por toast.
    } finally {
      setDeletingOrderId(null);
    }
  };

  /**
   * Discard the whole uncommitted draft pool: soft-deletes every PENDING order
   * for the tenant. Assigned/in-progress orders (already committed to a plan)
   * are untouched. Frees their trackingIds for re-import.
   */
  const discardPendingOrders = async () => {
    setIsDiscardingPending(true);
    await apiMutate<{ deleted?: number }>(
      "/api/orders/batch/delete?status=PENDING",
      {
        method: "DELETE",
        rethrow: false,
        errorTitle: "Error al descartar pedidos",
        errorMessage: "No se pudieron descartar los pedidos",
        revalidate: async () => {
          setSelectedOrderIds([]);
          await loadOrders();
        },
        success: (json) => ({
          title: "Pedidos pendientes descartados",
          description: `${json?.deleted ?? 0} pedido(s) eliminados del borrador.`,
        }),
      },
    );
    setIsDiscardingPending(false);
  };

  const handleSubmit = async () => {
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

      const configData = await apiMutate<{ data: { id: string } }>(
        "/api/optimization/configure",
        {
          body: {
            name: finalName,
            depotLatitude: selectedVehicles[0]?.originLatitude || "-12.0464",
            depotLongitude: selectedVehicles[0]?.originLongitude || "-77.0428",
            depotAddress: selectedVehicles[0]?.originAddress || "Depot",
            selectedVehicleIds: JSON.stringify(selectedVehicleIds),
            selectedDriverIds: JSON.stringify(driverIds),
            selectedOrderIds: JSON.stringify(selectedOrderIds),
            objective,
            workWindowStart: planTime,
            workWindowEnd: "20:00",
            serviceTimeMinutes: serviceTime,
            timeWindowStrictness: "SOFT",
            penaltyFactor: 5,
            optimizerType: "VROOM",
            optimizationPresetId,
          },
          errorMessage: "Error al crear la configuración",
        },
      );

      if (configData) {
        router.push(`/planificacion/${configData.data.id}/results`);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al iniciar la optimización",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Minimal client-side CSV parse. Produces rows keyed by raw header for preview
   * + live validation via CsvSchemaGuide. Authoritative validation + mapping
   * happens server-side in /api/orders/import (powered by profile-schema).
   */
  const parseCsvPreview = (
    text: string,
  ): {
    headers: string[];
    rows: CsvRow[];
  } => {
    const cleanText = text.replace(/^\uFEFF/, "");
    const lines = cleanText.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      throw new Error(
        "El archivo CSV debe tener al menos una fila de encabezados y una de datos",
      );
    }

    const firstLine = lines[0];
    let delimiter = ",";
    if (firstLine.includes("\t")) delimiter = "\t";
    else if (firstLine.includes(";")) delimiter = ";";

    const headerFields = parseCSVLine(firstLine, delimiter).map((h) =>
      h.trim(),
    );
    const rows: CsvRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i], delimiter).map((v) => v.trim());
      const row: CsvRow = {};
      headerFields.forEach((h, idx) => {
        row[h] = values[idx] ?? "";
      });
      rows.push(row);
    }

    return { headers: headerFields, rows };
  };

  const handleCsvFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    setCsvError(null);

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      let text: string;
      // .xlsx is a zip archive (magic bytes "PK"). Convert it to CSV with
      // SheetJS (lazy-loaded) so the rest of the pipeline stays CSV-only.
      if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(bytes, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        text = XLSX.utils.sheet_to_csv(sheet, { FS: ";" });
      } else if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        text = new TextDecoder("utf-8").decode(buffer);
      } else if (bytes[0] === 0xff && bytes[1] === 0xfe) {
        text = new TextDecoder("utf-16le").decode(buffer);
      } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        text = new TextDecoder("utf-16be").decode(buffer);
      } else {
        const utf8Text = new TextDecoder("utf-8").decode(buffer);
        text = utf8Text.includes("\uFFFD")
          ? new TextDecoder("windows-1252").decode(buffer)
          : utf8Text;
      }

      setCsvRawText(text);
      const { headers, rows } = parseCsvPreview(text);
      setCsvHeaders(headers);
      setCsvPreview(rows);
    } catch (err) {
      // Keep csvHeaders if previously set so the schema guide still shows
      // which required columns are missing.
      setCsvError(
        err instanceof Error ? err.message : "Error al leer el archivo",
      );
      setCsvPreview([]);
    }
  };

  /**
   * Base64-encode a UTF-8 string safely in the browser.
   * (btoa(unescape(encodeURIComponent(s))) was the old idiom; the TextEncoder
   * variant avoids unicode pitfalls.)
   */
  const toBase64Utf8 = (text: string): string => {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  };

  /**
   * Phase 1: post the CSV to the preview endpoint, get a classified
   * preview back, and open the preview dialog. The actual writes happen
   * in `handleCsvConfirm` once the operator approves.
   */
  const handleCsvUpload = async () => {
    if (!csvRawText) return;

    setCsvUploading(true);
    setCsvError(null);

    try {
      const result = await apiMutate<{ data: CsvImportPreview }>(
        "/api/orders/csv-import/preview",
        {
          body: { csvContent: toBase64Utf8(csvRawText) },
          errorMessage: "Error al previsualizar el CSV",
        },
      );
      if (!result) return;

      setCsvPreviewData(result.data);
      setShowCsvUpload(false);
      setShowCsvPreviewDialog(true);
    } catch (err) {
      if (err instanceof ApiError) {
        const headline = err.error || "Error al previsualizar el CSV";
        setCsvError(err.details ? `${headline}: ${err.details}` : headline);
        return;
      }
      setCsvError(
        err instanceof Error ? err.message : "Error al previsualizar el CSV",
      );
    } finally {
      setCsvUploading(false);
    }
  };

  /**
   * Phase 2: confirm the preview. Returns the result so the dialog can
   * display counts in a toast; throws on error so the dialog can show
   * a destructive toast itself.
   */
  const handleCsvConfirm = async (input: {
    previewId: string;
    reactivableSelections: string[];
  }) => {
    const json = await apiMutate<{
      data: {
        inserted: number;
        reactivated: number;
        failed?: number;
        errors?: string[];
        raceConditions: Array<{
          existingOrderId: string;
          trackingId: string;
          actualStatus: string;
        }>;
      };
    }>("/api/orders/csv-import/confirm", {
      body: input,
      errorMessage: "Error al confirmar",
      revalidate: loadOrders,
    });
    return json?.data ?? null;
  };

  /** Reset CSV state and close both dialogs after success or cancel. */
  const handleCsvDone = () => {
    setShowCsvPreviewDialog(false);
    setCsvPreviewData(null);
    setShowCsvUpload(false);
    setCsvFile(null);
    setCsvPreview([]);
    setCsvHeaders([]);
    setCsvRawText("");
    setCsvError(null);
  };

  const resetCsvState = () => {
    setShowCsvUpload(false);
    setCsvFile(null);
    setCsvPreview([]);
    setCsvHeaders([]);
    setCsvRawText("");
    setCsvError(null);
    setCsvCustomFieldMappings([]);
  };

  const downloadCsvTemplate = async () => {
    if (!companyId) return;
    try {
      const response = await fetch(
        "/api/orders/csv-template?format=csv&locale=es",
        {
          headers: { "x-company-id": companyId },
        },
      );
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
      setCsvError(
        err instanceof Error ? err.message : "Error al descargar la plantilla",
      );
    }
  };

  const openEditOrder = (order: Order) => {
    setEditingOrder(order);
    setEditOrderData({
      address: order.address || "",
      latitude: order.latitude || "",
      longitude: order.longitude || "",
    });
    setUpdateOrderError(null);
  };

  const saveOrderChanges = async () => {
    if (!editingOrder) return;

    setIsUpdatingOrder(true);
    setUpdateOrderError(null);

    try {
      await apiMutate(`/api/orders/${editingOrder.id}`, {
        method: "PATCH",
        body: {
          address: editOrderData.address,
          latitude: editOrderData.latitude || null,
          longitude: editOrderData.longitude || null,
        },
        errorMessage: "Error al actualizar el pedido",
      });

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
  };

  const closeEditOrder = () => {
    setEditingOrder(null);
  };

  const updateOrderLocation = async (
    orderId: string,
    latitude: string,
    longitude: string,
  ) => {
    await apiMutate(`/api/orders/${orderId}`, {
      method: "PATCH",
      body: { latitude, longitude },
      errorMessage: "Error al actualizar ubicación",
    });

    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, latitude, longitude } : o)),
    );
  };

  return {
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
    deselectOrders,
    deleteOrder,
    deleteOrdersBulk,
    discardPendingOrders,
    setPlanName,
    setPlanDate,
    setPlanTime,
    setObjective,
    setServiceTime,
    setOptimizationPresetId,
    setShowZones,
    handleSubmit,
    setError,
    setShowCsvUpload,
    handleCsvFileChange,
    handleCsvUpload,
    handleCsvConfirm,
    handleCsvDone,
    resetCsvState,
    downloadCsvTemplate,
    openEditOrder,
    setEditOrderData,
    saveOrderChanges,
    closeEditOrder,
    updateOrderLocation,
  };
}
