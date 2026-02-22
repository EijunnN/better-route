"use client";

import { Box, Clock, Download, Eye, ExternalLink, FileSpreadsheet, Globe, Info, Loader2, Map, Package, Save, Scale, Settings, Tag, Truck, User, Weight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useConfiguracion, type CompanyProfile, type TrackingSettings } from "./configuracion-context";

const DIMENSION_INFO = {
  WEIGHT: { label: "Peso", description: "Restricción por peso del paquete (gramos)", icon: Weight, color: "blue" },
  VOLUME: { label: "Volumen", description: "Restricción por volumen del paquete (litros)", icon: Box, color: "green" },
  VALUE: { label: "Valorizado", description: "Restricción por valor monetario del pedido", icon: Tag, color: "amber" },
  UNITS: { label: "Unidades", description: "Restricción por cantidad de items/unidades", icon: Package, color: "purple" },
};

const TEMPLATE_INFO: Record<string, { name: string; description: string }> = {
  LOGISTICS: { name: "Logística Tradicional", description: "Peso y volumen como restricciones principales" },
  HIGH_VALUE: { name: "Productos de Alto Valor", description: "Valorizado y priorización por tipo de pedido" },
  SIMPLE: { name: "Entrega Simple", description: "Solo conteo de unidades, sin restricciones de capacidad" },
  FULL: { name: "Completo", description: "Todas las dimensiones y opciones habilitadas" },
};

