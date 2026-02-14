"use client";

import dynamicImport from "next/dynamic";
import {
  Calendar,
  ChevronRight,
  Edit3,
  Layers,
  Loader2,
  MapPin,
  Plus,
  Settings2,
  Trash2,
  Truck,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { ZoneForm } from "@/components/zones/zone-form";
import { ZONE_TYPE_LABELS, type ZoneInput } from "@/lib/validations/zone";
import { useZones, DAY_LABELS } from "./zones-context";

// Dynamic map components
const ZoneMapEditor = dynamicImport(
  () => import("@/components/zones/zone-map-editor").then((mod) => mod.ZoneMapEditor),
  {
    ssr: false,
    loading: () => (
      <div className="h-full bg-muted animate-pulse rounded-lg flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

const ZonePreviewMap = dynamicImport(
  () => import("@/components/zones/zone-preview-map").then((mod) => mod.ZonePreviewMap),
  {
    ssr: false,
    loading: () => <div className="h-full bg-muted animate-pulse rounded-lg" />,
  }
);

const ZoneFormPreview = dynamicImport(
  () => import("@/components/zones/zone-form-preview").then((mod) => mod.ZoneFormPreview),
  {
    ssr: false,
    loading: () => <div className="h-full bg-muted animate-pulse rounded-lg" />,
  }
);

export function ZonesListView() {
  const { state, actions, derived } = useZones();

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
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-muted-foreground">{derived.activeZonesCount} activas</span>
              </div>
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">{state.zones.length} total</span>
              </div>
            </div>
            <Button onClick={actions.handleStartNew}>
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
                value={state.searchQuery}
                onChange={(e) => actions.setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Zone list */}
          <div className="p-4 space-y-2">
            {state.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : derived.filteredZones.length === 0 ? (
              <div className="text-center py-12">
                <MapPin className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">
                  {state.searchQuery ? "Sin resultados" : "No hay zonas configuradas"}
                </p>
                {!state.searchQuery && (
                  <Button variant="link" onClick={actions.handleStartNew} className="mt-2">
                    Crear primera zona
                  </Button>
                )}
              </div>
            ) : (
              derived.filteredZones.map((zone) => (
                <ZoneListItem
                  key={zone.id}
                  zone={zone}
                  isSelected={state.selectedZoneId === zone.id}
                  onSelect={() => actions.setSelectedZoneId(zone.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Right panel - Map & Details */}
        <div className="flex-1 flex flex-col bg-muted/30">
          <div className="flex-1 relative">
            <ZonePreviewMap
              zones={state.zones}
              selectedZoneId={state.selectedZoneId}
              onZoneSelect={actions.setSelectedZoneId}
            />
          </div>

          {derived.selectedZone && <ZoneDetails />}
        </div>
      </div>
    </div>
  );
}

function ZoneListItem({
  zone,
  isSelected,
  onSelect,
}: {
  zone: {
    id: string;
    name: string;
    type: string;
    color: string;
    isDefault: boolean;
    active: boolean;
    vehicleCount: number;
    activeDays?: string[] | null;
  };
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`p-4 rounded-lg border cursor-pointer transition-colors ${
        isSelected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border hover:border-primary/50 hover:bg-muted/50"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="w-4 h-4 rounded mt-0.5 shrink-0" style={{ backgroundColor: zone.color }} />
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
        <ChevronRight
          className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${
            isSelected ? "rotate-90" : ""
          }`}
        />
      </div>
    </div>
  );
}

function ZoneDetails() {
  const { state, actions, derived } = useZones();
  const zone = derived.selectedZone;
  if (!zone) return null;

  return (
    <div className="border-t bg-background p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${zone.color}20` }}
          >
            <MapPin className="w-5 h-5" style={{ color: zone.color }} />
          </div>
          <div>
            <h3 className="font-semibold">{zone.name}</h3>
            <p className="text-sm text-muted-foreground">
              {zone.description ||
                ZONE_TYPE_LABELS[zone.type as keyof typeof ZONE_TYPE_LABELS]}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => actions.handleEdit(zone)}
            disabled={state.deletingId === zone.id}
          >
            <Edit3 className="w-4 h-4 mr-1" />
            Editar
          </Button>
          {zone.active && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={state.deletingId === zone.id}
                >
                  {state.deletingId === zone.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Desactivar zona?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción desactivará la zona <strong>{zone.name}</strong>. Los vehículos
                    asignados serán desvinculados.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => actions.handleDelete(zone.id)}
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
          <p className="text-xl font-semibold mt-1">{zone.vehicleCount}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Calendar className="w-4 h-4" />
            <span>Días activos</span>
          </div>
          <p className="text-xl font-semibold mt-1">{zone.activeDays?.length || 7}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Settings2 className="w-4 h-4" />
            <span>Estado</span>
          </div>
          <p className="text-xl font-semibold mt-1">
            {zone.active ? (
              <span className="text-green-600">Activa</span>
            ) : (
              <span className="text-muted-foreground">Inactiva</span>
            )}
          </p>
        </div>
      </div>

      {/* Active days */}
      {zone.activeDays && zone.activeDays.length > 0 && (
        <div className="mt-4 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Días:</span>
          <div className="flex gap-1">
            {zone.activeDays.map((day) => (
              <Badge key={day} variant="secondary" className="text-xs">
                {DAY_LABELS[day] || day}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ZonesFormView() {
  const { state, actions, derived } = useZones();

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={actions.cancelForm}>
              ← Volver
            </Button>
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${derived.currentFormColor}20` }}
              >
                <MapPin className="w-5 h-5" style={{ color: derived.currentFormColor }} />
              </div>
              <div>
                <h1 className="text-xl font-bold">
                  {state.editingZone ? "Editar Zona" : "Nueva Zona"}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {state.editingZone
                    ? `Editando: ${state.editingZone.name}`
                    : "Configura una nueva zona de entrega"}
                </p>
              </div>
            </div>
          </div>
          {state.editingZone && (
            <Badge
              variant={state.editingZone.active ? "default" : "secondary"}
              className="text-xs"
            >
              {state.editingZone.active ? "Activa" : "Inactiva"}
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
              onSubmit={state.editingZone ? actions.handleUpdate : actions.handleCreate}
              initialData={
                state.pendingFormData ||
                (state.editingZone
                  ? {
                      name: state.editingZone.name,
                      description: state.editingZone.description,
                      type: state.editingZone.type as ZoneInput["type"],
                      geometry: state.editingZone.geometry,
                      color: state.editingZone.color,
                      isDefault: state.editingZone.isDefault,
                      activeDays: state.editingZone.activeDays as ZoneInput["activeDays"],
                      active: state.editingZone.active,
                      parsedGeometry: state.editingZone.parsedGeometry,
                    }
                  : undefined)
              }
              vehicles={state.vehicles}
              initialVehicleIds={state.editingZoneVehicleIds}
              submitLabel={state.editingZone ? "Guardar cambios" : "Crear zona"}
              onGeometryEdit={(snapshot) => {
                actions.setPendingFormData(snapshot.formData);
                actions.setEditingZoneVehicleIds(snapshot.vehicleIds);
                actions.setViewMode("map-editor");
              }}
              onFormDataChange={(data) => actions.setPendingFormData(data)}
            />
          </div>
        </div>

        {/* Right column - Map preview */}
        <div className="flex-1 flex flex-col bg-muted/30 min-w-[800px]">
          <div className="p-4 border-b bg-background">
            <h3 className="font-medium text-sm">Vista Previa del Área</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              El área se mostrará en el mapa durante la optimización
            </p>
          </div>
          <div className="flex-1 p-4">
            <ZoneFormPreview
              geometry={derived.currentFormGeometry}
              color={derived.currentFormColor}
              onEdit={() => actions.setViewMode("map-editor")}
            />
          </div>

          {/* Quick stats when editing */}
          {state.editingZone && (
            <div className="p-4 border-t bg-background">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <Truck className="w-3.5 h-3.5" />
                    <span>Vehículos</span>
                  </div>
                  <p className="text-lg font-semibold mt-1">{state.editingZone.vehicleCount}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Días activos</span>
                  </div>
                  <p className="text-lg font-semibold mt-1">
                    {state.editingZone.activeDays?.length || 7}
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

export function ZonesMapEditorView() {
  const { state, actions, derived } = useZones();

  const currentGeometry = state.pendingFormData?.geometry
    ? (() => {
        try {
          return JSON.parse(state.pendingFormData.geometry);
        } catch {
          return null;
        }
      })()
    : state.editingZone?.parsedGeometry || null;

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
          zoneColor={derived.currentFormColor}
          onSave={actions.handleMapSave}
          onCancel={() => actions.setViewMode("form")}
          height="100%"
        />
      </div>
    </div>
  );
}
