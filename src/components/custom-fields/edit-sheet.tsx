"use client";

import {
  AlertCircle,
  FileSpreadsheet,
  Loader2,
  Smartphone,
  Table as TableIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  type FieldDefinition,
  type FieldDefinitionInput,
  useCustomFields,
} from "./custom-fields-context";
import { detectPolicyOverlap } from "./flow-tints";

interface EditSheetProps {
  open: boolean;
  field: FieldDefinition | null;
  onClose: () => void;
}

/**
 * Simpler single-panel edit form for existing fields. Editing is
 * deliberately less ambitious than the wizard — origin and field type
 * can't change once data is captured, so the form focuses on the
 * settings that actually flex: label, placeholder, visibility,
 * required.
 */
export function EditSheet({ open, field, onClose }: EditSheetProps) {
  const { actions } = useCustomFields();
  const [data, setData] = useState<FieldDefinition | null>(field);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setData(field);
  }, [field]);

  if (!data) return null;

  const dirty = JSON.stringify(data) !== JSON.stringify(field);
  const isOrders = data.entity === "orders";
  const overlap = detectPolicyOverlap(data.label);

  function patch(u: Partial<FieldDefinition>) {
    setData((d) => (d ? { ...d, ...u } : d));
  }

  async function save() {
    if (!data) return;
    setSubmitting(true);
    try {
      const payload: FieldDefinitionInput = {
        code: data.code,
        label: data.label,
        entity: data.entity,
        fieldType: data.fieldType,
        required: data.required,
        placeholder: data.placeholder ?? undefined,
        defaultValue: data.defaultValue ?? undefined,
        position: data.position,
        showInList: data.showInList,
        showInMobile: data.showInMobile,
        showInCsv: data.showInCsv,
        options: data.options ?? undefined,
      };
      await actions.updateDefinition(data.id, payload);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  const visibilityRows: Array<{
    key: "showInList" | "showInMobile" | "showInCsv";
    Icon: typeof TableIcon;
    label: string;
    orderOnly: boolean;
  }> = [
    {
      key: "showInList",
      Icon: TableIcon,
      label: "Tabla de pedidos",
      orderOnly: true,
    },
    {
      key: "showInMobile",
      Icon: Smartphone,
      label: "App del conductor",
      orderOnly: false,
    },
    {
      key: "showInCsv",
      Icon: FileSpreadsheet,
      label: "Importar / exportar CSV",
      orderOnly: true,
    },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100vh-60px)] max-w-[560px] overflow-y-auto p-0">
        <div className="p-5">
          <div className="mb-4">
            <div className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Editar campo
            </div>
            <h2 className="mt-0.5 text-[18px] font-semibold">{data.label}</h2>
          </div>

          <Label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
            Nombre
          </Label>
          <Input
            value={data.label}
            onChange={(e) => patch({ label: e.target.value })}
            className="mb-3.5"
          />
          {overlap && (
            <div className="mb-3.5 flex gap-2 rounded-md bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              <AlertCircle className="mt-0.5 size-[13px] shrink-0" />
              <span>
                <strong>"{overlap}"</strong> ya está cubierto por{" "}
                <strong>Política de entrega</strong>.{" "}
                <Link
                  href="/configuracion"
                  className="underline underline-offset-2"
                >
                  Ir a Política →
                </Link>
              </span>
            </div>
          )}

          <Label className="mb-1.5 flex items-baseline gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            Código interno
            <span className="text-[10px] font-normal normal-case tracking-normal opacity-70">
              (no editable)
            </span>
          </Label>
          <Input
            value={data.code}
            disabled
            className="mb-3.5 font-mono opacity-60"
          />

          <Label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
            Texto de ayuda
          </Label>
          <Input
            value={data.placeholder ?? ""}
            onChange={(e) => patch({ placeholder: e.target.value })}
            className="mb-3.5"
          />

          <Label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
            Dónde aparece
          </Label>
          <div className="mb-3.5 flex flex-col gap-1.5">
            {visibilityRows
              .filter((row) => !row.orderOnly || isOrders)
              .map((row) => {
                const checked = data[row.key];
                const inputId = `cf-edit-${row.key}`;
                return (
                  <div
                    key={row.key}
                    className={`flex items-center gap-2.5 rounded-md p-3 ${
                      checked
                        ? "border border-primary bg-primary/15"
                        : "border border-foreground/15 bg-card"
                    }`}
                  >
                    <Switch
                      id={inputId}
                      checked={checked}
                      onCheckedChange={(v) => patch({ [row.key]: v })}
                    />
                    <row.Icon
                      className={`size-3.5 ${
                        checked
                          ? "text-accent-foreground"
                          : "text-muted-foreground"
                      }`}
                    />
                    <label
                      htmlFor={inputId}
                      className="cursor-pointer text-[13px]"
                    >
                      {row.label}
                    </label>
                  </div>
                );
              })}
          </div>

          <div className="mb-4 flex items-center gap-2.5 rounded-md border border-foreground/15 p-3">
            <Switch
              id="cf-edit-required"
              checked={data.required}
              onCheckedChange={(v) => patch({ required: v })}
            />
            <label htmlFor="cf-edit-required" className="flex-1 cursor-pointer">
              <div className="text-[13px] font-medium">Obligatorio</div>
              <div className="text-[11px] text-muted-foreground">
                {isOrders
                  ? "Bloquea el guardado del pedido"
                  : "Bloquea el cierre de la entrega"}
              </div>
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={!dirty || submitting}>
              {submitting && <Loader2 className="size-3.5 animate-spin" />}
              Guardar cambios
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
