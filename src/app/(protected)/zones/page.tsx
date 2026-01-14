"use client";

import { MapPin } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ZoneForm } from "@/components/zones/zone-form";
import { ZoneMapEditor } from "@/components/zones/zone-map-editor";
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
  createdAt: string;
  updatedAt: string;
}

interface VehicleWithZones {
  id: string;
  name: string;
  plate: string | null;
  zones: Array<{ id: string; name: string }>;
}

type ViewMode = "list" | "form" | "map";

export default function ZonesPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [vehicles, setVehicles] = useState<VehicleWithZones[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [pendingFormData, setPendingFormData] =
    useState<Partial<ZoneInput> | null>(null);

  const fetchZones = useCallback(async () => {
    try {
      const response = await fetch("/api/zones", {
        headers: {
          "x-company-id": "demo-company-id",
        },
      });
      const data = await response.json();
      setZones(data.data || []);
    } catch (error) {
      console.error("Error fetching zones:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchVehicles = useCallback(async () => {
    try {
      const response = await fetch("/api/vehicles", {
        headers: { "x-company-id": "demo-company-id" },
      });
      const data = await response.json();
      const vehiclesList = data.data || [];

      // Map to VehicleWithZones format
      const vehiclesWithZones: VehicleWithZones[] = vehiclesList.map(
        (v: {
          id: string;
          name?: string;
          plate?: string | null;
          zones?: Array<{ id: string; name: string }>;
        }) => ({
          id: v.id,
          name: v.name || v.plate || "Sin nombre",
          plate: v.plate ?? null,
          zones: v.zones || [],
        }),
      );
      setVehicles(vehiclesWithZones);
    } catch (error) {
      console.error("Error fetching vehicles:", error);
    }
  }, []);

  useEffect(() => {
    fetchZones();
    fetchVehicles();
  }, [fetchZones, fetchVehicles]);

  const handleCreate = async (data: ZoneInput) => {
    const response = await fetch("/api/zones", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-company-id": "demo-company-id",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw error;
    }

    await fetchZones();
    setViewMode("list");
    setPendingFormData(null);
  };

  const handleUpdate = async (data: ZoneInput) => {
    if (!editingZone) return;

    const response = await fetch(`/api/zones/${editingZone.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-company-id": "demo-company-id",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw error;
    }

    await fetchZones();
    setEditingZone(null);
    setViewMode("list");
    setPendingFormData(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Esta seguro de desactivar esta zona?")) return;

    const response = await fetch(`/api/zones/${id}`, {
      method: "DELETE",
      headers: {
        "x-company-id": "demo-company-id",
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
    setPendingFormData(null);
    setViewMode("form");
  };

  const handleEdit = (zone: Zone) => {
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
    setViewMode("form");
  };

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
