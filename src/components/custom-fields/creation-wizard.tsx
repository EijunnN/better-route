"use client";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  ChevronRight,
  DollarSign,
  FileSpreadsheet,
  Hash,
  List,
  Loader2,
  Mail,
  Phone,
  Plus,
  Smartphone,
  Table as TableIcon,
  ToggleLeft,
  Trash2,
  Truck,
  Type,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  FIELD_TYPE_LABELS,
  type FieldDefinitionInput,
  type FieldEntity,
  type FieldType,
  useCustomFields,
} from "./custom-fields-context";
import { DynamicFieldRenderer } from "./dynamic-field-renderer";
import {
  detectPolicyOverlap,
  ENTITY_TINT,
  FIELD_TYPE_TINT,
  labelToCode,
} from "./flow-tints";
import { MiniCsv, MiniPhone, MiniTable } from "./mini-previews";

const FIELD_TYPE_ICON: Record<FieldType, typeof Type> = {
  text: Type,
  number: Hash,
  select: List,
  date: Calendar,
  currency: DollarSign,
  phone: Phone,
  email: Mail,
  boolean: ToggleLeft,
};

const FIELD_TYPE_HINT: Record<FieldType, string> = {
  text: "Referencias, nombres",
  number: "Cantidades, conteos",
  select: "Lista de opciones",
  date: "Fechas, vencimientos",
  currency: "Montos en pesos",
  phone: "Contactos",
  email: "Correos",
  boolean: "Sí o no",
};

const STEP_LABELS = ["Origen", "Tipo", "Nombre", "Destinos"] as const;

interface WizardData {
  entity: FieldEntity | null;
  fieldType: FieldType | null;
  label: string;
  placeholder: string;
  options: string[];
  showInList: boolean;
  showInMobile: boolean;
  showInCsv: boolean;
  required: boolean;
}

const INITIAL_DATA: WizardData = {
  entity: null,
  fieldType: null,
  label: "",
  placeholder: "",
  options: ["", ""],
  showInList: true,
  showInMobile: true,
  showInCsv: true,
  required: false,
};

/**
 * 4-step conversational wizard. Each step focuses on one decision; the
 * right pane shows a live preview of the field being assembled. The
 * step order maps 1:1 to the FlowRow visual on the dashboard:
 *   Origen → Tipo → Nombre → Destinos
 * so the user is literally building the diagram piece by piece.
 */
