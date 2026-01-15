"use client";

import { Loader2, MapPin } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ZoneForm } from "@/components/zones/zone-form";
import { ZoneMapEditor } from "@/components/zones/zone-map-editor";
import { useAuth } from "@/hooks/use-auth";
import { ZONE_TYPE_LABELS, type ZoneInput } from "@/lib/validations/zone";

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

type ViewMode = "list" | "form" | "map";

export default function ZonesPage() {
  const { companyId, isLoading: isAuthLoading } = useAuth();
  const [zones, setZones] = useState<Zone[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [editingZoneVehicleIds, setEditingZoneVehicleIds] = useState<string[]>([]);
  const [pendingFormData, setPendingFormData] =
    useState<Partial<ZoneInput> | null>(null);

  const fetchZones = useCallback(async () => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/zones", {
        headers: {
          "x-company-id": companyId,
        },
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
      const vehiclesList = data.data || [];

      // Map to VehicleOption format
      const vehicleOptions: VehicleOption[] = vehiclesList.map(
        (v: {
          id: string;
          name?: string;
          plate?: string | null;
        }) => ({
          id: v.id,
          name: v.name || v.plate || "Sin nombre",
          plate: v.plate ?? null,
        }),
      );
      setVehicles(vehicleOptions);
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
    const response = await fetch("/api/zones", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-company-id": companyId ?? "",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw error;
    }

    const createdZone = await response.json();

    // Assign vehicles to the new zone
    if (vehicleIds.length > 0 && createdZone.id) {
      await fetch(`/api/zones/${createdZone.id}/vehicles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId ?? "",
        },
        body: JSON.stringify({
          vehicleIds,
          assignedDays: data.activeDays || null, // Use same days as zone
        }),
      });
    }

    await fetchZones();
    setViewMode("list");
    setPendingFormData(null);
  };

  const handleUpdate = async (data: ZoneInput, vehicleIds: string[]) => {
    if (!editingZone) return;

    const response = await fetch(`/api/zones/${editingZone.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-company-id": companyId ?? "",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw error;
    }

    // Update vehicle assignments
    await fetch(`/api/zones/${editingZone.id}/vehicles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-company-id": companyId ?? "",
      },
      body: JSON.stringify({
        vehicleIds,
        assignedDays: data.activeDays || null, // Use same days as zone
      }),
    });

    await fetchZones();
    setEditingZone(null);
    setEditingZoneVehicleIds([]);
    setViewMode("list");
    setPendingFormData(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Esta seguro de desactivar esta zona?")) return;

    const response = await fetch(`/api/zones/${id}`, {
      method: "DELETE",
      headers: {
        "x-company-id": companyId ?? "",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || error.details || "Error al desactivar la zona");
      return;
    }

    await fetchZones();
  };

  const handleOpenMapEditor = () => {
    setViewMode("map");
  };

  const handleMapSave = (geometry: string) => {
    setPendingFormData((prev) => ({
      ...prev,
      geometry,
    }));
    setViewMode("form");
  };

  const handleMapCancel = () => {
    setViewMode("form");
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

    // Load vehicle assignments for this zone
    try {
      const response = await fetch(`/api/zones/${zone.id}/vehicles`, {
        headers: { "x-company-id": companyId ?? "" },
      });
      if (response.ok) {
        const data = await response.json();
        const vehicleIds = (data.vehicles || []).map((v: { id: string }) => v.id);
        setEditingZoneVehicleIds(vehicleIds);
      } else {
        setEditingZoneVehicleIds([]);
      }
    } catch {
      setEditingZoneVehicleIds([]);
    }

    setViewMode("form");
  };

  // Auth loading state
  if (isAuthLoading || !companyId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Map Editor View
  if (viewMode === "map") {
    const currentGeometry = pendingFormData?.geometry
      ? (() => {
          try {
            return JSON.parse(pendingFormData.geometry);
          } catch {
            return null;
          }
        })()
      : editingZone?.parsedGeometry || null;

    return (
      <div className="min-h-screen bg-background p-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground">
              Dibujar Area de Zona
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Haz clic en el mapa para agregar puntos. Cierra el poligono
              haciendo clic cerca del primer punto.
            </p>
          </div>
          <ZoneMapEditor
            initialGeometry={currentGeometry}
            zoneColor={
              pendingFormData?.color || editingZone?.color || "#3B82F6"
            }
            onSave={handleMapSave}
            onCancel={handleMapCancel}
            height="600px"
          />
        </div>
      </div>
    );
  }

  // Form View
  if (viewMode === "form") {
    const initialData =
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
        : undefined);

    return (
      <div className="min-h-screen bg-background p-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground">
              {editingZone ? "Editar Zona" : "Nueva Zona"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {editingZone
                ? "Actualice la informacion de la zona"
                : "Complete el formulario para crear una nueva zona"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
            <ZoneForm
              onSubmit={editingZone ? handleUpdate : handleCreate}
              initialData={initialData}
              vehicles={vehicles}
              initialVehicleIds={editingZoneVehicleIds}
              submitLabel={editingZone ? "Actualizar" : "Crear"}
              onGeometryEdit={handleOpenMapEditor}
            />
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setViewMode("list");
                  setEditingZone(null);
                  setEditingZoneVehicleIds([]);
                  setPendingFormData(null);
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List View
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Gestion de Zonas
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Administre las zonas geograficas para asignacion de vehiculos
            </p>
          </div>
          <Button onClick={handleStartNew}>Nueva Zona</Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          </div>
        ) : zones.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center shadow-sm">
            <MapPin className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              No hay zonas registradas. Cree la primera zona.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {zones.map((zone) => (
              <div
                key={zone.id}
                className="rounded-lg border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: zone.color }}
                    />
                    <h3 className="font-semibold text-foreground">
                      {zone.name}
                    </h3>
                  </div>
                  <div className="flex gap-1">
                    {zone.isDefault && (
                      <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                        Default
                      </span>
                    )}
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        zone.active
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {zone.active ? "Activa" : "Inactiva"}
                    </span>
                  </div>
                </div>

                {zone.description && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {zone.description}
                  </p>
                )}

                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Tipo:</span>
                    <span className="font-medium">
                      {ZONE_TYPE_LABELS[
                        zone.type as keyof typeof ZONE_TYPE_LABELS
                      ] || zone.type}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Vehiculos:</span>
                    <span className="font-medium">{zone.vehicleCount}</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-border flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(zone)}
                  >
                    Editar
                  </Button>
                  {zone.active && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(zone.id)}
                    >
                      Desactivar
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
