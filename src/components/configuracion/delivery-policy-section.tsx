"use client";

import { Camera, FileSignature, GitBranch, StickyNote, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SYSTEM_STATE_ORDER, type SystemState } from "@/lib/workflow/states";
import { type DeliveryPolicy, useConfiguracion } from "./configuracion-context";

/**
 * Map a `SystemState` to the policy field names that hold its label
 * and colour. Keeps the form schema-driven without hardcoding the
 * five system states three times.
 */
const STATE_FIELDS: Record<
  SystemState,
  { label: keyof DeliveryPolicy; color: keyof DeliveryPolicy }
> = {
  PENDING: { label: "labelPending", color: "colorPending" },
  IN_PROGRESS: { label: "labelInProgress", color: "colorInProgress" },
  COMPLETED: { label: "labelCompleted", color: "colorCompleted" },
  FAILED: { label: "labelFailed", color: "colorFailed" },
  CANCELLED: { label: "labelCancelled", color: "colorCancelled" },
};

const STATE_DESCRIPTIONS: Record<SystemState, string> = {
  PENDING: "Estado inicial — el pedido espera ser iniciado",
  IN_PROGRESS: "El conductor abrió la parada y va en camino",
  COMPLETED: "Entrega cerrada con éxito (terminal)",
  FAILED: "Entrega fallida con motivo (terminal)",
  CANCELLED: "Parada omitida sin intento (terminal)",
};

export function DeliveryPolicySection() {
  const { state, actions } = useConfiguracion();
  const policy = state.deliveryPolicy;

  if (!policy) {
    return (
      <section className="grid gap-6 px-6 py-8 md:grid-cols-[260px_1fr] md:gap-10 md:px-8 md:py-10">
        <header>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <GitBranch className="size-4 text-muted-foreground" />
            Política de entrega
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Cómo los conductores marcan estados de paradas.
          </p>
        </header>
        <div className="text-sm text-muted-foreground">Cargando…</div>
      </section>
    );
  }

  return (
    <section className="grid gap-6 px-6 py-8 md:grid-cols-[260px_1fr] md:gap-10 md:px-8 md:py-10">
      <header>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <GitBranch className="size-4 text-muted-foreground" />
          Política de entrega
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Cómo los conductores marcan estados de paradas. Los 5 estados y sus
          transiciones son fijos — acá solo configurás cómo se ven y qué
          evidencia exigen.
        </p>
      </header>

      <div className="space-y-6">
        <StateLabelsBlock
          policy={policy}
          onChange={actions.updateDeliveryPolicy}
        />
        <EvidenceRequirementsBlock
          policy={policy}
          onChange={actions.updateDeliveryPolicy}
        />
        <FailureReasonsBlock
          policy={policy}
          onChange={actions.updateDeliveryPolicy}
        />
      </div>
    </section>
  );
}

interface BlockProps {
  policy: DeliveryPolicy;
  onChange: (partial: Partial<DeliveryPolicy>) => void;
}

function StateLabelsBlock({ policy, onChange }: BlockProps) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Nombres y colores por estado</p>
        <p className="text-xs text-muted-foreground">
          Cómo se muestra cada estado al operador y al cliente final.
        </p>
      </div>
      <div className="divide-y divide-foreground/10 rounded-md border border-foreground/10 bg-background/40">
        {SYSTEM_STATE_ORDER.map((state) => {
          const labelField = STATE_FIELDS[state].label;
          const colorField = STATE_FIELDS[state].color;
          const labelValue = policy[labelField] as string;
          const colorValue = policy[colorField] as string;
          return (
            <div
              key={state}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3"
            >
              <input
                type="color"
                aria-label={`Color de ${state}`}
                value={colorValue}
                onChange={(e) =>
                  onChange({
                    [colorField]: e.target.value,
                  } as Partial<DeliveryPolicy>)
                }
                className="h-8 w-8 cursor-pointer rounded border border-foreground/10 bg-transparent p-0"
              />
              <div className="min-w-0">
                <Input
                  value={labelValue}
                  onChange={(e) =>
                    onChange({
                      [labelField]: e.target.value,
                    } as Partial<DeliveryPolicy>)
                  }
                  className="h-8"
                  aria-label={`Etiqueta de ${state}`}
                />
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  <span className="font-mono">{state}</span> —{" "}
                  {STATE_DESCRIPTIONS[state]}
                </p>
              </div>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: `${colorValue}1a`,
                  color: colorValue,
                }}
              >
                Preview
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EvidenceRequirementsBlock({ policy, onChange }: BlockProps) {
  const rows: Array<{
    key: keyof DeliveryPolicy;
    label: string;
    description: string;
    icon: typeof Camera;
  }> = [
    {
      key: "completedRequiresPhoto",
      label: "Entregado requiere foto",
      description: "Foto de la entrega en el lugar al cerrar la parada.",
      icon: Camera,
    },
    {
      key: "completedRequiresSignature",
      label: "Entregado requiere firma",
      description: "Firma digital del receptor en el mobile.",
      icon: FileSignature,
    },
    {
      key: "completedRequiresNotes",
      label: "Entregado requiere notas",
      description: "Comentario del conductor obligatorio.",
      icon: StickyNote,
    },
    {
      key: "failedRequiresPhoto",
      label: "No entregado requiere foto",
      description:
        "Evidencia visual del intento fallido (puerta cerrada, etc.).",
      icon: Camera,
    },
    {
      key: "failedRequiresNotes",
      label: "No entregado requiere notas",
      description: "Detalle adicional al motivo de fallo.",
      icon: StickyNote,
    },
  ];

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Evidencia obligatoria</p>
        <p className="text-xs text-muted-foreground">
          Qué tiene que adjuntar el conductor para marcar entregas y fallos.
        </p>
      </div>
      <div className="divide-y divide-foreground/10 rounded-md border border-foreground/10 bg-background/40">
        {rows.map((row) => {
          const Icon = row.icon;
          const checked = policy[row.key] as boolean;
          return (
            <div
              key={row.key}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon className="size-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{row.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.description}
                  </p>
                </div>
              </div>
              <Switch
                checked={checked}
                onCheckedChange={(v) =>
                  onChange({ [row.key]: v } as Partial<DeliveryPolicy>)
                }
                aria-label={row.label}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FailureReasonsBlock({ policy, onChange }: BlockProps) {
  const [draft, setDraft] = useState("");
  const reasons = policy.failureReasons ?? [];

  const addReason = () => {
    const value = draft.trim();
    if (!value) return;
    if (reasons.includes(value)) {
      setDraft("");
      return;
    }
    onChange({ failureReasons: [...reasons, value] });
    setDraft("");
  };

  const removeReason = (reason: string) => {
    onChange({ failureReasons: reasons.filter((r) => r !== reason) });
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Motivos de fallo</p>
        <p className="text-xs text-muted-foreground">
          Opciones que aparecen al conductor cuando marca una parada como “No
          entregado”.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addReason();
            }
          }}
          placeholder="Ej: Cliente fuera de cobertura"
          className="h-9"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={addReason}
          disabled={!draft.trim()}
        >
          Agregar
        </Button>
      </div>

      {reasons.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {reasons.map((reason) => (
            <li
              key={reason}
              className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-background/40 px-2.5 py-1 text-xs"
            >
              <span>{reason}</span>
              <button
                type="button"
                onClick={() => removeReason(reason)}
                aria-label={`Eliminar ${reason}`}
                className="rounded-full text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          Sin motivos. Agregá al menos uno o el conductor no podrá marcar
          fallos.
        </p>
      )}
    </div>
  );
}