export function CreationWizard({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { state, actions } = useCustomFields();
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [data, setData] = useState<WizardData>({
    ...INITIAL_DATA,
    entity: state.defaultEntity ?? null,
  });
  const [submitting, setSubmitting] = useState(false);

  const overlap = data.label ? detectPolicyOverlap(data.label) : null;

  function patch(u: Partial<WizardData>) {
    setData((d) => ({ ...d, ...u }));
  }

  function reset() {
    setStep(0);
    setData({ ...INITIAL_DATA, entity: state.defaultEntity ?? null });
  }

  function handleClose() {
    onClose();
    setTimeout(reset, 300);
  }

  const canNext = [
    () => !!data.entity,
    () => !!data.fieldType,
    () => data.label.trim().length > 0,
    () => true,
  ] as const;

  function next() {
    if (step < 3 && canNext[step]())
      setStep((s) => Math.min(3, s + 1) as 0 | 1 | 2 | 3);
  }
  function prev() {
    setStep((s) => Math.max(0, s - 1) as 0 | 1 | 2 | 3);
  }

  async function finish() {
    if (!data.entity || !data.fieldType) return;
    const code = labelToCode(data.label);
    if (!code) return;

    const isOrders = data.entity === "orders";
    const nextPosition =
      state.definitions
        .filter((d) => d.entity === data.entity)
        .reduce((max, d) => Math.max(max, d.position), -1) + 1;

    const payload: FieldDefinitionInput = {
      code,
      label: data.label.trim(),
      entity: data.entity,
      fieldType: data.fieldType,
      required: data.required,
      placeholder: data.placeholder.trim() || undefined,
      defaultValue: undefined,
      position: nextPosition,
      showInList: isOrders ? data.showInList : false,
      showInMobile: data.showInMobile,
      showInCsv: isOrders ? data.showInCsv : false,
      options:
        data.fieldType === "select"
          ? data.options.map((s) => s.trim()).filter(Boolean)
          : undefined,
    };

    setSubmitting(true);
    try {
      await actions.createDefinition(payload);
      handleClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
    >
      <DialogContent className="grid max-h-[calc(100vh-60px)] max-w-[920px] grid-cols-[1fr_320px] gap-0 overflow-hidden p-0">
        {/* LEFT — wizard. Built-in DialogContent close button sits
            top-right; we don't render our own. */}
        <div className="flex min-h-[540px] flex-col overflow-y-auto p-7">
          <WizardHeader step={step} />
          <div className="mt-6 flex-1">
            {step === 0 && <StepOrigin data={data} patch={patch} />}
            {step === 1 && <StepType data={data} patch={patch} />}
            {step === 2 && (
              <StepName data={data} patch={patch} overlap={overlap} />
            )}
            {step === 3 && <StepDestinations data={data} patch={patch} />}
          </div>
          <div className="mt-5 flex items-center justify-between gap-2 border-t border-border pt-4">
            <Button
              variant="ghost"
              onClick={prev}
              disabled={step === 0 || submitting}
            >
              <ArrowLeft className="size-3.5" />
              Atrás
            </Button>
            {step < 3 ? (
              <Button onClick={next} disabled={!canNext[step]() || submitting}>
                Siguiente
                <ArrowRight className="size-3.5" />
              </Button>
            ) : (
              <Button onClick={finish} disabled={submitting}>
                {submitting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                Crear campo
              </Button>
            )}
          </div>
        </div>

        {/* RIGHT — live preview */}
        <WizardPreview data={data} step={step} />
      </DialogContent>
    </Dialog>
  );
}

function WizardHeader({ step }: { step: number }) {
  return (
    <div>
      <div className="mb-4">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Paso {step + 1} de 4
        </div>
        <h2 className="mt-0.5 text-[22px] font-semibold tracking-tight">
          {STEP_LABELS[step]}
        </h2>
      </div>
      <div className="flex gap-1">
        {STEP_LABELS.map((label, i) => (
          <div
            key={label}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= step ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

interface StepProps {
  data: WizardData;
  patch: (u: Partial<WizardData>) => void;
}

function StepOrigin({ data, patch }: StepProps) {
  const options: Array<{
    value: FieldEntity;
    Icon: typeof Users;
    label: string;
    hint: string;
  }> = [
    {
      value: "orders",
      Icon: Users,
      label: "Tu equipo",
      hint: "Lo cargan en el panel al crear o editar un pedido. Ejemplos: monto a cobrar, OC del cliente, tipo de servicio.",
    },
    {
      value: "route_stops",
      Icon: Truck,
      label: "El conductor",
      hint: "Lo carga en la app al llegar a la parada o al cerrar la entrega. Ejemplos: DNI del receptor, bultos entregados, en buen estado.",
    },
  ];

  return (
    <div>
      <p className="mb-4 mt-0 text-sm leading-relaxed text-muted-foreground">
        Esta es la decisión más importante:{" "}
        <strong className="text-foreground">
          ¿quién va a llenar este dato?
        </strong>{" "}
        Tu equipo en el panel, o el conductor en la calle.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {options.map((opt) => {
          const selected = data.entity === opt.value;
          const tint = ENTITY_TINT[opt.value];
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => patch({ entity: opt.value })}
              className={`rounded-lg p-[18px] text-left transition-colors ${
                selected
                  ? "border-2 border-primary bg-primary/15"
                  : "border border-foreground/15 bg-card hover:bg-muted/50"
              }`}
            >
              <div
                className={`mb-3 inline-flex size-12 items-center justify-center rounded-xl ${tint.bg} ${tint.fg}`}
              >
                <opt.Icon className="size-[22px]" />
              </div>
              <div className="text-[15px] font-semibold">{opt.label}</div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {opt.hint}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepType({ data, patch }: StepProps) {
  const types = Object.keys(FIELD_TYPE_LABELS) as FieldType[];
  return (
    <div>
      <p className="mb-4 mt-0 text-sm leading-relaxed text-muted-foreground">
        El <strong className="text-foreground">tipo</strong> determina cómo se
        valida y se muestra. Elegí el que mejor representa el dato.
      </p>
      <div className="grid grid-cols-4 gap-2">
        {types.map((t) => {
          const Icon = FIELD_TYPE_ICON[t];
          const selected = data.fieldType === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => patch({ fieldType: t })}
              className={`flex flex-col items-center gap-2 rounded-md px-2.5 py-4 text-center transition-colors ${
                selected
                  ? `border-2 ${FIELD_TYPE_TINT[t]} ring-1 ring-inset ring-current`
                  : "border border-border bg-card hover:bg-muted/50"
              }`}
            >
              <Icon className="size-5" />
              <div className="text-[12.5px] font-semibold">
                {FIELD_TYPE_LABELS[t]}
              </div>
              <div className="text-[10.5px] opacity-75">
                {FIELD_TYPE_HINT[t]}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepName({
  data,
  patch,
  overlap,
}: StepProps & { overlap: string | null }) {
  const suggestions =
    data.entity === "orders"
      ? [
          "Monto a cobrar",
          "OC del cliente",
          "Referencia interna",
          "Tipo de servicio",
        ]
      : [
          "DNI del receptor",
          "Nombre de quién recibió",
          "Bultos entregados",
          "En buen estado",
        ];

  return (
    <div>
      <p className="mb-4 mt-0 text-sm leading-relaxed text-muted-foreground">
        Ponele un nombre claro — es lo que va a ver{" "}
        <strong className="text-foreground">
          {data.entity === "orders" ? "tu equipo" : "el conductor"}
        </strong>{" "}
        en cada {data.entity === "orders" ? "formulario" : "entrega"}.
      </p>
      <Input
        value={data.label}
        onChange={(e) => patch({ label: e.target.value })}
        placeholder="Ej: Monto a cobrar"
        className="h-11 text-base"
      />
      {overlap && (
        <div className="mt-3 flex gap-2.5 rounded-md bg-amber-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertCircle className="mt-0.5 size-[15px] shrink-0" />
          <span>
            <strong>"{overlap}"</strong> ya está cubierto por{" "}
            <strong>Política de entrega</strong> (foto, firma, motivos de
            fallo). Crearlo acá puede causar reportes inconsistentes.{" "}
            <Link
              href="/configuracion"
              className="underline underline-offset-2"
            >
              Ir a Política →
            </Link>
          </span>
        </div>
      )}
      <div className="mt-4">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          Sugerencias rápidas
        </div>
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => patch({ label: s })}
              className="rounded-full border border-foreground/15 bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      {data.fieldType === "select" && (
        <div className="mt-4">
          <Label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
            Opciones
          </Label>
          <div className="flex flex-col gap-1.5">
            {data.options.map((opt, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: ordered list of editable strings
              <div key={i} className="flex gap-1.5">
                <Input
                  value={opt}
                  onChange={(e) => {
                    const n = [...data.options];
                    n[i] = e.target.value;
                    patch({ options: n });
                  }}
                  placeholder={`Opción ${i + 1}`}
                  className="h-9"
                />
                {data.options.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-9 p-0"
                    onClick={() =>
                      patch({
                        options: data.options.filter((_, j) => j !== i),
                      })
                    }
                  >
                    <Trash2 className="size-3" />
                  </Button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => patch({ options: [...data.options, ""] })}
              className="inline-flex w-fit items-center gap-1 rounded-md border border-dashed border-foreground/20 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/40"
            >
              <Plus className="size-[11px]" />
              Agregar opción
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StepDestinations({ data, patch }: StepProps) {
  const isOrders = data.entity === "orders";
  return (
    <div>
      <p className="mb-4 mt-0 text-sm leading-relaxed text-muted-foreground">
        Tocá las superficies donde necesitás que aparezca. Vas a verlo
        renderizado en cada una.
      </p>

      <div className="flex flex-col gap-2.5">
        {isOrders && (
          <DestinationCard
            on={data.showInList}
            onToggle={() => patch({ showInList: !data.showInList })}
            Icon={TableIcon}
            title="Tabla de pedidos"
            sub="Como columna en /pedidos. Útil cuando lo necesitás ver de un vistazo."
            mini={
              <MiniTable label={data.label} type={data.fieldType ?? "text"} />
            }
          />
        )}
        <DestinationCard
          on={data.showInMobile}
          onToggle={() => patch({ showInMobile: !data.showInMobile })}
          Icon={Smartphone}
          title="App del conductor"
          sub={
            isOrders
              ? "El conductor lo lee como contexto al hacer la entrega."
              : "El conductor lo llena en la app."
          }
          mini={
            <MiniPhone
              label={data.label}
              type={data.fieldType ?? "text"}
              isInput={!isOrders}
            />
          }
        />
        {isOrders && (
          <DestinationCard
            on={data.showInCsv}
            onToggle={() => patch({ showInCsv: !data.showInCsv })}
            Icon={FileSpreadsheet}
            title="Importar / exportar CSV"
            sub="Columna en plantillas de carga masiva."
            mini={
              <MiniCsv label={data.label} type={data.fieldType ?? "text"} />
            }
          />
        )}
      </div>

      <div className="mt-4 flex items-center gap-2.5 rounded-md border border-foreground/15 p-3">
        <Switch
          checked={data.required}
          onCheckedChange={(v) => patch({ required: v })}
        />
        <div className="flex-1">
          <div className="text-[13px] font-medium">Hacerlo obligatorio</div>
          <div className="text-[11.5px] text-muted-foreground">
            {isOrders
              ? "Bloquea el guardado del pedido sin este dato."
              : "Bloquea el cierre de la entrega sin este dato."}
          </div>
        </div>
      </div>
      {data.required && isOrders && !data.showInCsv && (
        <div className="mt-2 flex gap-2 rounded-md bg-amber-50 px-3 py-2 text-[11.5px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertCircle className="mt-0.5 size-[13px] shrink-0" />
          <span>Sin CSV, las filas importadas evaden esta validación.</span>
        </div>
      )}
    </div>
  );
}

function DestinationCard({
  on,
  onToggle,
  Icon,
  title,
  sub,
  mini,
}: {
  on: boolean;
  onToggle: () => void;
  Icon: typeof TableIcon;
  title: string;
  sub: string;
  mini: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`grid grid-cols-[44px_1fr_180px] items-center gap-3.5 rounded-md p-3.5 text-left transition-colors ${
        on
          ? "border border-primary bg-primary/15"
          : "border border-foreground/15 bg-card hover:bg-muted/50"
      }`}
    >
      <span
        className={`inline-flex size-9 items-center justify-center rounded-md ${
          on
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        }`}
      >
        <Icon className="size-4" />
      </span>
      <div>
        <div className="flex items-center gap-2 text-[13.5px] font-semibold">
          {title}
          {on && <span className="size-2 rounded-full bg-primary" />}
        </div>
        <div className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
          {sub}
        </div>
      </div>
      <div className={on ? "opacity-100" : "opacity-40"}>{mini}</div>
    </button>
  );
}

function WizardPreview({ data, step }: { data: WizardData; step: number }) {
  const _TypeIcon = data.fieldType ? FIELD_TYPE_ICON[data.fieldType] : null;
  const isOrders = data.entity === "orders";

  return (
    <div className="flex flex-col gap-3.5 overflow-y-auto border-l border-border bg-muted/40 p-5">
      <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        Construyendo tu campo
      </div>

      {/* Mini flow visualization */}
      <div className="rounded-md border border-border bg-card p-3.5">
        <div className="flex items-center gap-1.5">
          <PreviewLane
            active={!!data.entity}
            tint={
              data.entity
                ? ENTITY_TINT[isOrders ? "orders" : "route_stops"]
                : null
            }
            Icon={data.entity ? (isOrders ? Users : Truck) : null}
            label={
              data.entity ? (isOrders ? "Tu equipo" : "Conductor") : "Origen…"
            }
          />
          <ChevronRight
            className={`size-3 text-muted-foreground ${
              data.entity ? "opacity-100" : "opacity-30"
            }`}
          />
          <PreviewLaneType
            active={!!data.fieldType}
            type={data.fieldType}
            label={
              data.label ||
              (data.fieldType ? FIELD_TYPE_LABELS[data.fieldType] : "Campo…")
            }
          />
          <ChevronRight
            className={`size-3 text-muted-foreground ${
              data.label ? "opacity-100" : "opacity-30"
            }`}
          />
          <div
            className={`flex flex-1 flex-col gap-0.5 transition-opacity ${
              step >= 3 ? "opacity-100" : "opacity-40"
            }`}
          >
            {isOrders && (
              <DestPill on={data.showInList} Icon={TableIcon} label="Tabla" />
            )}
            <DestPill on={data.showInMobile} Icon={Smartphone} label="App" />
            {isOrders && (
              <DestPill
                on={data.showInCsv}
                Icon={FileSpreadsheet}
                label="CSV"
              />
            )}
          </div>
        </div>
      </div>

      {/* Field renderer preview */}
      {data.label && data.fieldType && (
        <div>
          <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
            Cómo se ve al llenarlo
          </div>
          <div className="rounded-md border border-border bg-card p-3">
            <DynamicFieldRenderer
              definition={{
                id: "preview",
                companyId: "",
                entity: data.entity ?? "orders",
                code: labelToCode(data.label) || "preview",
                label: data.label,
                fieldType: data.fieldType,
                required: data.required,
                placeholder: data.placeholder || null,
                options:
                  data.fieldType === "select"
                    ? data.options.filter(Boolean)
                    : null,
                defaultValue: null,
                position: 0,
                showInList: data.showInList,
                showInMobile: data.showInMobile,
                showInCsv: data.showInCsv,
                validationRules: null,
                active: true,
                createdAt: "",
                updatedAt: "",
              }}
              value={null}
              onChange={() => {}}
            />
          </div>
        </div>
      )}

      <div className="mt-auto flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <span>💡</span>
        <span>
          Tu campo se va armando paso a paso. Podés volver a editarlo en
          cualquier momento después.
        </span>
      </div>
    </div>
  );
}

function PreviewLane({
  active,
  tint,
  Icon,
  label,
}: {
  active: boolean;
  tint: { bg: string; fg: string } | null;
  Icon: typeof Users | null;
  label: string;
}) {
  return (
    <div
      className={`flex-1 rounded-md px-1 py-2 text-center transition-all ${
        active && tint
          ? `${tint.bg} ${tint.fg}`
          : "bg-muted text-muted-foreground"
      } ${active ? "opacity-100" : "opacity-40"}`}
    >
      {active && Icon ? (
        <>
          <Icon className="mx-auto mb-1 size-4" />
          <div className="text-[10px] font-semibold">{label}</div>
        </>
      ) : (
        <div className="py-2 text-[10px]">{label}</div>
      )}
    </div>
  );
}

function PreviewLaneType({
  active,
  type,
  label,
}: {
  active: boolean;
  type: FieldType | null;
  label: string;
}) {
  const Icon = type ? FIELD_TYPE_ICON[type] : null;
  return (
    <div
      className={`flex-[1.4] rounded-md px-1 py-2 text-center transition-all ${
        active && type
          ? FIELD_TYPE_TINT[type]
          : "bg-muted text-muted-foreground"
      } ${active ? "opacity-100" : "opacity-40"}`}
    >
      {Icon ? (
        <Icon className="mx-auto mb-1 size-4" />
      ) : (
        <div className="h-4" />
      )}
      <div className="truncate text-[10px] font-semibold">{label}</div>
    </div>
  );
}

function DestPill({
  on,
  Icon,
  label,
}: {
  on: boolean;
  Icon: typeof TableIcon;
  label: string;
}) {
  return (
    <div
      className={`flex items-center justify-center gap-1 rounded px-1.5 py-0.5 text-[9px] ${
        on
          ? "border border-primary/50 bg-primary/15 text-accent-foreground"
          : "border border-dashed border-foreground/15 text-muted-foreground opacity-70"
      }`}
    >
      <Icon className="size-[9px]" />
      {label}
    </div>
  );
}
