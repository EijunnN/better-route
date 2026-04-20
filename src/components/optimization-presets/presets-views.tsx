"use client";

import { Edit, Plus, Settings2, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/auth/can";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
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
import { Textarea } from "@/components/ui/textarea";
import { usePresets, ROUTE_END_MODES, type OptimizationPreset } from "./presets-context";

const OPTIMIZATION_OPTIONS = [
  { key: "balanceVisits", label: "Balancear visitas", desc: "Distribuir paradas equitativamente entre vehículos" },
  { key: "minimizeVehicles", label: "Minimizar vehículos", desc: "Usar la menor cantidad de vehículos posible" },
  { key: "flexibleTimeWindows", label: "Ventanas de tiempo flexibles", desc: "Permitir cierta tolerancia en horarios" },
  { key: "openStart", label: "Inicio abierto", desc: "Vehículos pueden iniciar desde cualquier lugar" },
  { key: "oneRoutePerVehicle", label: "Una ruta por vehículo", desc: "Cada vehículo solo tiene una ruta asignada" },
  { key: "groupSameLocation", label: "Agrupar mismas coordenadas", desc: "Múltiples pedidos en la misma ubicación cuentan como una sola parada" },
] as const;

export function PresetsListView() {
  const { state, actions, meta } = usePresets();

  if (!meta.isReady) {
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
            Configura los parámetros predeterminados para la optimización de rutas
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Can perm="optimization_preset:create">
            <Button onClick={actions.handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Preset
            </Button>
          </Can>
        </div>
      </div>

      <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 mb-6">
        <CardContent className="py-3 px-4">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            <span className="font-medium">¿Cómo funcionan los presets?</span> El preset marcado como{" "}
            <span className="font-semibold">"Activo"</span> se aplicará automáticamente cuando ejecutes
            una optimización de rutas.
          </p>
        </CardContent>
      </Card>

      {state.isLoading ? (
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
      ) : state.error ? (
        <ErrorState title="Error al cargar presets de optimización" error={state.error} onRetry={actions.fetchPresets} />
      ) : state.presets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Settings2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No hay presets configurados</h3>
            <p className="text-muted-foreground mt-2">
              Crea tu primer preset para personalizar la optimización de rutas
            </p>
            <Can perm="optimization_preset:create">
              <Button className="mt-4" onClick={actions.handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Crear Preset
              </Button>
            </Can>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {state.presets.map((preset) => (
            <PresetCard key={preset.id} preset={preset} />
          ))}
        </div>
      )}

      <PresetDialog />
    </div>
  );
}

function PresetCard({ preset }: { preset: OptimizationPreset }) {
  const { actions } = usePresets();

  return (
    <Card className={preset.isDefault ? "ring-2 ring-primary" : ""}>
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
            <CardDescription className="mt-1">{preset.description || "Sin descripción"}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Opciones activas</p>
          <div className="grid grid-cols-1 gap-2">
            {["balanceVisits", "minimizeVehicles", "flexibleTimeWindows"].map((key) => (
              <div key={key} className="flex items-center justify-between py-1">
                <span className="text-sm">
                  {key === "balanceVisits" ? "Balancear visitas" : key === "minimizeVehicles" ? "Minimizar vehículos" : "Ventanas flexibles"}
                </span>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded ${
                    preset[key as keyof OptimizationPreset]
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500"
                  }`}
                >
                  {preset[key as keyof OptimizationPreset] ? "ON" : "OFF"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Parámetros</p>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="bg-muted/50 rounded-lg p-2">
              <p className="text-lg font-semibold">{preset.maxDistanceKm}</p>
              <p className="text-[10px] text-muted-foreground">km max</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-2">
              <p className="text-lg font-semibold">{preset.trafficFactor}%</p>
              <p className="text-[10px] text-muted-foreground">tráfico</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded-lg">
          <span className="text-xs text-muted-foreground">Fin de ruta:</span>
          <span className="text-xs font-medium">
            {preset.routeEndMode === "DRIVER_ORIGIN" && "Origen conductor"}
            {preset.routeEndMode === "SPECIFIC_DEPOT" && "Depot específico"}
            {preset.routeEndMode === "OPEN_END" && "Fin abierto"}
            {!preset.routeEndMode && "Origen conductor"}
          </span>
        </div>

        <div className="flex items-center gap-2 pt-2 border-t">
          <Can perm="optimization_preset:update">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => actions.handleEdit(preset)}>
              <Edit className="h-4 w-4 mr-1" />
              Editar
            </Button>
          </Can>
          {!preset.isDefault && (
            <Can perm="optimization_preset:update">
              <Button variant="outline" size="sm" onClick={() => actions.handleSetDefault(preset)} title="Usar como predeterminado">
                <Star className="h-4 w-4" />
              </Button>
            </Can>
          )}
          <Can perm="optimization_preset:delete">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => actions.handleDelete(preset.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </Can>
        </div>
      </CardContent>
    </Card>
  );
}

function PresetDialog() {
  const { state, actions } = usePresets();

  if (!state.editingPreset) return null;

  return (
    <Dialog open={state.dialogOpen} onOpenChange={actions.setDialogOpen}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{state.editingPreset.id ? "Editar Preset" : "Nuevo Preset"}</DialogTitle>
          <DialogDescription>Configura los parámetros de optimización de rutas</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                value={state.editingPreset.name || ""}
                onChange={(e) => actions.updateEditingPreset({ name: e.target.value })}
                placeholder="Ej: Optimización estándar"
              />
            </div>
            <div>
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={state.editingPreset.description || ""}
                onChange={(e) => actions.updateEditingPreset({ description: e.target.value })}
                placeholder="Describe el propósito de este preset..."
              />
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-3">Opciones de Optimización</h4>
            <div className="grid grid-cols-1 gap-2">
              {OPTIMIZATION_OPTIONS.map((option) => {
                const isChecked = state.editingPreset?.[option.key as keyof typeof state.editingPreset] as boolean;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => actions.updateEditingPreset({ [option.key]: !isChecked })}
                    className="flex items-center justify-between p-3 rounded-lg border-2 transition-colors"
                    style={{
                      backgroundColor: isChecked ? "#22c55e20" : "#71717a15",
                      borderColor: isChecked ? "#22c55e" : "#71717a40",
                    }}
                  >
                    <div className="text-left">
                      <p className="font-medium text-sm" style={{ color: isChecked ? "#22c55e" : "inherit" }}>
                        {option.label}
                      </p>
                      <p className="text-xs text-muted-foreground">{option.desc}</p>
                    </div>
                    <div
                      className="px-3 py-1 rounded-full text-xs font-bold"
                      style={{ backgroundColor: isChecked ? "#22c55e" : "#71717a", color: "white" }}
                    >
                      {isChecked ? "ON" : "OFF"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-3">Parámetros</h4>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Distancia máxima por ruta</Label>
                  <span className="text-sm text-muted-foreground">{state.editingPreset.maxDistanceKm} km</span>
                </div>
                <Slider
                  value={[state.editingPreset.maxDistanceKm || 200]}
                  onValueChange={([value]) => actions.updateEditingPreset({ maxDistanceKm: value })}
                  min={50}
                  max={500}
                  step={10}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Factor de tráfico</Label>
                  <span className="text-sm text-muted-foreground">{state.editingPreset.trafficFactor}%</span>
                </div>
                <Slider
                  value={[state.editingPreset.trafficFactor || 50]}
                  onValueChange={([value]) => actions.updateEditingPreset({ trafficFactor: value })}
                  min={0}
                  max={100}
                  step={5}
                />
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-3">Punto de finalización de rutas</h4>
            <div className="space-y-2">
              {ROUTE_END_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => actions.updateEditingPreset({ routeEndMode: mode.value })}
                  className={`w-full p-3 rounded-lg border text-left transition-colors ${
                    state.editingPreset?.routeEndMode === mode.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <p className="font-medium text-sm">{mode.label}</p>
                  <p className="text-xs text-muted-foreground">{mode.description}</p>
                </button>
              ))}
            </div>

            {state.editingPreset.routeEndMode === "SPECIFIC_DEPOT" && (
              <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-3">
                <Label className="text-sm font-medium">Coordenadas del depot final</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="endLat" className="text-xs text-muted-foreground">Latitud</Label>
                    <Input
                      id="endLat"
                      placeholder="-12.0464"
                      value={state.editingPreset.endDepotLatitude || ""}
                      onChange={(e) => actions.updateEditingPreset({ endDepotLatitude: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="endLng" className="text-xs text-muted-foreground">Longitud</Label>
                    <Input
                      id="endLng"
                      placeholder="-77.0428"
                      value={state.editingPreset.endDepotLongitude || ""}
                      onChange={(e) => actions.updateEditingPreset({ endDepotLongitude: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="endAddress" className="text-xs text-muted-foreground">Dirección (opcional)</Label>
                  <Input
                    id="endAddress"
                    placeholder="Av. Principal 123, Lima"
                    value={state.editingPreset.endDepotAddress || ""}
                    onChange={(e) => actions.updateEditingPreset({ endDepotAddress: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => actions.updateEditingPreset({ isDefault: !state.editingPreset?.isDefault })}
            className={`w-full flex items-center justify-between p-4 rounded-lg border-2 transition-colors ${
              state.editingPreset?.isDefault
                ? "bg-primary/10 border-primary"
                : "bg-muted border-transparent hover:border-muted-foreground/20"
            }`}
          >
            <div className="text-left">
              <p className={`font-medium ${state.editingPreset?.isDefault ? "text-primary" : ""}`}>
                Establecer como predeterminado
              </p>
              <p className="text-xs text-muted-foreground">Se usará automáticamente en nuevas optimizaciones</p>
            </div>
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold ${
                state.editingPreset?.isDefault
                  ? "bg-primary text-primary-foreground"
                  : "bg-gray-300 text-gray-600 dark:bg-gray-600 dark:text-gray-300"
              }`}
            >
              <Star className={`h-4 w-4 ${state.editingPreset?.isDefault ? "fill-current" : ""}`} />
              {state.editingPreset?.isDefault ? "ACTIVO" : "INACTIVO"}
            </div>
          </button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => actions.setDialogOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={actions.handleSave} disabled={state.isSaving || !state.editingPreset?.name}>
            {state.isSaving ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
