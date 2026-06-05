"use client";

import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Loader2,
  PauseCircle,
  RotateCcw,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

export interface PreviewBucketRow {
  row: number;
  trackingId: string;
  parsed: Record<string, unknown>;
}

export interface PreviewReactivableRow extends PreviewBucketRow {
  existingOrderId: string;
}

export interface PreviewSkippedActiveRow extends PreviewBucketRow {
  existingOrderId: string;
  currentStatus: string;
}

export interface PreviewSkippedCancelledRow extends PreviewBucketRow {
  existingOrderId: string;
}

export interface PreviewInvalidRow {
  row: number;
  trackingId: string | null;
  errors: Array<{ field: string; message: string }>;
}

export interface CsvImportPreview {
  previewId: string;
  totalRows: number;
  new: PreviewBucketRow[];
  reactivable: PreviewReactivableRow[];
  skippedActive: PreviewSkippedActiveRow[];
  skippedCancelled: PreviewSkippedCancelledRow[];
  invalid: PreviewInvalidRow[];
  expiresAt: string;
}

export interface ConfirmResultData {
  inserted: number;
  reactivated: number;
  failed?: number;
  errors?: string[];
  raceConditions: Array<{
    existingOrderId: string;
    trackingId: string;
    actualStatus: string;
  }>;
}

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: CsvImportPreview | null;
  onConfirm: (input: {
    previewId: string;
    reactivableSelections: string[];
  }) => Promise<ConfirmResultData | null>;
  /** Reset everything (close, drop preview); used after success/cancel. */
  onDone: () => void;
}

/**
 * Phase-2 review screen for the CSV preview-and-confirm flow (issue 006).
 * Shows the 4 buckets returned by the preview endpoint and lets the
 * operator deselect specific reactivables before confirming.
 */
