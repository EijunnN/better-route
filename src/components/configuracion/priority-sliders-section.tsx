"use client";

import { Truck } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { CompanyProfile } from "./configuracion-context";
import { useConfiguracion } from "./configuracion-context";

const PRIORITY_LABELS: Array<[number, string]> = [
  [0, "Sin prioridad"],
  [30, "Baja"],
  [60, "Media"],
  [80, "Alta"],
  [101, "Máxima"],
];

function describePriority(value: number): string {
  for (const [threshold, label] of PRIORITY_LABELS) {
    if (value <= threshold) return label;
  }
  return "Máxima";
}

const PRIORITY_TYPES: Array<{
  key: keyof CompanyProfile["priorityMapping"];
  label: string;
  description: string;
}> = [
  {
    key: "NEW",
    label: "Pedido nuevo",
    description: "Orden recién creada sin intento previo",
  },
  {
    key: "RESCHEDULED",
    label: "Reprogramado",
    description: "Reintento tras entrega fallida",
  },
  {
    key: "URGENT",
    label: "Urgente",
    description: "Marcado explícitamente como prioritario",
  },
];

export function PrioritySlidersSection() {
  const { state, actions } = useConfiguracion();
  const profile = state.profile;

  if (!profile) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Truck className="h-4 w-4" />
          Priorización por tipo de pedido
        </CardTitle>
        <CardDescription>
          Cuanto mayor el valor, más temprano se ubica el pedido en la ruta optimizada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-4 rounded-md border px-4 py-3">
          <div>
            <p className="text-sm font-medium">Habilitar tipos de pedido</p>
            <p className="text-xs text-muted-foreground">
              Clasifica pedidos como NUEVO, REPROGRAMADO o URGENTE.
            </p>
          </div>
          <Switch
            checked={profile.enableOrderType}
            onCheckedChange={(v) =>
              actions.updateProfile({ enableOrderType: v })
            }
            aria-label="Habilitar tipos de pedido"
          />
        </div>

        {profile.enableOrderType && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PRIORITY_TYPES.map((pt) => {
              const value = profile.priorityMapping[pt.key];
              return (
                <div key={pt.key} className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium">{pt.label}</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {pt.description}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-semibold tabular-nums">
                      {value}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {describePriority(value)}
                    </span>
                  </div>
                  <Slider
                    value={[value]}
                    onValueChange={([v]) =>
                      actions.updateProfile({
                        priorityMapping: {
                          ...profile.priorityMapping,
                          [pt.key]: v,
                        },
                      })
                    }
                    min={0}
                    max={100}
                    step={5}
                    aria-label={`Prioridad ${pt.label}`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
