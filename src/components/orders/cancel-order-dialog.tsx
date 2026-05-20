"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ORDER_CANCELLATION_CATEGORIES } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";

const CATEGORY_LABELS: Record<
  keyof typeof ORDER_CANCELLATION_CATEGORIES,
  string
> = {
  customer_request: "Solicitud del cliente",
  unable_to_deliver: "Imposible entregar",
  product_not_available: "Producto no disponible",
  address_invalid: "Dirección inválida",
  other: "Otro motivo",
};

export interface CancelOrderPayload {
  reasonCategory: keyof typeof ORDER_CANCELLATION_CATEGORIES;
  reasonNote: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: CancelOrderPayload) => Promise<void>;
}

/**
 * Destructive modal for definitive Order cancellation (issue 005).
 * CANCELLED is terminal — copy is intentionally heavy on the
 * irreversibility so operators don't pick this when they meant to
 * reactivate (issue 004).
 */
export function CancelOrderDialog({ open, onOpenChange, onConfirm }: Props) {
  const { toast } = useToast();
  const [category, setCategory] = useState<
    keyof typeof ORDER_CANCELLATION_CATEGORIES | ""
  >("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = category !== "" && note.trim().length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onConfirm({
        reasonCategory: category as keyof typeof ORDER_CANCELLATION_CATEGORIES,
        reasonNote: note.trim(),
      });
      onOpenChange(false);
      setCategory("");
      setNote("");
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo cancelar",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive">
            Cancelar definitivamente
          </DialogTitle>
          <DialogDescription>
            Esta acción es irreversible. El pedido no podrá reactivarse desde
            ningún flujo. Si el cliente vuelve a pedir, será un pedido nuevo con
            otro tracking ID.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cancel-category">
              Categoría <span className="text-destructive">*</span>
            </Label>
            <Select
              value={category}
              onValueChange={(v) =>
                setCategory(v as keyof typeof ORDER_CANCELLATION_CATEGORIES)
              }
            >
              <SelectTrigger id="cancel-category">
                <SelectValue placeholder="Selecciona una categoría" />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.keys(ORDER_CANCELLATION_CATEGORIES) as Array<
                    keyof typeof ORDER_CANCELLATION_CATEGORIES
                  >
                ).map((key) => (
                  <SelectItem key={key} value={key}>
                    {CATEGORY_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cancel-note">
              Nota <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="cancel-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Detalle del motivo (auditoría)"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Volver
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Confirmar cancelación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
