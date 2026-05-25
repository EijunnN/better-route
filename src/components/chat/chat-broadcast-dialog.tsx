"use client";

import { AlertTriangle, Loader2, Megaphone, Send } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useMonitoring } from "@/components/monitoring/monitoring-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useChat } from "./chat-context";

const BROADCAST_MAX = 280;

/**
 * "Difusión" — send one message to every driver of the tenant.
 *
 * Deliberately distinct from the per-thread composer: a broadcast wakes
 * 200+ phones at once, so the UI surfaces the audience size up-front,
 * caps message length to keep the push fitting on a lock screen, and
 * requires an explicit click on a labelled CTA — not a hidden toggle.
 */
export function ChatBroadcastDialog() {
  const { state: monitoringState } = useMonitoring();
  const { state, actions } = useChat();
  const [body, setBody] = useState("");
  const [sentReached, setSentReached] = useState<number | null>(null);

  const driversCount = monitoringState.driversData.length;
  const remaining = BROADCAST_MAX - body.length;
  const overLimit = body.length > BROADCAST_MAX;

  useEffect(() => {
    if (!state.isBroadcastOpen) {
      // Reset both the draft and the success banner whenever the dialog
      // closes so the next open starts clean.
      setBody("");
      setSentReached(null);
    }
  }, [state.isBroadcastOpen]);

  const handleClose = () => {
    if (state.isBroadcasting) return;
    actions.closeBroadcast();
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (overLimit || body.trim().length === 0) return;
    const reached = await actions.sendBroadcast(body);
    if (reached !== null) {
      setSentReached(reached);
      setBody("");
    }
  };

  return (
    <Dialog
      open={state.isBroadcastOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent
        data-cockpit
        className="max-w-md p-0 gap-0 overflow-hidden border-border/60 bg-card"
      >
        <DialogHeader className="px-5 pt-5 pb-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <Megaphone className="size-4 text-[var(--cockpit-warn)]" />
            <DialogTitle className="text-base font-semibold tracking-tight">
              Difusión a toda la flota
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Llega como notificación push a{" "}
            <span className="cockpit-mono text-foreground font-medium">
              {driversCount}
            </span>{" "}
            conductor{driversCount === 1 ? "" : "es"} de esta empresa.
          </DialogDescription>
        </DialogHeader>

        {sentReached !== null ? (
          <div className="px-5 pb-5">
            <div className="border border-[var(--cockpit-live)]/40 bg-[var(--cockpit-live)]/5 rounded-md px-4 py-4 text-sm">
              <p className="font-medium text-[var(--cockpit-live)]">
                Difusión enviada
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Alcanzaste{" "}
                <span className="cockpit-mono text-foreground">
                  {sentReached}
                </span>{" "}
                conductor{sentReached === 1 ? "" : "es"} activo
                {sentReached === 1 ? "" : "s"}.
              </p>
            </div>
            <div className="flex justify-end mt-4">
              <Button variant="outline" size="sm" onClick={handleClose}>
                Cerrar
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-3">
            <div className="space-y-1.5">
              <span className="cockpit-label">Mensaje</span>
              <Textarea
                autoFocus
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Ej: Regresen a base, suspendemos operación por lluvia."
                rows={4}
                disabled={state.isBroadcasting}
                className="text-sm resize-none bg-background/60"
              />
              <div className="flex items-center justify-between text-[10px] cockpit-mono">
                <span
                  className={
                    overLimit ? "text-destructive" : "text-muted-foreground"
                  }
                >
                  {remaining} restantes
                </span>
                <span className="text-muted-foreground">
                  Recomendado &lt; {BROADCAST_MAX}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2 text-[11px] text-muted-foreground border border-amber-500/20 bg-amber-500/5 rounded-md px-3 py-2">
              <AlertTriangle className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
              <span>
                La difusión es <strong>irreversible</strong>: cada conductor la
                verá en su hilo y recibirá una notificación. Úsala solo para
                anuncios operativos.
              </span>
            </div>

            {state.broadcastError && (
              <p className="text-xs text-destructive">{state.broadcastError}</p>
            )}

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClose}
                disabled={state.isBroadcasting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={
                  state.isBroadcasting || body.trim().length === 0 || overLimit
                }
                className="gap-1.5"
              >
                {state.isBroadcasting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Enviando…
                  </>
                ) : (
                  <>
                    <Send className="size-3.5" />
                    Enviar a {driversCount}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
