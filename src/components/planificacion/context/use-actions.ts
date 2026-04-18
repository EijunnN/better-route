"use client";

import { parseCSVLine } from "@/lib/csv/parse-csv-line";
import type { useRouter } from "next/navigation";
import type { useToast } from "@/hooks/use-toast";
import type {
  Order,
  CsvRow,
  StepId,
} from "../planificacion-types";
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
export function usePlanificacionActions(deps: ActionsDeps): PlanificacionActions {
  const { state, derived, companyId, router, toast, loadOrders } = deps;
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
    setCapacityEnabled,
    setOptimizerType,
    setShowZones,
    setError,
    setShowCsvUpload,
    setCsvFile,
    setCsvPreview,
    setCsvHeaders,
    setCsvError,
    setCsvUploading,
    setCsvCustomFieldMappings,
    setDeletingOrderId,
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
    capacityEnabled,
    optimizerType,
    csvPreview,
    fieldDefinitions,
    companyProfile,
    editingOrder,
    editOrderData,
  } = state;

  const { filteredVehicles, filteredOrders, selectedVehicles, selectedVehicleIdsSet, selectedOrderIdsSet } = derived;

  // Actions
  const goToStep = (step: StepId) => {
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
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );
  };

  const selectAllVehicles = () => {
    // Exclude vehicles with active route stops from selection
    const selectableVehicles = filteredVehicles.filter((v) => !(v.activeStopsCount && v.activeStopsCount > 0));
    const allSelected = selectableVehicles.every((v) => selectedVehicleIdsSet.has(v.id));
    if (allSelected) {
      const filteredSet = new Set(selectableVehicles.map((v) => v.id));
      setSelectedVehicleIds((prev) => prev.filter((id) => !filteredSet.has(id)));
    } else {
      const newIds = selectableVehicles.map((v) => v.id);
      setSelectedVehicleIds((prev) => [...new Set([...prev, ...newIds])]);
    }
  };

  const toggleOrder = (id: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((o) => o !== id) : [...prev, id]
    );
  };

  const selectAllOrders = () => {
    const allSelected = filteredOrders.every((o) => selectedOrderIdsSet.has(o.id));
    if (allSelected) {
      const filteredSet = new Set(filteredOrders.map((o) => o.id));
      setSelectedOrderIds((prev) => prev.filter((id) => !filteredSet.has(id)));
    } else {
      const newIds = filteredOrders.map((o) => o.id);
      setSelectedOrderIds((prev) => [...new Set([...prev, ...newIds])]);
    }
  };

  const deleteOrder = async (id: string) => {
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
  };

  // CSV parsing
  const parseCSV = (text: string): CsvRow[] => {
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

      // Publish the headers BEFORE any required-field check so the
      // CsvSchemaGuide can light up the matched/missing chips even if the
      // file ultimately fails validation.
      setCsvHeaders(rawHeaders);

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
    };

  const handleCsvFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      // Don't wipe csvHeaders on error — the schema guide uses them to show
      // which required columns are missing. Only the preview/error are reset.
      setCsvError(err instanceof Error ? err.message : "Error al leer el archivo");
      setCsvPreview([]);
    }
  };

  const handleCsvUpload = async () => {
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
          setCsvHeaders([]);
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
  };

  const resetCsvState = () => {
    setShowCsvUpload(false);
    setCsvFile(null);
    setCsvPreview([]);
    setCsvHeaders([]);
    setCsvError(null);
    setCsvCustomFieldMappings([]);
  };

  const downloadCsvTemplate = async () => {
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
  };

  const closeEditOrder = () => {
    setEditingOrder(null);
  };

  const updateOrderLocation = async (orderId: string, latitude: string, longitude: string) => {
    if (!companyId) return;

    const response = await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-company-id": companyId,
      },
      body: JSON.stringify({ latitude, longitude }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Error al actualizar ubicación");
    }

    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, latitude, longitude } : o
      )
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
    updateOrderLocation,
  };
}
