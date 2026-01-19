"use client";

import { Edit, Plus, Settings2, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ProtectedPage } from "@/components/auth/protected-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCompanyContext } from "@/hooks/use-company-context";
import { CompanySelector } from "@/components/company-selector";

interface OptimizationPreset {
  id: string;
  name: string;
  description: string | null;
  balanceVisits: boolean;
  minimizeVehicles: boolean;
  openStart: boolean;
  openEnd: boolean;
  mergeSimilar: boolean;
  mergeSimilarV2: boolean;
  oneRoutePerVehicle: boolean;
  simplify: boolean;
  bigVrp: boolean;
  flexibleTimeWindows: boolean;
  mergeByDistance: boolean;
  groupSameLocation: boolean;
  maxDistanceKm: number | null;
  vehicleRechargeTime: number | null;
  trafficFactor: number | null;
  // Route end configuration
  routeEndMode: "DRIVER_ORIGIN" | "SPECIFIC_DEPOT" | "OPEN_END";
  endDepotLatitude: string | null;
  endDepotLongitude: string | null;
  endDepotAddress: string | null;
  isDefault: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const ROUTE_END_MODES = [
  {
    value: "DRIVER_ORIGIN",
    label: "Origen del conductor",
    description: "Cada ruta termina donde inició el conductor",
  },
  {
    value: "SPECIFIC_DEPOT",
    label: "Depot específico",
    description: "Todas las rutas terminan en un punto fijo",
  },
  {
    value: "OPEN_END",
    label: "Fin abierto",
    description: "Las rutas terminan en la última parada",
  },
] as const;

const defaultPreset: Partial<OptimizationPreset> = {
  name: "",
  description: "",
  balanceVisits: false,
  minimizeVehicles: false,
  openStart: false,
  openEnd: false,
  mergeSimilar: true,
  mergeSimilarV2: false,
  oneRoutePerVehicle: true,
  simplify: true,
  bigVrp: true,
  flexibleTimeWindows: false,
  mergeByDistance: false,
  groupSameLocation: true,
  maxDistanceKm: 200,
  vehicleRechargeTime: 0,
  trafficFactor: 50,
  routeEndMode: "DRIVER_ORIGIN",
  endDepotLatitude: null,
  endDepotLongitude: null,
  endDepotAddress: null,
  isDefault: false,
};

function OptimizationPresetsPageContent() {
  const {
    effectiveCompanyId: companyId,
    isReady,
    isSystemAdmin,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    authCompanyId,
  } = useCompanyContext();
  const [presets, setPresets] = useState<OptimizationPreset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPreset, setEditingPreset] =
    useState<Partial<OptimizationPreset> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fetchPresets = async () => {
    if (!companyId || !isReady) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/optimization-presets", {
        headers: { "x-company-id": companyId },
      });
      const data = await response.json();
      setPresets(data.data || []);
    } catch (error) {
      console.error("Error fetching presets:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPresets();
  }, [companyId, isReady]);

  const handleCreate = () => {
    setEditingPreset({ ...defaultPreset });
    setDialogOpen(true);
  };

  const handleEdit = (preset: OptimizationPreset) => {
    setEditingPreset({ ...preset });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingPreset || !companyId) return;

    setIsSaving(true);
    try {
      const isEditing = !!editingPreset.id;
      const url = isEditing
        ? `/api/optimization-presets/${editingPreset.id}`
        : "/api/optimization-presets";

      const response = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId,
        },
        body: JSON.stringify(editingPreset),
      });

      if (response.ok) {
        setDialogOpen(false);
        setEditingPreset(null);
        fetchPresets();
      }
    } catch (error) {
      console.error("Error saving preset:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!companyId || !confirm("¿Estás seguro de eliminar este preset?"))
      return;

    try {
      await fetch(`/api/optimization-presets/${id}`, {
        method: "DELETE",
        headers: { "x-company-id": companyId },
      });
      fetchPresets();
    } catch (error) {
      console.error("Error deleting preset:", error);
    }
  };

  const handleSetDefault = async (preset: OptimizationPreset) => {
    if (!companyId) return;

    try {
      await fetch(`/api/optimization-presets/${preset.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId,
        },
        body: JSON.stringify({ isDefault: true }),
      });
      fetchPresets();
    } catch (error) {
      console.error("Error setting default:", error);
    }
  };

  if (!isReady) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-5 bg-muted rounded w-1/2" />
                <div className="h-4 bg-muted rounded w-3/4 mt-2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings2 className="h-6 w-6" />
            Presets de Optimización
          </h1>
          <p className="text-muted-foreground mt-1">
            Configura los parámetros predeterminados para la optimización de
            rutas
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
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Preset
          </Button>
        </div>
      </div>

      {/* Info Banner */}
      <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 mb-6">
        <CardContent className="py-3 px-4">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            <span className="font-medium">¿Cómo funcionan los presets?</span> El
            preset marcado como <span className="font-semibold">"Activo"</span>{" "}
            se aplicará automáticamente cuando ejecutes una optimización de
            rutas. Puedes editar las opciones haciendo clic en "Editar".
          </p>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-5 bg-muted rounded w-1/2" />
                <div className="h-4 bg-muted rounded w-3/4 mt-2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : presets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Settings2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No hay presets configurados</h3>
            <p className="text-muted-foreground mt-2">
              Crea tu primer preset para personalizar la optimización de rutas
            </p>
            <Button className="mt-4" onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Crear Preset
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {presets.map((preset) => (
            <Card
              key={preset.id}
              className={preset.isDefault ? "ring-2 ring-primary" : ""}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      {preset.name}
                      {preset.isDefault && (
                        <Badge variant="default" className="text-xs">
                          <Star className="h-3 w-3 mr-1" />
                          Activo
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {preset.description || "Sin descripción"}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Quick Toggle Options */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Opciones activas
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    <div className="flex items-center justify-between py-1">
                      <span className="text-sm">Balancear visitas</span>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded ${preset.balanceVisits ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500"}`}
                      >
                        {preset.balanceVisits ? "ON" : "OFF"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-sm">Minimizar vehículos</span>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded ${preset.minimizeVehicles ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500"}`}
                      >
                        {preset.minimizeVehicles ? "ON" : "OFF"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-sm">Ventanas flexibles</span>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded ${preset.flexibleTimeWindows ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500"}`}
                      >
                        {preset.flexibleTimeWindows ? "ON" : "OFF"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Parameters */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Parámetros
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-muted/50 rounded-lg p-2">
                      <p className="text-lg font-semibold">
                        {preset.maxDistanceKm}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        km max
                      </p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2">
                      <p className="text-lg font-semibold">
                        {preset.vehicleRechargeTime}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        min recarga
                      </p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2">
                      <p className="text-lg font-semibold">
                        {preset.trafficFactor}%
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        tráfico
                      </p>
                    </div>
                  </div>
                </div>

                {/* Route End Mode */}
                <div className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded-lg">
                  <span className="text-xs text-muted-foreground">
                    Fin de ruta:
                  </span>
                  <span className="text-xs font-medium">
                    {preset.routeEndMode === "DRIVER_ORIGIN" &&
                      "Origen conductor"}
                    {preset.routeEndMode === "SPECIFIC_DEPOT" &&
                      "Depot específico"}
                    {preset.routeEndMode === "OPEN_END" && "Fin abierto"}
                    {!preset.routeEndMode && "Origen conductor"}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleEdit(preset)}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Editar
                  </Button>
                  {!preset.isDefault && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetDefault(preset)}
                      title="Usar como predeterminado"
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(preset.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPreset?.id ? "Editar Preset" : "Nuevo Preset"}
            </DialogTitle>
            <DialogDescription>
              Configura los parámetros de optimización de rutas
            </DialogDescription>
          </DialogHeader>

          {editingPreset && (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Nombre</Label>
                  <Input
                    id="name"
                    value={editingPreset.name || ""}
                    onChange={(e) =>
                      setEditingPreset({
                        ...editingPreset,
                        name: e.target.value,
                      })
                    }
                    placeholder="Ej: Optimización estándar"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Descripción</Label>
                  <Textarea
                    id="description"
                    value={editingPreset.description || ""}
                    onChange={(e) =>
                      setEditingPreset({
                        ...editingPreset,
                        description: e.target.value,
                      })
                    }
                    placeholder="Describe el propósito de este preset..."
                  />
                </div>
              </div>

              {/* Optimization Flags */}
              <div>
                <h4 className="font-medium mb-3">Opciones de Optimización</h4>
                <p className="text-xs text-muted-foreground mb-4">
                  Haz clic en cada opción para activar/desactivar
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    {
                      key: "balanceVisits",
                      label: "Balancear visitas",
                      desc: "Distribuir paradas equitativamente entre vehículos",
                    },
                    {
                      key: "minimizeVehicles",
                      label: "Minimizar vehículos",
                      desc: "Usar la menor cantidad de vehículos posible",
                    },
                    {
                      key: "flexibleTimeWindows",
                      label: "Ventanas de tiempo flexibles",
                      desc: "Permitir cierta tolerancia en horarios",
                    },
                    {
                      key: "openStart",
                      label: "Inicio abierto",
                      desc: "Vehículos pueden iniciar desde cualquier lugar",
                    },
                    {
                      key: "openEnd",
                      label: "Fin abierto",
                      desc: "Vehículos no necesitan volver al origen",
                    },
                    {
                      key: "oneRoutePerVehicle",
                      label: "Una ruta por vehículo",
                      desc: "Cada vehículo solo tiene una ruta asignada",
                    },
                    {
                      key: "groupSameLocation",
                      label: "Agrupar mismas coordenadas",
                      desc: "Múltiples pedidos en la misma ubicación cuentan como una sola parada",
                    },
                  ].map((option) => {
                    const isChecked = editingPreset[
                      option.key as keyof typeof editingPreset
                    ] as boolean;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() =>
                          setEditingPreset({
                            ...editingPreset,
                            [option.key]: !isChecked,
                          })
                        }
                        className="flex items-center justify-between p-3 rounded-lg border-2 transition-colors"
                        style={{
                          backgroundColor: isChecked
                            ? "#22c55e20"
                            : "#71717a15",
                          borderColor: isChecked ? "#22c55e" : "#71717a40",
                        }}
                      >
                        <div className="text-left">
                          <p
                            className="font-medium text-sm"
                            style={{ color: isChecked ? "#22c55e" : "inherit" }}
                          >
                            {option.label}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {option.desc}
                          </p>
                        </div>
                        <div
                          className="px-3 py-1 rounded-full text-xs font-bold"
                          style={{
                            backgroundColor: isChecked ? "#22c55e" : "#71717a",
                            color: "white",
                          }}
                        >
                          {isChecked ? "ON" : "OFF"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Parameters */}
              <div>
                <h4 className="font-medium mb-3">Parámetros</h4>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Distancia máxima por ruta</Label>
                      <span className="text-sm text-muted-foreground">
                        {editingPreset.maxDistanceKm} km
                      </span>
                    </div>
                    <Slider
                      value={[editingPreset.maxDistanceKm || 200]}
                      onValueChange={([value]) =>
                        setEditingPreset({
                          ...editingPreset,
                          maxDistanceKm: value,
                        })
                      }
                      min={50}
                      max={500}
                      step={10}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Tiempo de recarga del vehículo</Label>
                      <span className="text-sm text-muted-foreground">
                        {editingPreset.vehicleRechargeTime} min
                      </span>
                    </div>
                    <Slider
                      value={[editingPreset.vehicleRechargeTime || 0]}
                      onValueChange={([value]) =>
                        setEditingPreset({
                          ...editingPreset,
                          vehicleRechargeTime: value,
                        })
                      }
                      min={0}
                      max={120}
                      step={5}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Factor de tráfico</Label>
                      <span className="text-sm text-muted-foreground">
                        {editingPreset.trafficFactor}%
                      </span>
                    </div>
                    <Slider
                      value={[editingPreset.trafficFactor || 50]}
                      onValueChange={([value]) =>
                        setEditingPreset({
                          ...editingPreset,
                          trafficFactor: value,
                        })
                      }
                      min={0}
                      max={100}
                      step={5}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      0% = Sin tráfico, 100% = Tráfico máximo esperado
                    </p>
                  </div>
                </div>
              </div>

              {/* Route End Mode */}
              <div>
                <h4 className="font-medium mb-3">
                  Punto de finalización de rutas
                </h4>
                <div className="space-y-2">
                  {ROUTE_END_MODES.map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() =>
                        setEditingPreset({
                          ...editingPreset,
                          routeEndMode: mode.value,
                        })
                      }
                      className={`w-full p-3 rounded-lg border text-left transition-colors ${
                        editingPreset.routeEndMode === mode.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <p className="font-medium text-sm">{mode.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {mode.description}
                      </p>
                    </button>
                  ))}
                </div>

                {/* Depot coordinates - only show when SPECIFIC_DEPOT is selected */}
                {editingPreset.routeEndMode === "SPECIFIC_DEPOT" && (
                  <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-3">
                    <Label className="text-sm font-medium">
                      Coordenadas del depot final
                    </Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label
                          htmlFor="endLat"
                          className="text-xs text-muted-foreground"
                        >
                          Latitud
                        </Label>
                        <Input
                          id="endLat"
                          placeholder="-12.0464"
                          value={editingPreset.endDepotLatitude || ""}
                          onChange={(e) =>
                            setEditingPreset({
                              ...editingPreset,
                              endDepotLatitude: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label
                          htmlFor="endLng"
                          className="text-xs text-muted-foreground"
                        >
                          Longitud
                        </Label>
                        <Input
                          id="endLng"
                          placeholder="-77.0428"
                          value={editingPreset.endDepotLongitude || ""}
                          onChange={(e) =>
                            setEditingPreset({
                              ...editingPreset,
                              endDepotLongitude: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                    <div>
                      <Label
                        htmlFor="endAddress"
                        className="text-xs text-muted-foreground"
                      >
                        Dirección (opcional)
                      </Label>
                      <Input
                        id="endAddress"
                        placeholder="Av. Principal 123, Lima"
                        value={editingPreset.endDepotAddress || ""}
                        onChange={(e) =>
                          setEditingPreset({
                            ...editingPreset,
                            endDepotAddress: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Default Flag */}
              <button
                type="button"
                onClick={() =>
                  setEditingPreset({
                    ...editingPreset,
                    isDefault: !editingPreset.isDefault,
                  })
                }
                className={`w-full flex items-center justify-between p-4 rounded-lg border-2 transition-colors ${
                  editingPreset.isDefault
                    ? "bg-primary/10 border-primary"
                    : "bg-muted border-transparent hover:border-muted-foreground/20"
                }`}
              >
                <div className="text-left">
                  <p
                    className={`font-medium ${editingPreset.isDefault ? "text-primary" : ""}`}
                  >
                    Establecer como predeterminado
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Se usará automáticamente en nuevas optimizaciones
                  </p>
                </div>
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold ${
                    editingPreset.isDefault
                      ? "bg-primary text-primary-foreground"
                      : "bg-gray-300 text-gray-600 dark:bg-gray-600 dark:text-gray-300"
                  }`}
                >
                  <Star
                    className={`h-4 w-4 ${editingPreset.isDefault ? "fill-current" : ""}`}
                  />
                  {editingPreset.isDefault ? "ACTIVO" : "INACTIVO"}
                </div>
              </button>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !editingPreset?.name}
            >
              {isSaving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function OptimizationPresetsPage() {
  return (
    <ProtectedPage requiredPermission="optimization_presets:VIEW">
      <OptimizationPresetsPageContent />
    </ProtectedPage>
  );
}
