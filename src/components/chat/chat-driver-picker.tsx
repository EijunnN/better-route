"use client";

import { MessageSquarePlus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useMonitoring } from "@/components/monitoring/monitoring-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useChat } from "./chat-context";

/**
 * "Nuevo mensaje" — pick a driver to start a conversation with.
 *
 * Reads the driver roster from MonitoringContext so we don't double-fetch
 * — the list and its live status are already loaded for the sidebar.
 * Filter by name OR plate (dispatchers know drivers by vehicle as often
 * as by name). LED tells presence at a glance; selecting jumps straight
 * into the thread.
 */
export function ChatDriverPicker() {
  const { state: monitoringState } = useMonitoring();
  const { state, actions } = useChat();
  const [query, setQuery] = useState("");

  const drivers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = monitoringState.driversData;
    if (!q) return all;
    return all.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.vehiclePlate?.toLowerCase().includes(q),
    );
  }, [monitoringState.driversData, query]);

  const handleClose = () => {
    actions.closePicker();
    setQuery("");
  };

  const handlePick = (driverId: string) => {
    actions.openConversationWithPanel(driverId);
    handleClose();
  };

  return (
    <Dialog
      open={state.isPickerOpen}
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
            <MessageSquarePlus className="size-4 text-[var(--cockpit-live)]" />
            <DialogTitle className="text-base font-semibold tracking-tight">
              Iniciar conversación
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Elige un conductor para abrir un hilo nuevo.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre o placa…"
              className="pl-8 h-9 text-sm bg-background/60"
            />
            {query && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 size-6"
                onClick={() => setQuery("")}
              >
                <X className="size-3" />
              </Button>
            )}
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto cockpit-scroll border-t border-border/60">
          {drivers.length === 0 ? (
            <div className="px-5 py-10 text-center text-xs text-muted-foreground">
              {monitoringState.driversData.length === 0
                ? "Sin conductores en esta empresa."
                : "Sin coincidencias."}
            </div>
          ) : (
            <ul className="cockpit-divide">
              {drivers.map((driver) => {
                const isOnline = driver.currentLocation?.isRecent ?? false;
                return (
                  <li key={driver.id}>
                    <button
                      type="button"
                      onClick={() => handlePick(driver.id)}
                      className={cn(
                        "w-full text-left flex items-center gap-3 px-5 py-3",
                        "hover:bg-muted/60 focus:bg-muted/60 focus:outline-none transition-colors",
                      )}
                    >
                      <span
                        role="img"
                        aria-label={isOnline ? "En línea" : "Sin señal"}
                        className="cockpit-led shrink-0"
                        data-status={isOnline ? undefined : "idle"}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">
                            {driver.name}
                          </span>
                          {driver.vehiclePlate && (
                            <span className="cockpit-mono text-[10px] text-muted-foreground px-1.5 py-0.5 border border-border/60 rounded">
                              {driver.vehiclePlate}
                            </span>
                          )}
                        </div>
                        <span className="cockpit-label">
                          {driver.fleetName || "—"}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