export function ConfiguracionView() {
  const { state, actions } = useConfiguracion();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Configuración de Optimización
          </h1>
          <p className="text-muted-foreground mt-1">Define las dimensiones y restricciones de capacidad para tu empresa</p>
        </div>
        <div className="flex items-center gap-3">
          {state.hasChanges && (
            <Badge variant="outline" className="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700">
              Cambios sin guardar
            </Badge>
          )}
          <Button onClick={actions.handleSave} disabled={state.isSaving || !state.hasChanges}>
            {state.isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Guardar
          </Button>
        </div>
      </div>

      <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
        <CardContent className="py-3 px-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-700 dark:text-blue-300">
            <span className="font-medium">¿Qué son las dimensiones de capacidad?</span>
            <p className="mt-1">
              Las dimensiones definen qué restricciones aplican a tus vehículos y pedidos. Por ejemplo, una empresa de celulares necesita
              controlar el <span className="font-semibold">valorizado</span>, mientras que una de logística tradicional usa{" "}
              <span className="font-semibold">peso y volumen</span>.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Plantillas Rápidas
            </CardTitle>
            <CardDescription>Aplica una configuración predefinida según tu tipo de negocio</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(TEMPLATE_INFO).map(([id, info]) => (
              <button
                key={id}
                onClick={() => actions.handleApplyTemplate(id)}
                className="w-full p-3 rounded-lg border text-left hover:bg-muted/50 transition-colors"
              >
                <p className="font-medium text-sm">{info.name}</p>
                <p className="text-xs text-muted-foreground">{info.description}</p>
              </button>
            ))}

            <div className="pt-4 border-t mt-4">
              <Button variant="outline" className="w-full" onClick={actions.handleDownloadTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Descargar Plantilla CSV
              </Button>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                La plantilla incluye solo los campos relevantes para tu configuración
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Scale className="h-5 w-5" />
              Dimensiones de Capacidad
            </CardTitle>
            <CardDescription>Selecciona qué restricciones de capacidad aplican a tu operación</CardDescription>
          </CardHeader>
          <CardContent>
            {state.profile && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DimensionToggle
                  icon={DIMENSION_INFO.WEIGHT.icon}
                  label={DIMENSION_INFO.WEIGHT.label}
                  description={DIMENSION_INFO.WEIGHT.description}
                  isEnabled={state.profile.enableWeight}
                  color="blue"
                  onToggle={() => actions.toggleDimension("enableWeight", "WEIGHT")}
                />
                <DimensionToggle
                  icon={DIMENSION_INFO.VOLUME.icon}
                  label={DIMENSION_INFO.VOLUME.label}
                  description={DIMENSION_INFO.VOLUME.description}
                  isEnabled={state.profile.enableVolume}
                  color="green"
                  onToggle={() => actions.toggleDimension("enableVolume", "VOLUME")}
                />
                <DimensionToggle
                  icon={DIMENSION_INFO.VALUE.icon}
                  label={DIMENSION_INFO.VALUE.label}
                  description={DIMENSION_INFO.VALUE.description}
                  isEnabled={state.profile.enableOrderValue}
                  color="amber"
                  onToggle={() => actions.toggleDimension("enableOrderValue", "VALUE")}
                />
                <DimensionToggle
                  icon={DIMENSION_INFO.UNITS.icon}
                  label={DIMENSION_INFO.UNITS.label}
                  description={DIMENSION_INFO.UNITS.description}
                  isEnabled={state.profile.enableUnits}
                  color="purple"
                  onToggle={() => actions.toggleDimension("enableUnits", "UNITS")}
                />
              </div>
            )}

            {state.profile && (
              <div className="mt-6 p-4 bg-muted/30 rounded-lg">
                <p className="text-sm font-medium mb-2">Dimensiones activas:</p>
                <div className="flex flex-wrap gap-2">
                  {state.profile.activeDimensions.length === 0 ? (
                    <Badge variant="outline" className="text-muted-foreground">
                      Ninguna (sin restricciones de capacidad)
                    </Badge>
                  ) : (
                    state.profile.activeDimensions.map((dim) => {
                      const info = DIMENSION_INFO[dim as keyof typeof DIMENSION_INFO];
                      return (
                        <Badge key={dim} variant="secondary">
                          {info?.label || dim}
                        </Badge>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {state.profile && <OrderTypePrioritiesSection profile={state.profile} />}

      {state.tracking && <TrackingSettingsSection tracking={state.tracking} />}

      {!state.isDefault && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={actions.handleReset}>
            Restablecer a valores predeterminados
          </Button>
        </div>
      )}
    </div>
  );
}

function DimensionToggle({
  icon: Icon,
  label,
  description,
  isEnabled,
  color,
  onToggle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  isEnabled: boolean;
  color: string;
  onToggle: () => void;
}) {
  const colorClasses: Record<string, { bg: string; border: string; text: string }> = {
    blue: { bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-300 dark:border-blue-700", text: "text-blue-600 dark:text-blue-400" },
    green: { bg: "bg-green-50 dark:bg-green-950/30", border: "border-green-300 dark:border-green-700", text: "text-green-600 dark:text-green-400" },
    amber: { bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-300 dark:border-amber-700", text: "text-amber-600 dark:text-amber-400" },
    purple: { bg: "bg-purple-50 dark:bg-purple-950/30", border: "border-purple-300 dark:border-purple-700", text: "text-purple-600 dark:text-purple-400" },
  };
  const colors = colorClasses[color] || colorClasses.blue;

  return (
    <button
      onClick={onToggle}
      className={`p-4 rounded-lg border-2 text-left transition-all ${
        isEnabled ? `${colors.bg} ${colors.border}` : "bg-muted/30 border-transparent hover:border-muted-foreground/20"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isEnabled ? colors.bg : "bg-muted"}`}>
            <Icon className={`h-5 w-5 ${isEnabled ? colors.text : "text-muted-foreground"}`} />
          </div>
          <div>
            <p className={`font-medium ${isEnabled ? colors.text : ""}`}>{label}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <div
          className={`px-3 py-1 rounded-full text-xs font-bold ${
            isEnabled ? "bg-green-500 text-white" : "bg-gray-300 text-gray-600 dark:bg-gray-600 dark:text-gray-300"
          }`}
        >
          {isEnabled ? "ON" : "OFF"}
        </div>
      </div>
    </button>
  );
}

function OrderTypePrioritiesSection({ profile }: { profile: CompanyProfile }) {
  const { actions } = useConfiguracion();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Truck className="h-5 w-5" />
          Tipos de Pedido y Prioridades
        </CardTitle>
        <CardDescription>Habilita la priorización automática según el tipo de pedido</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div>
            <p className="font-medium">Habilitar tipos de pedido</p>
            <p className="text-sm text-muted-foreground">Permite clasificar pedidos como NUEVO, REPROGRAMADO o URGENTE</p>
          </div>
          <button
            onClick={() => {
              actions.setProfile({ ...profile, enableOrderType: !profile.enableOrderType });
              actions.setHasChanges(true);
            }}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
              profile.enableOrderType ? "bg-green-500 text-white" : "bg-gray-300 text-gray-600 dark:bg-gray-600 dark:text-gray-300"
            }`}
          >
            {profile.enableOrderType ? "ON" : "OFF"}
          </button>
        </div>

        {profile.enableOrderType && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
            <PrioritySlider
              label="Pedido Nuevo"
              value={profile.priorityMapping.NEW}
              onChange={(value) => {
                actions.setProfile({ ...profile, priorityMapping: { ...profile.priorityMapping, NEW: value } });
                actions.setHasChanges(true);
              }}
              color="blue"
            />
            <PrioritySlider
              label="Reprogramado"
              value={profile.priorityMapping.RESCHEDULED}
              onChange={(value) => {
                actions.setProfile({ ...profile, priorityMapping: { ...profile.priorityMapping, RESCHEDULED: value } });
                actions.setHasChanges(true);
              }}
              color="amber"
            />
            <PrioritySlider
              label="Urgente"
              value={profile.priorityMapping.URGENT}
              onChange={(value) => {
                actions.setProfile({ ...profile, priorityMapping: { ...profile.priorityMapping, URGENT: value } });
                actions.setHasChanges(true);
              }}
              color="red"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PrioritySlider({ label, value, onChange, color }: { label: string; value: number; onChange: (value: number) => void; color: string }) {
  const colorClasses: Record<string, string> = { blue: "text-blue-600", amber: "text-amber-600", red: "text-red-600" };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="font-medium">{label}</Label>
        <span className={`text-lg font-bold ${colorClasses[color] || ""}`}>{value}</span>
      </div>
      <Slider value={[value]} onValueChange={([v]) => onChange(v)} min={0} max={100} step={5} />
      <p className="text-xs text-muted-foreground">
        {value === 0 && "Sin prioridad"}
        {value > 0 && value <= 30 && "Prioridad baja"}
        {value > 30 && value <= 60 && "Prioridad media"}
        {value > 60 && value <= 80 && "Prioridad alta"}
        {value > 80 && "Prioridad máxima"}
      </p>
    </div>
  );
}

function TrackingSettingsSection({ tracking }: { tracking: TrackingSettings }) {
  const { state, actions } = useConfiguracion();

  const update = (partial: Partial<TrackingSettings>) => {
    actions.setTracking({ ...tracking, ...partial });
    actions.setTrackingHasChanges(true);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Seguimiento Público
            </CardTitle>
            <CardDescription>Permite a tus clientes rastrear sus pedidos con un enlace público</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            {state.trackingHasChanges && (
              <Badge variant="outline" className="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700">
                Cambios sin guardar
              </Badge>
            )}
            <Button size="sm" onClick={actions.handleSaveTracking} disabled={state.isSavingTracking || !state.trackingHasChanges}>
              {state.isSavingTracking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Guardar
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Master toggle */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div>
            <p className="font-medium">Habilitar seguimiento público</p>
            <p className="text-sm text-muted-foreground">Los clientes podrán ver el estado de sus pedidos en tiempo real</p>
          </div>
          <Switch checked={tracking.trackingEnabled} onCheckedChange={(checked) => update({ trackingEnabled: checked })} />
        </div>

        {tracking.trackingEnabled && (
          <>
            {/* Visibility toggles */}
            <div>
              <p className="text-sm font-medium mb-3">Información visible para el cliente</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <TrackingToggle
                  icon={Map}
                  label="Mapa"
                  description="Mostrar mapa con ubicación de entrega"
                  checked={tracking.showMap}
                  onChange={(v) => update({ showMap: v })}
                />
                <TrackingToggle
                  icon={ExternalLink}
                  label="Ubicación del conductor"
                  description="Mostrar posición GPS del conductor en el mapa"
                  checked={tracking.showDriverLocation}
                  onChange={(v) => update({ showDriverLocation: v })}
                />
                <TrackingToggle
                  icon={User}
                  label="Nombre del conductor"
                  description="Mostrar nombre del conductor asignado"
                  checked={tracking.showDriverName}
                  onChange={(v) => update({ showDriverName: v })}
                />
                <TrackingToggle
                  icon={Eye}
                  label="Evidencia de entrega"
                  description="Mostrar fotos y notas al completar"
                  checked={tracking.showEvidence}
                  onChange={(v) => update({ showEvidence: v })}
                />
                <TrackingToggle
                  icon={Clock}
                  label="Tiempo estimado (ETA)"
                  description="Mostrar hora estimada de llegada"
                  checked={tracking.showEta}
                  onChange={(v) => update({ showEta: v })}
                />
                <TrackingToggle
                  icon={Info}
                  label="Línea de tiempo"
                  description="Mostrar historial de estados del pedido"
                  checked={tracking.showTimeline}
                  onChange={(v) => update({ showTimeline: v })}
                />
              </div>
            </div>

            {/* Branding */}
            <div className="border-t pt-6">
              <p className="text-sm font-medium mb-3">Personalización</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Color de marca</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={tracking.brandColor || "#3B82F6"}
                      onChange={(e) => update({ brandColor: e.target.value })}
                      className="h-9 w-12 rounded border cursor-pointer"
                    />
                    <Input
                      value={tracking.brandColor || "#3B82F6"}
                      onChange={(e) => update({ brandColor: e.target.value })}
                      placeholder="#3B82F6"
                      className="flex-1"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Mensaje personalizado</Label>
                  <Input
                    value={tracking.customMessage || ""}
                    onChange={(e) => update({ customMessage: e.target.value || null })}
                    placeholder="Ej: Gracias por tu compra"
                    maxLength={500}
                  />
                </div>
              </div>
            </div>

            {/* Token settings */}
            <div className="border-t pt-6">
              <p className="text-sm font-medium mb-3">Configuración de enlaces</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Expiración del enlace (horas)</Label>
                  <Input
                    type="number"
                    value={tracking.tokenExpiryHours}
                    onChange={(e) => update({ tokenExpiryHours: parseInt(e.target.value) || 48 })}
                    min={1}
                    max={720}
                  />
                  <p className="text-xs text-muted-foreground">
                    Los enlaces expirarán después de {tracking.tokenExpiryHours} horas ({Math.round(tracking.tokenExpiryHours / 24)} días)
                  </p>
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg h-fit">
                  <div>
                    <p className="font-medium text-sm">Auto-generar enlaces</p>
                    <p className="text-xs text-muted-foreground">Crear enlace automáticamente al confirmar un plan</p>
                  </div>
                  <Switch
                    checked={tracking.autoGenerateTokens}
                    onCheckedChange={(checked) => update({ autoGenerateTokens: checked })}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TrackingToggle({
  icon: Icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
