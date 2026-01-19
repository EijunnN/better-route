"use client";

import {
  Box,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  Package,
  Save,
  Scale,
  Settings,
  Tag,
  Truck,
  Weight,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ProtectedPage } from "@/components/auth/protected-page";
import { CompanySelector } from "@/components/company-selector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useCompanyContext } from "@/hooks/use-company-context";

interface CompanyProfile {
  id?: string;
  companyId?: string;
  enableWeight: boolean;
  enableVolume: boolean;
  enableOrderValue: boolean;
  enableUnits: boolean;
  enableOrderType: boolean;
  activeDimensions: string[];
  priorityMapping: {
    NEW: number;
    RESCHEDULED: number;
    URGENT: number;
  };
}

interface ProfileTemplate {
  id: string;
  name: string;
  enableWeight: boolean;
  enableVolume: boolean;
  enableOrderValue: boolean;
  enableUnits: boolean;
  enableOrderType: boolean;
}

const DIMENSION_INFO = {
  WEIGHT: {
    label: "Peso",
    description: "Restricción por peso del paquete (gramos)",
    icon: Weight,
    color: "blue",
  },
  VOLUME: {
    label: "Volumen",
    description: "Restricción por volumen del paquete (litros)",
    icon: Box,
    color: "green",
  },
  VALUE: {
    label: "Valorizado",
    description: "Restricción por valor monetario del pedido",
    icon: Tag,
    color: "amber",
  },
  UNITS: {
    label: "Unidades",
    description: "Restricción por cantidad de items/unidades",
    icon: Package,
    color: "purple",
  },
};

const TEMPLATE_INFO: Record<string, { name: string; description: string }> = {
  LOGISTICS: {
    name: "Logística Tradicional",
    description: "Peso y volumen como restricciones principales",
  },
  HIGH_VALUE: {
    name: "Productos de Alto Valor",
    description: "Valorizado y priorización por tipo de pedido",
  },
  SIMPLE: {
    name: "Entrega Simple",
    description: "Solo conteo de unidades, sin restricciones de capacidad",
  },
  FULL: {
    name: "Completo",
    description: "Todas las dimensiones y opciones habilitadas",
  },
};

