"use client";

import type { FieldType } from "./custom-fields-context";
import { labelToCode, sampleValueShort } from "./flow-tints";

/**
 * Tiny previews of how a custom field looks in each surface (table,
 * mobile, CSV). Used inside the creation wizard's destinations step so
 * users see the real impact of each toggle instead of memorizing what
 * `showInList` does.
 */

interface MiniProps {
  label: string;
  type: FieldType;
}

export function MiniTable({ label, type }: MiniProps) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card text-[10px]">
      <div className="bg-muted px-2 py-1 text-[9px] text-muted-foreground">
        /pedidos
      </div>
      <div className="grid grid-cols-[1fr_1.2fr] border-t border-border">
        <div className="border-r border-border px-1.5 py-1 text-[9px] font-medium text-muted-foreground">
          Pedido
        </div>
        <div className="bg-primary/15 px-1.5 py-1 text-[9px] font-semibold text-accent-foreground">
          {label || "—"}
        </div>
      </div>
      <div className="grid grid-cols-[1fr_1.2fr] border-t border-border">
        <div className="border-r border-border px-1.5 py-1">#9821</div>
        <div className="bg-primary/5 px-1.5 py-1">{sampleValueShort(type)}</div>
      </div>
    </div>
  );
}

export function MiniPhone({
  label,
  type,
  isInput,
}: MiniProps & { isInput: boolean }) {
  return (
    <div className="rounded-[10px] border-[3px] border-[#0c0d12] bg-[#1a1c25] p-2 text-[9px] leading-tight text-white">
      <div className="mb-1 text-[8px] opacity-50">
        {isInput ? "Cerrar entrega" : "Contexto"}
      </div>
      <div className="text-[8px] opacity-80">{label || "—"}</div>
      <div className="mt-1 rounded bg-[#23262f] px-1.5 py-0.5 text-[9px] text-gray-400">
        {isInput ? "Llenar…" : sampleValueShort(type)}
      </div>
    </div>
  );
}

export function MiniCsv({ label, type }: MiniProps) {
  const code = labelToCode(label) || "campo";
  return (
    <div className="rounded-md border border-border bg-card p-2 font-mono text-[9.5px]">
      <div className="mb-1 font-sans text-[9px] text-muted-foreground">
        pedidos.csv
      </div>
      <div>
        <span className="text-muted-foreground">direccion,</span>
        <span className="rounded-sm bg-primary/15 px-0.5 text-accent-foreground">
          {code}
        </span>
      </div>
      <div className="text-muted-foreground">
        Lavalle 456,
        <span className="text-foreground">{sampleValueShort(type)}</span>
      </div>
    </div>
  );
}
