"use client";

import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrackingHeroProps {
  status: string;
  lastUpdate?: string | null;
  brandColor?: string | null;
}

const HERO_COPY: Record<string, { title: string; pill: string; tone: "info" | "live" | "danger" | "muted" }> = {
  PENDING: { title: "Tu pedido está confirmado", pill: "Pendiente", tone: "muted" },
  ASSIGNED: { title: "Tu pedido fue asignado", pill: "Asignado", tone: "info" },
  IN_PROGRESS: { title: "Tu pedido está en camino", pill: "En camino", tone: "live" },
  COMPLETED: { title: "Tu pedido fue entregado", pill: "Entregado", tone: "live" },
  FAILED: { title: "Hubo un problema con tu entrega", pill: "Fallido", tone: "danger" },
  CANCELLED: { title: "Tu pedido fue cancelado", pill: "Cancelado", tone: "muted" },
};

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString("es-PE", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  if (sameDay) return `hoy, ${time}`;
  const day = d.toLocaleDateString("es-PE", { day: "numeric", month: "short" });
  return `${day}, ${time}`;
}

export function TrackingHero({
  status,
  lastUpdate,
  brandColor,
}: TrackingHeroProps) {
  const copy = HERO_COPY[status] ?? {
    title: "Seguimiento de tu pedido",
    pill: status,
    tone: "muted" as const,
  };
  const isLive = copy.tone === "live";
  const accent = brandColor ?? "#4AB855";

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm">
      {/* Soft brand-tinted ambient glow on the right side, suggesting
          motion without competing with the live map below. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-25 blur-3xl"
        style={{ backgroundColor: accent }}
      />
      <div className="relative flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-4 min-w-0">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
            style={{
              backgroundColor: `${accent}26`,
              color: accent,
            }}
          >
            <Package className="h-6 w-6" />
          </div>
          <div className="min-w-0 space-y-1">
            <h2 className="text-xl font-semibold leading-tight sm:text-2xl">
              {copy.title}
            </h2>
            {lastUpdate && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
                <span>Última actualización: {formatRelative(lastUpdate)}</span>
                {isLive && (
                  <span
                    className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
                    style={{ backgroundColor: accent }}
                  />
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Estado actual
          </span>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              copy.tone === "danger" &&
                "bg-destructive/15 text-destructive",
              copy.tone === "muted" &&
                "bg-muted text-muted-foreground",
              copy.tone === "info" && "bg-blue-500/15 text-blue-400",
            )}
            style={
              isLive
                ? {
                    backgroundColor: `${accent}26`,
                    color: accent,
                  }
                : undefined
            }
          >
            {copy.pill}
          </span>
        </div>
      </div>
    </section>
  );
}
