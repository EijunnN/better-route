import * as XLSX from "xlsx";

interface RouteStop {
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
}

interface RouteData {
  routeId: string;
  vehicleId: string;
  vehiclePlate: string;
  driverId?: string;
  driverName?: string;
  stops: RouteStop[];
  totalDistance: number;
  totalDuration: number;
  totalWeight: number;
  totalVolume: number;
}

interface ExportData {
  routes: RouteData[];
  metrics: {
    totalDistance: number;
    totalDuration: number;
    totalRoutes: number;
    totalStops: number;
  };
  summary: {
    optimizedAt: string;
    objective: string;
  };
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleTimeString("es-PE", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDistance(meters: number): string {
  return `${(meters / 1000).toFixed(2)} km`;
}

interface PlanRow {
  "N° Parada": number;
  "Código Track": string;
  Conductor: string;
  Vehículo: string;
  Dirección: string;
  "Hora Est. Llegada": string;
  "Ventana Inicio": string;
  "Ventana Fin": string;
  Latitud: string;
  Longitud: string;
}

interface DriverRow {
  "N° Parada": number;
  "Código Track": string;
  Dirección: string;
  "Hora Est. Llegada": string;
  "Ventana Inicio": string;
  "Ventana Fin": string;
  Latitud: string;
  Longitud: string;
}

export function exportPlanToExcel(data: ExportData, filename?: string): void {
  const workbook = XLSX.utils.book_new();
  const dateStr = formatDate(data.summary.optimizedAt);

  // ========================================
  // HOJA 1: Plan General
  // ========================================
  const planRows: PlanRow[] = [];

  data.routes.forEach((route) => {
    route.stops.forEach((stop) => {
      // Handle grouped stops (multiple orders at same location)
      if (stop.groupedTrackingIds && stop.groupedTrackingIds.length > 1) {
        stop.groupedTrackingIds.forEach((trackingId) => {
          planRows.push({
            "N° Parada": stop.sequence,
            "Código Track": trackingId,
            Conductor: route.driverName || "Sin asignar",
            Vehículo: route.vehiclePlate,
            Dirección: stop.address,
            "Hora Est. Llegada": formatTime(stop.estimatedArrival),
            "Ventana Inicio": formatTime(stop.timeWindow?.start),
            "Ventana Fin": formatTime(stop.timeWindow?.end),
            Latitud: stop.latitude,
            Longitud: stop.longitude,
          });
        });
      } else {
        planRows.push({
          "N° Parada": stop.sequence,
          "Código Track": stop.trackingId,
          Conductor: route.driverName || "Sin asignar",
          Vehículo: route.vehiclePlate,
          Dirección: stop.address,
          "Hora Est. Llegada": formatTime(stop.estimatedArrival),
          "Ventana Inicio": formatTime(stop.timeWindow?.start),
          "Ventana Fin": formatTime(stop.timeWindow?.end),
          Latitud: stop.latitude,
          Longitud: stop.longitude,
        });
      }
    });
  });

  const planSheet = XLSX.utils.json_to_sheet(planRows);

  // Set column widths
  planSheet["!cols"] = [
    { wch: 10 }, // N° Parada
    { wch: 18 }, // Código Track
    { wch: 25 }, // Conductor
    { wch: 12 }, // Vehículo
    { wch: 50 }, // Dirección
    { wch: 15 }, // Hora Est. Llegada
    { wch: 15 }, // Ventana Inicio
    { wch: 15 }, // Ventana Fin
    { wch: 12 }, // Latitud
    { wch: 12 }, // Longitud
  ];

  XLSX.utils.book_append_sheet(workbook, planSheet, "Plan General");

  // ========================================
  // HOJAS POR CONDUCTOR
  // ========================================
  data.routes.forEach((route, index) => {
    const driverRows: DriverRow[] = [];

    route.stops.forEach((stop) => {
      if (stop.groupedTrackingIds && stop.groupedTrackingIds.length > 1) {
        stop.groupedTrackingIds.forEach((trackingId) => {
          driverRows.push({
            "N° Parada": stop.sequence,
            "Código Track": trackingId,
            Dirección: stop.address,
            "Hora Est. Llegada": formatTime(stop.estimatedArrival),
            "Ventana Inicio": formatTime(stop.timeWindow?.start),
            "Ventana Fin": formatTime(stop.timeWindow?.end),
            Latitud: stop.latitude,
            Longitud: stop.longitude,
          });
        });
      } else {
        driverRows.push({
          "N° Parada": stop.sequence,
          "Código Track": stop.trackingId,
          Dirección: stop.address,
          "Hora Est. Llegada": formatTime(stop.estimatedArrival),
          "Ventana Inicio": formatTime(stop.timeWindow?.start),
          "Ventana Fin": formatTime(stop.timeWindow?.end),
          Latitud: stop.latitude,
          Longitud: stop.longitude,
        });
      }
    });

    const driverSheet = XLSX.utils.json_to_sheet(driverRows);

    // Set column widths
    driverSheet["!cols"] = [
      { wch: 10 }, // N° Parada
      { wch: 18 }, // Código Track
      { wch: 50 }, // Dirección
      { wch: 15 }, // Hora Est. Llegada
      { wch: 15 }, // Ventana Inicio
      { wch: 15 }, // Ventana Fin
      { wch: 12 }, // Latitud
      { wch: 12 }, // Longitud
    ];

    // Sheet name: "Ruta N - Placa" (max 31 chars for Excel)
    const sheetName = `Ruta ${index + 1} - ${route.vehiclePlate}`.slice(0, 31);
    XLSX.utils.book_append_sheet(workbook, driverSheet, sheetName);
  });

  // ========================================
  // HOJA RESUMEN
  // ========================================
  const summaryData = [
    ["RESUMEN DEL PLAN DE RUTAS"],
    [],
    ["Fecha de optimización", dateStr],
    ["Objetivo", data.summary.objective],
    [],
    ["MÉTRICAS GENERALES"],
    ["Total de rutas", data.metrics.totalRoutes],
    ["Total de paradas", data.metrics.totalStops],
    ["Distancia total", formatDistance(data.metrics.totalDistance)],
    ["Duración total", formatDuration(data.metrics.totalDuration)],
    [],
    ["DETALLE POR RUTA"],
    ["Vehículo", "Conductor", "Paradas", "Distancia", "Duración", "Peso (kg)", "Volumen (L)"],
    ...data.routes.map((route) => [
      route.vehiclePlate,
      route.driverName || "Sin asignar",
      route.stops.length,
      formatDistance(route.totalDistance),
      formatDuration(route.totalDuration),
      route.totalWeight || 0,
      route.totalVolume || 0,
    ]),
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);

  // Set column widths for summary
  summarySheet["!cols"] = [
    { wch: 25 },
    { wch: 25 },
    { wch: 12 },
    { wch: 15 },
    { wch: 15 },
    { wch: 12 },
    { wch: 12 },
  ];

  XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumen");

  // Generate filename
  const exportFilename =
    filename || `Plan_Rutas_${dateStr.replace(/\//g, "-")}.xlsx`;

  // Download file
  XLSX.writeFile(workbook, exportFilename);
}
