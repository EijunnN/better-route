"use client";

import { Box, Package, Scale, Tag, Weight } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useConfiguracion } from "./configuracion-context";

const DIMENSIONS = [
  {
    key: "enableWeight" as const,
    code: "WEIGHT",
    label: "Peso",
    description: "Restricción por peso del paquete (gramos)",
    icon: Weight,
  },
  {
    key: "enableVolume" as const,
    code: "VOLUME",
    label: "Volumen",
    description: "Restricción por volumen del paquete (litros)",
    icon: Box,
  },
  {
    key: "enableOrderValue" as const,
    code: "VALUE",
    label: "Valorizado",
    description: "Restricción por valor monetario del pedido",
    icon: Tag,
  },
  {
    key: "enableUnits" as const,
    code: "UNITS",
    label: "Unidades",
    description: "Restricción por cantidad de items",
    icon: Package,
  },
];

const TEMPLATE_META: Record<string, string> = {
  LOGISTICS: "Peso y volumen",
  HIGH_VALUE: "Valorizado + priorización",
  SIMPLE: "Solo conteo de unidades",
  FULL: "Todas las dimensiones",
};

export function CapacityDimensionsCard() {
  const { state, actions } = useConfiguracion();
  const profile = state.profile;

  if (!profile) return null;

  return (
    <section className="grid gap-6 px-6 py-8 md:grid-cols-[260px_1fr] md:gap-10 md:px-8 md:py-10">
      <header>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Scale className="size-4 text-muted-foreground" />
          Dimensiones de capacidad
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Qué restricciones aplican a vehículos y pedidos durante la
          optimización.
        </p>
      </header>

      <div className="space-y-4">
        {state.templates.length > 0 && (
          <div className="flex items-end justify-end">
            <div className="w-full sm:w-64">
              <Label className="text-xs text-muted-foreground">
                Plantilla rápida
              </Label>
              <Select
                value=""
                onValueChange={(v) => v && actions.applyTemplate(v)}
              >
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue placeholder="Aplicar plantilla..." />
                </SelectTrigger>
                <SelectContent>
                  {state.templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <div className="flex flex-col">
                        <span>{t.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {TEMPLATE_META[t.id] || ""}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {DIMENSIONS.map((d) => {
            const Icon = d.icon;
            const enabled = profile[d.key];
            return (
              <div
                key={d.key}
                className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 transition-colors ${
                  enabled
                    ? "border-primary/30 bg-primary/5"
                    : "border-foreground/10 bg-background/40"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`flex size-8 items-center justify-center rounded-md shrink-0 ${
                      enabled
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{d.label}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {d.description}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={() => actions.toggleDimension(d.key, d.code)}
                  aria-label={`Activar ${d.label}`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
