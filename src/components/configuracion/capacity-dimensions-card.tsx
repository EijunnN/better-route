"use client";

import { Box, Package, Scale, Tag, Weight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Scale className="h-4 w-4" />
            Dimensiones de capacidad
          </CardTitle>
          <CardDescription className="mt-1">
            Qué restricciones aplican a vehículos y pedidos durante la optimización.
          </CardDescription>
        </div>
        {state.templates.length > 0 && (
          <div className="w-60">
            <Label className="text-xs text-muted-foreground">Plantilla rápida</Label>
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
        )}
      </CardHeader>
      <CardContent>
        <div className="divide-y rounded-md border">
          {DIMENSIONS.map((d) => {
            const Icon = d.icon;
            const enabled = profile[d.key];
            return (
              <div
                key={d.key}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-md ${
                      enabled
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{d.label}</p>
                    <p className="text-xs text-muted-foreground">
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
      </CardContent>
    </Card>
  );
}
