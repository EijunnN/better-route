"use client";

import {
  Archive,
  Calendar,
  DollarSign,
  Edit,
  Eye,
  FileSpreadsheet,
  Hash,
  List,
  Lock,
  Mail,
  Phone,
  Smartphone,
  Table as TableIcon,
  ToggleLeft,
  Truck,
  Type,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FIELD_TYPE_LABELS,
  type FieldDefinition,
  type FieldType,
} from "./custom-fields-context";
import { ENTITY_TINT, FIELD_TYPE_TINT } from "./flow-tints";

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

interface DestinationDescriptor {
  key: "showInList" | "showInMobile" | "showInCsv";
  Icon: typeof Eye;
  label: string;
  role: "view" | "write";
  tip: string;
  on: boolean;
  applies: boolean;
}

interface FlowRowProps {
  field: FieldDefinition;
  isLast: boolean;
  showCode: boolean;
  onEdit: () => void;
  onArchive: () => void;
}

/**
 * One row of the "Flujo del dato" dashboard:
 *
 *   [QUIÉN ESCRIBE]  ─→  [EL CAMPO]  ─→  [DÓNDE APARECE]
 *
 * Three lanes laid out on a single grid so columns line up across all
 * rows. The connector arrows are pure SVG so they scale with row
 * height and inherit the muted border colour.
 */
export function FlowRow({
  field,
  isLast,
  showCode,
  onEdit,
  onArchive,
}: FlowRowProps) {
  const isOrders = field.entity === "orders";
  const TypeIcon = FIELD_TYPE_ICON[field.fieldType];
  const OriginIcon = isOrders ? Users : Truck;
  const originTint = ENTITY_TINT[isOrders ? "orders" : "route_stops"];

  // Each destination is annotated with the role it plays for *this*
  // field. orders → driver reads (view). route_stops → driver fills
  // (write). The badge below the icon drives the read/write visual
  // language the user explicitly asked for.
  const destinations: DestinationDescriptor[] = (
    [
      {
        key: "showInList" as const,
        Icon: TableIcon,
        label: "Tabla de pedidos",
        role: "view" as const,
        tip: "Aparece como columna en /pedidos",
        on: field.showInList && isOrders,
        applies: isOrders,
      },
      {
        key: "showInMobile" as const,
        Icon: Smartphone,
        label: "App del conductor",
        role: (isOrders ? "view" : "write") as "view" | "write",
        tip: isOrders
          ? "El conductor lo lee como contexto"
          : "El conductor lo llena al cerrar la entrega",
        on: field.showInMobile,
        applies: true,
      },
      {
        key: "showInCsv" as const,
        Icon: FileSpreadsheet,
        label: "Importar / Exportar CSV",
        role: "view" as const,
        tip: "Columna en plantillas de carga masiva",
        on: field.showInCsv && isOrders,
        applies: isOrders,
      },
    ] satisfies DestinationDescriptor[]
  ).filter((d) => d.applies);

  return (
    <button
      type="button"
      onClick={onEdit}
      className={`relative grid w-full grid-cols-[200px_1fr_240px] items-center gap-8 px-6 py-[18px] text-left transition-colors hover:bg-muted/50 ${
        isLast ? "" : "border-b border-border"
      }`}
    >
      {/* Lane 1 — Origin */}
      <div className="flex items-center gap-2.5">
        <span
          className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg ${originTint.bg} ${originTint.fg}`}
        >
          <OriginIcon className="size-[17px]" />
        </span>
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold">{originTint.label}</div>
          <div className="text-[10.5px] text-muted-foreground">
            {originTint.sublabel}
          </div>
        </div>
      </div>

      {/* Lane 2 — Field */}
      <div className="relative flex items-center gap-3">
        <FlowArrow side="left" />
        <span
          className={`inline-flex size-8 shrink-0 items-center justify-center rounded-md ${FIELD_TYPE_TINT[field.fieldType]}`}
        >
          <TypeIcon className="size-[15px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold tracking-tight">
              {field.label}
            </span>
            {field.required && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-px text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                <Lock className="size-[9px]" />
                Obligatorio
              </span>
            )}
          </div>
          <div className="mt-0.5 flex gap-2 text-[11px] text-muted-foreground">
            <span>{FIELD_TYPE_LABELS[field.fieldType]}</span>
            {showCode && (
              <>
                <span>·</span>
                <span className="font-mono">{field.code}</span>
              </>
            )}
            {field.options && (
              <>
                <span>·</span>
                <span>{field.options.length} opciones</span>
              </>
            )}
          </div>
        </div>
        <FlowArrow side="right" />
      </div>

      {/* Lane 3 — Destinations */}
      <div className="flex items-center justify-start gap-2">
        {destinations.map((d) => (
          <DestinationIcon key={d.key} dest={d} />
        ))}
        <div className="ml-auto flex gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="size-7 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            title="Editar"
          >
            <Edit className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="size-7 p-0 text-muted-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onArchive();
            }}
            title="Archivar"
          >
            <Archive className="size-3" />
          </Button>
        </div>
      </div>
    </button>
  );
}

/**
 * Dashed arrow between lanes. Pure SVG so it stays sharp at any zoom
 * and inherits the muted border colour.
 */
function FlowArrow({ side }: { side: "left" | "right" }) {
  return (
    <svg
      width="20"
      height="40"
      aria-hidden
      className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-foreground/15 ${
        side === "left" ? "-left-[26px]" : "-right-[26px]"
      }`}
    >
      <title>flujo</title>
      <path
        d="M0 20 L 20 20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 3"
        fill="none"
      />
      <path
        d="M14 14 L 20 20 L 14 26"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  );
}

/**
 * Destination chip with role badge — the visual that disambiguates
 * "the driver READS this" vs "the driver FILLS this". A pencil badge
 * marks `write` (only the App icon for route_stops fields); an eye
 * badge marks `view` (Tabla, CSV, and App for orders fields).
 */
function DestinationIcon({ dest }: { dest: DestinationDescriptor }) {
  const disabled = !dest.on;
  const RoleBadgeIcon = dest.role === "write" ? Edit : Eye;
  const tooltipText = disabled
    ? `${dest.label} — Sin destino activo`
    : `${dest.label} — ${dest.tip}`;

  return (
    <span
      title={tooltipText}
      className={`relative inline-flex size-[38px] items-center justify-center rounded-lg border ${
        disabled
          ? "border-dashed border-foreground/15 text-muted-foreground/50"
          : "border-primary/40 bg-primary/15 text-accent-foreground"
      }`}
    >
      <dest.Icon className="size-[15px]" />
      {!disabled && (
        <span
          className={`absolute -right-[5px] -bottom-[5px] inline-flex size-4 items-center justify-center rounded-full border ${
            dest.role === "write"
              ? "border-amber-700/40 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
              : "border-foreground/15 bg-card text-muted-foreground"
          }`}
          title={dest.role === "write" ? "Se llena aquí" : "Solo lectura"}
        >
          <RoleBadgeIcon className="size-2" />
        </span>
      )}
    </span>
  );
}
