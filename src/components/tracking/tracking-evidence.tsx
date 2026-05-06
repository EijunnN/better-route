"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

interface TrackingEvidenceProps {
  evidenceUrls: string[];
  completedAt?: string | null;
  notes?: string | null;
}

export function TrackingEvidence({
  evidenceUrls,
  completedAt,
  notes,
}: TrackingEvidenceProps) {
  const [open, setOpen] = useState(true);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (evidenceUrls.length === 0 && !notes) return null;

  return (
    <section className="rounded-2xl border border-border/60 bg-card/80">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 p-5 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">Evidencia de entrega</h3>
          {evidenceUrls.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {evidenceUrls.length}
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="space-y-3 px-5 pb-5">
          {completedAt && (
            <p className="text-xs text-muted-foreground">
              Entregado: {formatTimestamp(completedAt)}
            </p>
          )}

          {evidenceUrls.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {evidenceUrls.map((url, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveIndex(idx)}
                  className="block aspect-square overflow-hidden rounded-lg border border-border/60 transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                  aria-label={`Ver evidencia ${idx + 1}`}
                >
                  <img
                    src={url}
                    alt={`Evidencia ${idx + 1}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}

          {notes && (
            <div className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
              {notes}
            </div>
          )}
        </div>
      )}

      {activeIndex !== null && (
        <EvidenceLightbox
          urls={evidenceUrls}
          initialIndex={activeIndex}
          onClose={() => setActiveIndex(null)}
        />
      )}
    </section>
  );
}

interface EvidenceLightboxProps {
  urls: string[];
  initialIndex: number;
  onClose: () => void;
}

function EvidenceLightbox({
  urls,
  initialIndex,
  onClose,
}: EvidenceLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const total = urls.length;
  const hasMultiple = total > 1;

  const next = useCallback(
    () => setIndex((i) => (i + 1) % total),
    [total],
  );
  const prev = useCallback(
    () => setIndex((i) => (i - 1 + total) % total),
    [total],
  );

  // Arrow-key navigation. The Radix Dialog focuses the close button on
  // open, so listening at the document level works without stealing
  // input from the modal itself.
  useEffect(() => {
    if (!hasMultiple) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [hasMultiple, next, prev]);

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/90 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 p-4 outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 sm:p-8"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">
            Evidencia de entrega
          </DialogPrimitive.Title>

          {/* Image stage. The close button + arrows live anchored to
              this wrapper so they sit on the image edge instead of the
              far viewport corner. */}
          <div className="relative flex max-h-[80vh] w-full max-w-5xl items-center justify-center">
            <img
              key={urls[index]}
              src={urls[index]}
              alt={`Evidencia ${index + 1} de ${total}`}
              className="max-h-[80vh] max-w-full rounded-xl object-contain"
            />

            <DialogPrimitive.Close
              className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white/50"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>

            {hasMultiple && (
              <>
                <button
                  type="button"
                  onClick={prev}
                  aria-label="Anterior"
                  className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={next}
                  aria-label="Siguiente"
                  className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>

          {hasMultiple && (
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm text-white/80 tabular-nums">
                {index + 1} / {total}
              </p>
              <div className="flex items-center gap-2">
                {urls.map((url, i) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`Ver evidencia ${i + 1}`}
                    className={cn(
                      "h-12 w-12 overflow-hidden rounded-md border-2 transition-all",
                      i === index
                        ? "border-white opacity-100"
                        : "border-transparent opacity-50 hover:opacity-80",
                    )}
                  >
                    <img
                      src={url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("es-PE", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