export function CsvImportPreviewDialog({
  open,
  onOpenChange,
  preview,
  onConfirm,
  onDone,
}: DialogProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("new");
  const [reactivableSelected, setReactivableSelected] = useState<Set<string>>(
    () => new Set(),
  );

  // When a fresh preview lands, default-select every reactivable.
  useEffect(() => {
    if (preview) {
      setReactivableSelected(
        new Set(preview.reactivable.map((r) => r.existingOrderId)),
      );
    }
  }, [preview]);

  if (!preview) return null;

  const newCount = preview.new.length;
  const reactivableCount = preview.reactivable.length;
  const reactivableActiveCount = reactivableSelected.size;
  const skippedActiveCount = preview.skippedActive.length;
  const skippedCancelledCount = preview.skippedCancelled.length;
  const invalidCount = preview.invalid.length;
  const willApply = newCount + reactivableActiveCount;

  const toggleReactivable = (existingOrderId: string) => {
    setReactivableSelected((prev) => {
      const next = new Set(prev);
      if (next.has(existingOrderId)) next.delete(existingOrderId);
      else next.add(existingOrderId);
      return next;
    });
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const result = await onConfirm({
        previewId: preview.previewId,
        reactivableSelections: Array.from(reactivableSelected),
      });
      if (result) {
        const parts: string[] = [];
        if (result.inserted > 0)
          parts.push(`${result.inserted} pedidos creados`);
        if (result.reactivated > 0)
          parts.push(`${result.reactivated} reactivados`);
        if (result.raceConditions.length > 0)
          parts.push(
            `${result.raceConditions.length} omitidos por cambios concurrentes`,
          );
        const hadFailures = (result.failed ?? 0) > 0;
        if (hadFailures) parts.push(`${result.failed} fallaron`);
        toast({
          title: hadFailures
            ? "Importación aplicada parcialmente"
            : "Importación aplicada",
          description: hadFailures
            ? `${parts.join(" · ")}${result.errors?.[0] ? ` — ${result.errors[0]}` : ""}`
            : parts.join(" · ") || "Sin cambios",
          variant: hadFailures ? "destructive" : undefined,
        });
        onDone();
      }
    } catch (err) {
      toast({
        title: "Error al confirmar",
        description: err instanceof Error ? err.message : "Error inesperado",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle>Vista previa de importación CSV</DialogTitle>
          <DialogDescription>
            Revisa la clasificación antes de confirmar. Se aplicarán{" "}
            <strong>{willApply}</strong> de <strong>{preview.totalRows}</strong>{" "}
            filas ({newCount} nuevas + {reactivableActiveCount} reactivaciones
            seleccionadas).
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 overflow-hidden"
        >
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="new">
              <CheckCircle2 className="mr-1 size-3.5" /> Nuevas{" "}
              {badge(newCount)}
            </TabsTrigger>
            <TabsTrigger value="reactivable">
              <RotateCcw className="mr-1 size-3.5" /> Reactivables{" "}
              {badge(reactivableCount)}
            </TabsTrigger>
            <TabsTrigger value="skippedActive">
              <PauseCircle className="mr-1 size-3.5" /> Activas{" "}
              {badge(skippedActiveCount)}
            </TabsTrigger>
            <TabsTrigger value="skippedCancelled">
              <Ban className="mr-1 size-3.5" /> Canceladas{" "}
              {badge(skippedCancelledCount)}
            </TabsTrigger>
            <TabsTrigger value="invalid">
              <AlertTriangle className="mr-1 size-3.5" /> Inválidas{" "}
              {badge(invalidCount)}
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="mt-3 h-[380px] rounded-md border">
            <TabsContent value="new" className="m-0 p-3">
              <Description text="Pedidos nuevos. Se insertarán al confirmar." />
              <BucketTable rows={preview.new} />
            </TabsContent>

            <TabsContent value="reactivable" className="m-0 p-3">
              <Description text="Pedidos en estado FAILED que pueden reactivarse. Desmarca los que NO quieres aplicar. Los campos del CSV reemplazarán a los del pedido existente." />
              <ReactivableTable
                rows={preview.reactivable}
                selected={reactivableSelected}
                onToggle={toggleReactivable}
              />
            </TabsContent>

            <TabsContent value="skippedActive" className="m-0 p-3">
              <Description text="Pedidos ya activos en el sistema (PENDING, ASSIGNED, IN_PROGRESS o COMPLETED). Se omiten para no pisar trabajo en curso." />
              <SkippedActiveTable rows={preview.skippedActive} />
            </TabsContent>

            <TabsContent value="skippedCancelled" className="m-0 p-3">
              <Description text="Pedidos cancelados definitivamente. CANCELLED es terminal y no puede reactivarse desde ningún flujo. Si necesitas volver a entregarlo, usa un trackingId nuevo." />
              <BucketTable rows={preview.skippedCancelled} />
            </TabsContent>

            <TabsContent value="invalid" className="m-0 p-3">
              <Description text="Filas con errores de validación. No se aplicarán hasta que las corrijas en el CSV y vuelvas a subir." />
              <InvalidTable rows={preview.invalid} />
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onDone} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={submitting || willApply === 0}
          >
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Confirmar y aplicar ({willApply})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function badge(count: number) {
  return (
    <Badge variant="outline" className="ml-1 px-1.5 text-[10px]">
      {count}
    </Badge>
  );
}

function Description({ text }: { text: string }) {
  return <p className="mb-3 text-xs text-muted-foreground">{text}</p>;
}

function BucketTable({ rows }: { rows: PreviewBucketRow[] }) {
  if (rows.length === 0) return <Empty />;
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-muted-foreground">
        <tr>
          <Th>Fila</Th>
          <Th>Tracking ID</Th>
          <Th>Dirección</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.row}-${r.trackingId}`} className="border-t">
            <Td>{r.row}</Td>
            <Td className="font-mono text-xs">{r.trackingId}</Td>
            <Td className="truncate max-w-xs">
              {String(r.parsed.address ?? "—")}
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReactivableTable({
  rows,
  selected,
  onToggle,
}: {
  rows: PreviewReactivableRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (rows.length === 0) return <Empty />;
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-muted-foreground">
        <tr>
          <Th className="w-[60px]">Aplicar</Th>
          <Th>Fila</Th>
          <Th>Tracking ID</Th>
          <Th>Dirección (CSV)</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const isSelected = selected.has(r.existingOrderId);
          return (
            <tr key={r.existingOrderId} className="border-t">
              <Td>
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggle(r.existingOrderId)}
                  aria-label={`Aplicar ${r.trackingId}`}
                />
              </Td>
              <Td>{r.row}</Td>
              <Td className="font-mono text-xs">{r.trackingId}</Td>
              <Td className="truncate max-w-xs">
                {String(r.parsed.address ?? "—")}
              </Td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SkippedActiveTable({ rows }: { rows: PreviewSkippedActiveRow[] }) {
  if (rows.length === 0) return <Empty />;
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-muted-foreground">
        <tr>
          <Th>Fila</Th>
          <Th>Tracking ID</Th>
          <Th>Estado actual</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.existingOrderId} className="border-t">
            <Td>{r.row}</Td>
            <Td className="font-mono text-xs">{r.trackingId}</Td>
            <Td>
              <Badge variant="outline" className="text-[10px]">
                {r.currentStatus}
              </Badge>
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function InvalidTable({ rows }: { rows: PreviewInvalidRow[] }) {
  if (rows.length === 0) return <Empty />;
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-muted-foreground">
        <tr>
          <Th>Fila</Th>
          <Th>Tracking ID</Th>
          <Th>Errores</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.row} className="border-t align-top">
            <Td>{r.row}</Td>
            <Td className="font-mono text-xs">{r.trackingId ?? "—"}</Td>
            <Td className="space-y-0.5">
              {r.errors.map((e) => (
                <div
                  key={`${e.field}-${e.message}`}
                  className="text-xs text-destructive"
                >
                  <span className="font-medium">{e.field}:</span> {e.message}
                </div>
              ))}
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`px-3 py-2 text-left font-medium ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}

function Empty() {
  return (
    <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
      Sin filas en este bucket.
    </div>
  );
}
