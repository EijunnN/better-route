"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ImageOff, MapPin, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DELIVERY_FAILURE_LABELS } from "@/db/schema";
import { cn } from "@/lib/utils";

export interface VisitRow {
  id: string;
  orderId: string;
  routeStopId: string;
  driverId: string;
  driverName: string | null;
  planId: string | null;
  attemptedAt: string;
  completedAt: string;
  outcome: "SUCCESS" | "FAILURE";
  failureReason: keyof typeof DELIVERY_FAILURE_LABELS | null;
  notes: string | null;
  evidenceUrls: string[] | null;
  intendedAddress: string;
  intendedLatitude: string;
  intendedLongitude: string;
  gpsLatitude: string | null;
  gpsLongitude: string | null;
  createdAt: string;
}

const dateTimeFormatter = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDateTime(value: string): string {
  return dateTimeFormatter.format(new Date(value));
}

/**
 * Chronological list of physical delivery attempts on an Order.
 *
 * Loads from `GET /api/orders/:id/visits` (issue 002) and renders one
 * card per Visit with: outcome, driver, timestamp, attempt number,
 * failure reason (if any), evidence thumbnails, intended address.
 */
export function VisitTimeline({
  orderId,
  companyId,
}: {
  orderId: string;
  companyId: string | null;
}) {
  const [visits, setVisits] = useState<VisitRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}/visits`, {
          headers: { "x-company-id": companyId },
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = (await res.json()) as { data: VisitRow[] };
        if (!cancelled) setVisits(json.data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Error al cargar intentos",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, companyId]);

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        No se pudo cargar el historial de intentos: {error}
      </div>
    );
  }

  if (visits === null) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        Cargando intentos…
      </div>
    );
  }

  if (visits.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        Sin intentos registrados.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visits.map((v, idx) => (
        <VisitCard
          key={v.id}
          visit={v}
          attemptNumber={idx + 1}
          onOpenImage={setLightbox}
        />
      ))}
      {lightbox && (
        <button
          type="button"
          aria-label="Cerrar imagen"
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
        >
          <img
            src={lightbox}
            alt="Evidencia"
            className="max-h-full max-w-full rounded shadow-2xl"
          />
        </button>
      )}
    </div>
  );
}

function VisitCard({
  visit,
  attemptNumber,
  onOpenImage,
}: {
  visit: VisitRow;
  attemptNumber: number;
  onOpenImage: (url: string) => void;
}) {
  const isSuccess = visit.outcome === "SUCCESS";
  return (
    <div
      className={cn(
        "rounded-lg border p-4 shadow-sm",
        isSuccess
          ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20"
          : "border-rose-200 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-950/20",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {isSuccess ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <XCircle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
          )}
          <div>
            <div className="font-medium">
              {isSuccess ? "Entregado" : "Entrega fallida"}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatDateTime(visit.completedAt)}
              {visit.driverName ? ` · ${visit.driverName}` : ""}
            </div>
          </div>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">
          Intento #{attemptNumber}
        </Badge>
      </div>

      {!isSuccess && visit.failureReason && (
        <div className="mt-3 text-sm">
          <span className="font-medium">Motivo: </span>
          {DELIVERY_FAILURE_LABELS[visit.failureReason]}
        </div>
      )}

      {visit.notes && (
        <div className="mt-2 text-sm text-muted-foreground">{visit.notes}</div>
      )}

      <div className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className="break-words">{visit.intendedAddress}</span>
      </div>

      {visit.evidenceUrls && visit.evidenceUrls.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {visit.evidenceUrls.map((url) => (
            <button
              key={url}
              type="button"
              onClick={() => onOpenImage(url)}
              className="block h-16 w-16 overflow-hidden rounded border bg-muted transition hover:border-foreground"
              title="Ver evidencia"
            >
              <img
                src={url}
                alt="Evidencia"
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : (
        !isSuccess && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ImageOff className="h-3.5 w-3.5" />
            Sin evidencia adjunta
          </div>
        )
      )}
    </div>
  );
}