function ConfiguracionPageContent() {
  const {
    effectiveCompanyId: companyId,
    isReady,
    isSystemAdmin,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    authCompanyId,
  } = useCompanyContext();

  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [templates, setTemplates] = useState<ProfileTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDefault, setIsDefault] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);

  const fetchProfile = async () => {
    if (!companyId || !isReady) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/company-profiles", {
        headers: { "x-company-id": companyId },
      });
      const data = await response.json();

      if (data.data?.profile) {
        setProfile(data.data.profile);
        setIsDefault(false);
      } else {
        // Use defaults
        setProfile({
          enableWeight: true,
          enableVolume: true,
          enableOrderValue: false,
          enableUnits: false,
          enableOrderType: false,
          activeDimensions: ["WEIGHT", "VOLUME"],
          priorityMapping: { NEW: 50, RESCHEDULED: 80, URGENT: 100 },
        });
        setIsDefault(true);
      }

      if (data.data?.templates) {
        setTemplates(data.data.templates);
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
    setHasChanges(false);
  }, [companyId, isReady]);

  const handleSave = async () => {
    if (!profile || !companyId) return;

    setIsSaving(true);
    try {
      const response = await fetch("/api/company-profiles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId,
        },
        body: JSON.stringify({
          enableWeight: profile.enableWeight,
          enableVolume: profile.enableVolume,
          enableOrderValue: profile.enableOrderValue,
          enableUnits: profile.enableUnits,
          enableOrderType: profile.enableOrderType,
          priorityNew: profile.priorityMapping.NEW,
          priorityRescheduled: profile.priorityMapping.RESCHEDULED,
          priorityUrgent: profile.priorityMapping.URGENT,
        }),
      });

      if (response.ok) {
        setHasChanges(false);
        setIsDefault(false);
        fetchProfile();
      }
    } catch (error) {
      console.error("Error saving profile:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!companyId || !confirm("¿Restablecer a valores predeterminados?")) return;

    try {
      await fetch("/api/company-profiles", {
        method: "DELETE",
        headers: { "x-company-id": companyId },
      });
      fetchProfile();
      setHasChanges(false);
    } catch (error) {
      console.error("Error resetting profile:", error);
    }
  };

  const handleApplyTemplate = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template || !profile) return;

    const newDimensions: string[] = [];
    if (template.enableWeight) newDimensions.push("WEIGHT");
    if (template.enableVolume) newDimensions.push("VOLUME");
    if (template.enableOrderValue) newDimensions.push("VALUE");
    if (template.enableUnits) newDimensions.push("UNITS");

    setProfile({
      ...profile,
      enableWeight: template.enableWeight,
      enableVolume: template.enableVolume,
      enableOrderValue: template.enableOrderValue,
      enableUnits: template.enableUnits,
      enableOrderType: template.enableOrderType,
      activeDimensions: newDimensions,
    });
    setHasChanges(true);
  };

  const toggleDimension = (
    key: "enableWeight" | "enableVolume" | "enableOrderValue" | "enableUnits",
    dimension: string,
  ) => {
    if (!profile) return;

    const isEnabled = profile[key];
    let newDimensions = [...profile.activeDimensions];

    if (isEnabled) {
      newDimensions = newDimensions.filter((d) => d !== dimension);
    } else {
      newDimensions.push(dimension);
    }

    setProfile({
      ...profile,
      [key]: !isEnabled,
      activeDimensions: newDimensions,
    });
    setHasChanges(true);
  };

  const handleDownloadTemplate = () => {
    if (!companyId) return;
    window.open(`/api/orders/csv-template?locale=es`, "_blank");
  };

  if (!isReady || isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Settings className="h-6 w-6" />
              Configuración de Optimización
            </h1>
            <p className="text-muted-foreground mt-1">
              Define las dimensiones y restricciones de capacidad para tu empresa
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
            {hasChanges && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                Cambios sin guardar
              </Badge>
            )}
            <Button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Guardar
            </Button>
          </div>
        </div>

        {/* Info Banner */}
        <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
          <CardContent className="py-3 px-4 flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-700 dark:text-blue-300">
              <span className="font-medium">¿Qué son las dimensiones de capacidad?</span>
              <p className="mt-1">
                Las dimensiones definen qué restricciones aplican a tus vehículos y pedidos.
                Por ejemplo, una empresa de celulares necesita controlar el{" "}
                <span className="font-semibold">valorizado</span>, mientras que una de logística
                tradicional usa <span className="font-semibold">peso y volumen</span>.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Templates */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Plantillas Rápidas
              </CardTitle>
              <CardDescription>
                Aplica una configuración predefinida según tu tipo de negocio
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(TEMPLATE_INFO).map(([id, info]) => (
                <button
                  key={id}
                  onClick={() => handleApplyTemplate(id)}
                  className="w-full p-3 rounded-lg border text-left hover:bg-muted/50 transition-colors"
                >
                  <p className="font-medium text-sm">{info.name}</p>
                  <p className="text-xs text-muted-foreground">{info.description}</p>
                </button>
              ))}

              <div className="pt-4 border-t mt-4">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleDownloadTemplate}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Descargar Plantilla CSV
                </Button>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  La plantilla incluye solo los campos relevantes para tu configuración
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Dimensions */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Scale className="h-5 w-5" />
                Dimensiones de Capacidad
              </CardTitle>
              <CardDescription>
                Selecciona qué restricciones de capacidad aplican a tu operación
              </CardDescription>
            </CardHeader>
            <CardContent>
              {profile && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Weight */}
                  <DimensionToggle
                    icon={DIMENSION_INFO.WEIGHT.icon}
                    label={DIMENSION_INFO.WEIGHT.label}
                    description={DIMENSION_INFO.WEIGHT.description}
                    isEnabled={profile.enableWeight}
                    color="blue"
                    onToggle={() => toggleDimension("enableWeight", "WEIGHT")}
                  />

                  {/* Volume */}
                  <DimensionToggle
                    icon={DIMENSION_INFO.VOLUME.icon}
                    label={DIMENSION_INFO.VOLUME.label}
                    description={DIMENSION_INFO.VOLUME.description}
                    isEnabled={profile.enableVolume}
                    color="green"
                    onToggle={() => toggleDimension("enableVolume", "VOLUME")}
                  />

                  {/* Value */}
                  <DimensionToggle
                    icon={DIMENSION_INFO.VALUE.icon}
                    label={DIMENSION_INFO.VALUE.label}
                    description={DIMENSION_INFO.VALUE.description}
                    isEnabled={profile.enableOrderValue}
                    color="amber"
                    onToggle={() => toggleDimension("enableOrderValue", "VALUE")}
                  />

                  {/* Units */}
                  <DimensionToggle
                    icon={DIMENSION_INFO.UNITS.icon}
                    label={DIMENSION_INFO.UNITS.label}
                    description={DIMENSION_INFO.UNITS.description}
                    isEnabled={profile.enableUnits}
                    color="purple"
                    onToggle={() => toggleDimension("enableUnits", "UNITS")}
                  />
                </div>
              )}

              {/* Active Dimensions Summary */}
              {profile && (
                <div className="mt-6 p-4 bg-muted/30 rounded-lg">
                  <p className="text-sm font-medium mb-2">Dimensiones activas:</p>
                  <div className="flex flex-wrap gap-2">
                    {profile.activeDimensions.length === 0 ? (
                      <Badge variant="outline" className="text-muted-foreground">
                        Ninguna (sin restricciones de capacidad)
                      </Badge>
                    ) : (
                      profile.activeDimensions.map((dim) => {
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

        {/* Order Type & Priorities */}
        {profile && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Tipos de Pedido y Prioridades
              </CardTitle>
              <CardDescription>
                Habilita la priorización automática según el tipo de pedido
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Enable Order Type Toggle */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">Habilitar tipos de pedido</p>
                  <p className="text-sm text-muted-foreground">
                    Permite clasificar pedidos como NUEVO, REPROGRAMADO o URGENTE
                  </p>
                </div>
                <button
                  onClick={() => {
                    setProfile({ ...profile, enableOrderType: !profile.enableOrderType });
                    setHasChanges(true);
                  }}
                  className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                    profile.enableOrderType
                      ? "bg-green-500 text-white"
                      : "bg-gray-300 text-gray-600 dark:bg-gray-600 dark:text-gray-300"
                  }`}
                >
                  {profile.enableOrderType ? "ON" : "OFF"}
                </button>
              </div>

              {/* Priority Sliders - only show when order type is enabled */}
              {profile.enableOrderType && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                  <PrioritySlider
                    label="Pedido Nuevo"
                    value={profile.priorityMapping.NEW}
                    onChange={(value) => {
                      setProfile({
                        ...profile,
                        priorityMapping: { ...profile.priorityMapping, NEW: value },
                      });
                      setHasChanges(true);
                    }}
                    color="blue"
                  />
                  <PrioritySlider
                    label="Reprogramado"
                    value={profile.priorityMapping.RESCHEDULED}
                    onChange={(value) => {
                      setProfile({
                        ...profile,
                        priorityMapping: { ...profile.priorityMapping, RESCHEDULED: value },
                      });
                      setHasChanges(true);
                    }}
                    color="amber"
                  />
                  <PrioritySlider
                    label="Urgente"
                    value={profile.priorityMapping.URGENT}
                    onChange={(value) => {
                      setProfile({
                        ...profile,
                        priorityMapping: { ...profile.priorityMapping, URGENT: value },
                      });
                      setHasChanges(true);
                    }}
                    color="red"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Reset Button */}
        {!isDefault && (
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleReset}>
              Restablecer a valores predeterminados
            </Button>
          </div>
        )}
      </div>
  );
}

// Dimension Toggle Component
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
    blue: {
      bg: "bg-blue-50 dark:bg-blue-950/30",
      border: "border-blue-300 dark:border-blue-700",
      text: "text-blue-600 dark:text-blue-400",
    },
    green: {
      bg: "bg-green-50 dark:bg-green-950/30",
      border: "border-green-300 dark:border-green-700",
      text: "text-green-600 dark:text-green-400",
    },
    amber: {
      bg: "bg-amber-50 dark:bg-amber-950/30",
      border: "border-amber-300 dark:border-amber-700",
      text: "text-amber-600 dark:text-amber-400",
    },
    purple: {
      bg: "bg-purple-50 dark:bg-purple-950/30",
      border: "border-purple-300 dark:border-purple-700",
      text: "text-purple-600 dark:text-purple-400",
    },
  };

  const colors = colorClasses[color] || colorClasses.blue;

  return (
    <button
      onClick={onToggle}
      className={`p-4 rounded-lg border-2 text-left transition-all ${
        isEnabled
          ? `${colors.bg} ${colors.border}`
          : "bg-muted/30 border-transparent hover:border-muted-foreground/20"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-lg ${
              isEnabled ? colors.bg : "bg-muted"
            }`}
          >
            <Icon
              className={`h-5 w-5 ${
                isEnabled ? colors.text : "text-muted-foreground"
              }`}
            />
          </div>
          <div>
            <p className={`font-medium ${isEnabled ? colors.text : ""}`}>
              {label}
            </p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <div
          className={`px-3 py-1 rounded-full text-xs font-bold ${
            isEnabled
              ? "bg-green-500 text-white"
              : "bg-gray-300 text-gray-600 dark:bg-gray-600 dark:text-gray-300"
          }`}
        >
          {isEnabled ? "ON" : "OFF"}
        </div>
      </div>
    </button>
  );
}

// Priority Slider Component
function PrioritySlider({
  label,
  value,
  onChange,
  color,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: "text-blue-600",
    amber: "text-amber-600",
    red: "text-red-600",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="font-medium">{label}</Label>
        <span className={`text-lg font-bold ${colorClasses[color] || ""}`}>
          {value}
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={0}
        max={100}
        step={5}
      />
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

export default function ConfiguracionPage() {
  return (
    <ProtectedPage requiredPermission="optimization_presets:VIEW">
      <ConfiguracionPageContent />
    </ProtectedPage>
  );
}
