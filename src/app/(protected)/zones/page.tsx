"use client";

import {
  Calendar,
  Check,
  ChevronRight,
  Edit3,
  Layers,
  Loader2,
  MapPin,
  Plus,
  Settings2,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { ProtectedPage } from "@/components/auth/protected-page";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { ZoneForm } from "@/components/zones/zone-form";
import { useCompanyContext } from "@/hooks/use-company-context";
import { CompanySelector } from "@/components/company-selector";
import { useToast } from "@/hooks/use-toast";
import { ZONE_TYPE_LABELS, type ZoneInput } from "@/lib/validations/zone";

// Dynamic map components (bundle-dynamic-imports rule)
const ZoneMapEditor = dynamic(
  () => import("@/components/zones/zone-map-editor").then((mod) => mod.ZoneMapEditor),
  {
    ssr: false,
    loading: () => (
      <div className="h-full bg-muted animate-pulse rounded-lg flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

const ZonePreviewMap = dynamic(
  () => import("@/components/zones/zone-preview-map").then((mod) => mod.ZonePreviewMap),
  {
    ssr: false,
    loading: () => <div className="h-full bg-muted animate-pulse rounded-lg" />,
  }
);

const ZoneFormPreview = dynamic(
  () => import("@/components/zones/zone-form-preview").then((mod) => mod.ZoneFormPreview),
  {
    ssr: false,
    loading: () => <div className="h-full bg-muted animate-pulse rounded-lg" />,
  }
);

interface Zone {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  geometry: string;
  parsedGeometry?: {
    type: "Polygon";
    coordinates: number[][][];
  } | null;
  color: string;
  isDefault: boolean;
  activeDays?: string[] | null;
  active: boolean;
  vehicleCount: number;
  vehicles?: Array<{ id: string; name: string; plate: string | null }>;
  createdAt: string;
  updatedAt: string;
}

interface VehicleOption {
  id: string;
  name: string;
  plate: string | null;
}

type ViewMode = "list" | "form" | "map-editor";

const DAY_LABELS: Record<string, string> = {
  MONDAY: "Lun",
  TUESDAY: "Mar",
  WEDNESDAY: "Mié",
  THURSDAY: "Jue",
  FRIDAY: "Vie",
  SATURDAY: "Sáb",
  SUNDAY: "Dom",
};

function ZonesPageContent() {
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
  const [zones, setZones] = useState<Zone[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [editingZoneVehicleIds, setEditingZoneVehicleIds] = useState<string[]>([]);
  const [pendingFormData, setPendingFormData] = useState<Partial<ZoneInput> | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchZones = useCallback(async () => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/zones", {
        headers: { "x-company-id": companyId },
      });
      const data = await response.json();
      setZones(data.data || []);
    } catch (error) {
      console.error("Error fetching zones:", error);
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  const fetchVehicles = useCallback(async () => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/vehicles?limit=100", {
        headers: { "x-company-id": companyId },
      });
      const data = await response.json();
      setVehicles(
        (data.data || []).map((v: { id: string; name?: string; plate?: string | null }) => ({
          id: v.id,
          name: v.name || v.plate || "Sin nombre",
          plate: v.plate ?? null,
        }))
      );
    } catch (error) {
      console.error("Error fetching vehicles:", error);
    }
  }, [companyId]);

  useEffect(() => {
    if (companyId) {
      fetchZones();
      fetchVehicles();
    }
  }, [companyId, fetchZones, fetchVehicles]);

  const handleCreate = async (data: ZoneInput, vehicleIds: string[]) => {
    try {
      const response = await fetch("/api/zones", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-company-id": companyId ?? "" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al crear zona");
      }

      const createdZone = await response.json();
      if (vehicleIds.length > 0 && createdZone.id) {
        await fetch(`/api/zones/${createdZone.id}/vehicles`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-company-id": companyId ?? "" },
          body: JSON.stringify({ vehicleIds, assignedDays: data.activeDays || null }),
        });
      }

      await fetchZones();
      setViewMode("list");
      setPendingFormData(null);
      toast({
        title: "Zona creada",
        description: `La zona "${data.name}" ha sido creada exitosamente.`,
      });
    } catch (err) {
      toast({
        title: "Error al crear zona",
        description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleUpdate = async (data: ZoneInput, vehicleIds: string[]) => {
    if (!editingZone) return;

    try {
      const response = await fetch(`/api/zones/${editingZone.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-company-id": companyId ?? "" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al actualizar zona");
      }

      await fetch(`/api/zones/${editingZone.id}/vehicles`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-company-id": companyId ?? "" },
        body: JSON.stringify({ vehicleIds, assignedDays: data.activeDays || null }),
      });

      await fetchZones();
      setEditingZone(null);
      setEditingZoneVehicleIds([]);
      setViewMode("list");
      setPendingFormData(null);
      toast({
        title: "Zona actualizada",
        description: `La zona "${data.name}" ha sido actualizada exitosamente.`,
      });
    } catch (err) {
      toast({
        title: "Error al actualizar zona",
        description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const zone = zones.find((z) => z.id === id);

    try {
      const response = await fetch(`/api/zones/${id}`, {
        method: "DELETE",
        headers: { "x-company-id": companyId ?? "" },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al desactivar la zona");
      }

      if (selectedZoneId === id) setSelectedZoneId(null);
      await fetchZones();
      toast({
        title: "Zona desactivada",
        description: zone
          ? `La zona "${zone.name}" ha sido desactivada.`
          : "La zona ha sido desactivada.",
      });
    } catch (err) {
      toast({
        title: "Error al desactivar zona",
        description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleStartNew = () => {
    setEditingZone(null);
    setEditingZoneVehicleIds([]);
    setPendingFormData(null);
    setViewMode("form");
  };

  const handleEdit = async (zone: Zone) => {
    setEditingZone(zone);
    setPendingFormData({
      name: zone.name,
      description: zone.description,
      type: zone.type as ZoneInput["type"],
      geometry: zone.geometry,
      color: zone.color,
      isDefault: zone.isDefault,
      activeDays: zone.activeDays as ZoneInput["activeDays"],
      active: zone.active,
    });

    try {
      const response = await fetch(`/api/zones/${zone.id}/vehicles`, {
        headers: { "x-company-id": companyId ?? "" },
      });
      if (response.ok) {
        const data = await response.json();
        setEditingZoneVehicleIds((data.vehicles || []).map((v: { id: string }) => v.id));
      }
    } catch {
      setEditingZoneVehicleIds([]);
    }

    setViewMode("form");
  };

  const handleMapSave = (geometry: string) => {
    setPendingFormData((prev) => ({ ...prev, geometry }));
    setViewMode("form");
  };

  // Filter zones
  const filteredZones = zones.filter((zone) => {
    if (!searchQuery) return true;
    return zone.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const selectedZone = zones.find((z) => z.id === selectedZoneId);
  const activeZones = zones.filter((z) => z.active).length;

  if (!isReady) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Map editor view
  if (viewMode === "map-editor") {
    const currentGeometry = pendingFormData?.geometry
      ? (() => { try { return JSON.parse(pendingFormData.geometry); } catch { return null; } })()
      : editingZone?.parsedGeometry || null;

    return (
      <div className="h-screen flex flex-col">
        <div className="border-b bg-background px-6 py-4 shrink-0">
          <h1 className="text-xl font-bold">Dibujar Área de Zona</h1>
          <p className="text-sm text-muted-foreground">
            Haz clic en el mapa para agregar puntos. Cierra el polígono cerca del primer punto.
          </p>
        </div>
        <div className="flex-1 min-h-0">
          <ZoneMapEditor
            initialGeometry={currentGeometry}
            zoneColor={pendingFormData?.color || editingZone?.color || "#3B82F6"}
            onSave={handleMapSave}
            onCancel={() => setViewMode("form")}
            height="100%"
          />
        </div>
      </div>
    );
  }

  // Get current form geometry for preview
  const currentFormGeometry = pendingFormData?.geometry || editingZone?.geometry;
  const currentFormColor = pendingFormData?.color || editingZone?.color || "#3B82F6";

  // Form view
  if (viewMode === "form") {
    return (
      <div className="h-[calc(100vh-4rem)] flex flex-col">
        {/* Header */}
        <div className="border-b bg-background px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setViewMode("list");
                  setEditingZone(null);
                  setEditingZoneVehicleIds([]);
                  setPendingFormData(null);
                }}
              >
                ← Volver
              </Button>
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${currentFormColor}20` }}
                >
                  <MapPin className="w-5 h-5" style={{ color: currentFormColor }} />
                </div>
                <div>
                  <h1 className="text-xl font-bold">
                    {editingZone ? "Editar Zona" : "Nueva Zona"}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {editingZone
                      ? `Editando: ${editingZone.name}`
                      : "Configura una nueva zona de entrega"}
                  </p>
                </div>
              </div>
            </div>
            {editingZone && (
              <Badge
                variant={editingZone.active ? "default" : "secondary"}
                className="text-xs"
              >
                {editingZone.active ? "Activa" : "Inactiva"}
              </Badge>
            )}
          </div>
        </div>

        {/* Main content - Two columns */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left column - Form */}
          <div className="w-[580px] shrink-0 overflow-y-auto border-r">
            <div className="p-6">
              <ZoneForm
                onSubmit={editingZone ? handleUpdate : handleCreate}
                initialData={
                  pendingFormData ||
                  (editingZone
                    ? {
                        name: editingZone.name,
                        description: editingZone.description,
                        type: editingZone.type as ZoneInput["type"],
                        geometry: editingZone.geometry,
                        color: editingZone.color,
                        isDefault: editingZone.isDefault,
                        activeDays: editingZone.activeDays as ZoneInput["activeDays"],
                        active: editingZone.active,
                        parsedGeometry: editingZone.parsedGeometry,
                      }
                    : undefined)
                }
                vehicles={vehicles}
                initialVehicleIds={editingZoneVehicleIds}
                submitLabel={editingZone ? "Guardar cambios" : "Crear zona"}
                onGeometryEdit={() => setViewMode("map-editor")}
              />
            </div>
          </div>

          {/* Right column - Map preview (takes remaining space) */}
          <div className="flex-1 flex flex-col bg-muted/30 min-w-[800px]">
            <div className="p-4 border-b bg-background">
              <h3 className="font-medium text-sm">Vista Previa del Área</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                El área se mostrará en el mapa durante la optimización
              </p>
            </div>
            <div className="flex-1 p-4">
              <ZoneFormPreview
                geometry={currentFormGeometry}
                color={currentFormColor}
                onEdit={() => setViewMode("map-editor")}
              />
            </div>

            {/* Quick stats when editing */}
            {editingZone && (
              <div className="p-4 border-t bg-background">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                      <Truck className="w-3.5 h-3.5" />
                      <span>Vehículos</span>
                    </div>
                    <p className="text-lg font-semibold mt-1">
                      {editingZone.vehicleCount}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Días activos</span>
                    </div>
                    <p className="text-lg font-semibold mt-1">
                      {editingZone.activeDays?.length || 7}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Zonas de Entrega</h1>
            <p className="text-sm text-muted-foreground">
              Gestiona las áreas geográficas para asignación de vehículos
            </p>
          </div>
          <div className="flex items-center gap-3">
            <CompanySelector
              companies={companies}
              selectedCompanyId={selectedCompanyId}
              authCompanyId={authCompanyId}
              onCompanyChange={setSelectedCompanyId}
              isSystemAdmin={isSystemAdmin}
            />
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-muted-foreground">{activeZones} activas</span>
              </div>
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">{zones.length} total</span>
              </div>
            </div>
            <Button onClick={handleStartNew}>
              <Plus className="w-4 h-4 mr-2" />
              Nueva Zona
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel - Zone list */}
        <div className="w-[420px] border-r bg-background overflow-y-auto">
          {/* Search */}
          <div className="p-4 border-b">
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar zona..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Zone list */}
          <div className="p-4 space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : filteredZones.length === 0 ? (
              <div className="text-center py-12">
                <MapPin className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">
                  {searchQuery ? "Sin resultados" : "No hay zonas configuradas"}
                </p>
                {!searchQuery && (
                  <Button variant="link" onClick={handleStartNew} className="mt-2">
                    Crear primera zona
                  </Button>
                )}
              </div>
            ) : (
              filteredZones.map((zone) => (
                <div
                  key={zone.id}
                  onClick={() => setSelectedZoneId(zone.id)}
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    selectedZoneId === zone.id
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/50 hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Color indicator */}
                    <div
                      className="w-4 h-4 rounded mt-0.5 shrink-0"
                      style={{ backgroundColor: zone.color }}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{zone.name}</span>
                        {zone.isDefault && (
                          <Badge variant="secondary" className="text-[10px] px-1.5">
                            Default
                          </Badge>
                        )}
                        {!zone.active && (
                          <Badge variant="outline" className="text-[10px] px-1.5 text-muted-foreground">
                            Inactiva
                          </Badge>
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground mt-1">
                        {ZONE_TYPE_LABELS[zone.type as keyof typeof ZONE_TYPE_LABELS] || zone.type}
                      </p>

                      <div className="flex items-center gap-3 mt-2">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Truck className="w-3 h-3" />
                          <span>{zone.vehicleCount} vehículos</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          <span>{zone.activeDays?.length || 7} días</span>
                        </div>
                      </div>
                    </div>

                    <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${
                      selectedZoneId === zone.id ? "rotate-90" : ""
                    }`} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right panel - Map & Details */}
        <div className="flex-1 flex flex-col bg-muted/30">
          {/* Map */}
          <div className="flex-1 relative">
            <ZonePreviewMap
              zones={zones}
              selectedZoneId={selectedZoneId}
              onZoneSelect={setSelectedZoneId}
            />
          </div>

          {/* Selected zone details */}
          {selectedZone && (
            <div className="border-t bg-background p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${selectedZone.color}20` }}
                  >
                    <MapPin className="w-5 h-5" style={{ color: selectedZone.color }} />
                  </div>
                  <div>
                    <h3 className="font-semibold">{selectedZone.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedZone.description || ZONE_TYPE_LABELS[selectedZone.type as keyof typeof ZONE_TYPE_LABELS]}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(selectedZone)}
                    disabled={deletingId === selectedZone.id}
                  >
                    <Edit3 className="w-4 h-4 mr-1" />
                    Editar
                  </Button>
                  {selectedZone.active && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={deletingId === selectedZone.id}
                        >
                          {deletingId === selectedZone.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            ¿Desactivar zona?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta acción desactivará la zona{" "}
                            <strong>{selectedZone.name}</strong>. Los vehículos
                            asignados serán desvinculados.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(selectedZone.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Desactivar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Truck className="w-4 h-4" />
                    <span>Vehículos</span>
                  </div>
                  <p className="text-xl font-semibold mt-1">{selectedZone.vehicleCount}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Calendar className="w-4 h-4" />
                    <span>Días activos</span>
                  </div>
                  <p className="text-xl font-semibold mt-1">{selectedZone.activeDays?.length || 7}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Settings2 className="w-4 h-4" />
                    <span>Estado</span>
                  </div>
                  <p className="text-xl font-semibold mt-1">
                    {selectedZone.active ? (
                      <span className="text-green-600">Activa</span>
                    ) : (
                      <span className="text-muted-foreground">Inactiva</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Active days */}
              {selectedZone.activeDays && selectedZone.activeDays.length > 0 && (
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Días:</span>
                  <div className="flex gap-1">
                    {selectedZone.activeDays.map((day) => (
                      <Badge key={day} variant="secondary" className="text-xs">
                        {DAY_LABELS[day] || day}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ZonesPage() {
  return (
    <ProtectedPage requiredPermission="zones:VIEW">
      <ZonesPageContent />
    </ProtectedPage>
  );
}
