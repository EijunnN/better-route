"use client";

import {
  Clock,
  Eye,
  Globe,
  Info,
  Map as MapIcon,
  MapPin,
  User,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { TrackingSettings } from "./configuracion-context";
import { useConfiguracion } from "./configuracion-context";

const VISIBILITY_TOGGLES: Array<{
  key: keyof Pick<
    TrackingSettings,
    | "showMap"
    | "showDriverLocation"
    | "showDriverName"
    | "showEvidence"
    | "showEta"
    | "showTimeline"
  >;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    key: "showMap",
    label: "Mapa",
    description: "Muestra el mapa con la ubicación de entrega",
    icon: MapIcon,
  },
  {
    key: "showDriverLocation",
    label: "Ubicación del conductor",
    description: "Posición GPS en tiempo real del conductor asignado",
    icon: MapPin,
  },
  {
    key: "showDriverName",
    label: "Nombre del conductor",
    description: "Identifica públicamente al conductor asignado",
    icon: User,
  },
  {
    key: "showEvidence",
    label: "Evidencia de entrega",
    description: "Fotos y notas al completar la entrega",
    icon: Eye,
  },
  {
    key: "showEta",
    label: "Tiempo estimado (ETA)",
    description: "Hora estimada de llegada calculada por el solver",
    icon: Clock,
  },
  {
    key: "showTimeline",
    label: "Línea de tiempo",
    description: "Historial de estados del pedido",
    icon: Info,
  },
];

export function TrackingSettingsSection() {
  const { state, actions } = useConfiguracion();
  const tracking = state.tracking;

  if (!tracking) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Seguimiento público
        </CardTitle>
        <CardDescription>
          Genera enlaces para que tus clientes vean el estado de sus pedidos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-4 rounded-md border px-4 py-3">
          <div>
            <p className="text-sm font-medium">Habilitar seguimiento público</p>
            <p className="text-xs text-muted-foreground">
              Los clientes podrán ver el estado de su pedido en tiempo real.
            </p>
          </div>
          <Switch
            checked={tracking.trackingEnabled}
            onCheckedChange={(v) =>
              actions.updateTracking({ trackingEnabled: v })
            }
            aria-label="Habilitar seguimiento público"
          />
        </div>

        {tracking.trackingEnabled && (
          <>
            <div>
              <p className="text-sm font-medium mb-3">
                Información visible para el cliente
              </p>
              <div className="divide-y rounded-md border">
                {VISIBILITY_TOGGLES.map((t) => {
                  const Icon = t.icon;
                  return (
                    <div
                      key={t.key}
                      className="flex items-center justify-between gap-4 px-4 py-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{t.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {t.description}
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={tracking[t.key]}
                        onCheckedChange={(v) =>
                          actions.updateTracking({ [t.key]: v })
                        }
                        aria-label={t.label}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t pt-6">
              <p className="text-sm font-medium mb-3">Personalización</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="brand-color">Color de marca</Label>
                  <div className="flex items-center gap-2">
                    <input
                      id="brand-color"
                      type="color"
                      value={tracking.brandColor || "#3B82F6"}
                      onChange={(e) =>
                        actions.updateTracking({ brandColor: e.target.value })
                      }
                      className="h-9 w-12 cursor-pointer rounded border"
                      aria-label="Selector de color de marca"
                    />
                    <Input
                      value={tracking.brandColor || "#3B82F6"}
                      onChange={(e) =>
                        actions.updateTracking({ brandColor: e.target.value })
                      }
                      placeholder="#3B82F6"
                      className="flex-1 font-mono"
                    />
                  </div>
                  <BrandColorPreview color={tracking.brandColor || "#3B82F6"} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="custom-message">Mensaje personalizado</Label>
                  <Input
                    id="custom-message"
                    value={tracking.customMessage || ""}
                    onChange={(e) =>
                      actions.updateTracking({
                        customMessage: e.target.value || null,
                      })
                    }
                    placeholder="Ej: Gracias por tu compra"
                    maxLength={500}
                  />
                  <p className="text-xs text-muted-foreground">
                    Aparece en la cabecera del tracking público.
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t pt-6">
              <p className="text-sm font-medium mb-3">Configuración de enlaces</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="expiry-hours">
                    Expiración del enlace (horas)
                  </Label>
                  <Input
                    id="expiry-hours"
                    type="number"
                    value={tracking.tokenExpiryHours}
                    onChange={(e) =>
                      actions.updateTracking({
                        tokenExpiryHours: parseInt(e.target.value) || 48,
                      })
                    }
                    min={1}
                    max={720}
                  />
                  <p className="text-xs text-muted-foreground">
                    Equivale a {Math.round(tracking.tokenExpiryHours / 24)} día
                    {Math.round(tracking.tokenExpiryHours / 24) === 1 ? "" : "s"}.
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-md border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Auto-generar enlaces</p>
                    <p className="text-xs text-muted-foreground">
                      Crea un enlace automáticamente al confirmar un plan.
                    </p>
                  </div>
                  <Switch
                    checked={tracking.autoGenerateTokens}
                    onCheckedChange={(v) =>
                      actions.updateTracking({ autoGenerateTokens: v })
                    }
                    aria-label="Auto-generar enlaces"
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

/**
 * Minimal preview of how the brand color will render in the tracking page
 * header. Three elements (header band, status badge, button) so the planner
 * can see contrast before saving.
 */
function BrandColorPreview({ color }: { color: string }) {
  return (
    <div className="rounded-md border bg-background p-3 space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Vista previa
      </p>
      <div className="flex items-center gap-2">
        <div
          className="h-6 flex-1 rounded"
          style={{ backgroundColor: color }}
        />
        <span
          className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
          style={{ backgroundColor: color }}
        >
          En ruta
        </span>
        <button
          type="button"
          className="rounded px-2 py-1 text-xs font-medium text-white"
          style={{ backgroundColor: color }}
          disabled
        >
          Rastrear
        </button>
      </div>
    </div>
  );
}
