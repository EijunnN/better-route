"use client";

import { Headphones, ChevronRight } from "lucide-react";

interface TrackingHelpProps {
  supportUrl?: string | null;
  brandColor?: string | null;
}

export function TrackingHelp({ supportUrl, brandColor }: TrackingHelpProps) {
  const accent = brandColor ?? "#4AB855";
  const href = supportUrl ?? "mailto:soporte@betterroute.io";

  return (
    <section
      className="rounded-2xl border border-border/60 p-5"
      style={{
        background: `linear-gradient(140deg, ${accent}1A 0%, transparent 70%)`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${accent}26`, color: accent }}
        >
          <Headphones className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <p className="font-semibold">¿Necesitás ayuda?</p>
          <p className="text-xs text-muted-foreground">
            Nuestro equipo está disponible 24/7 para ayudarte.
          </p>
        </div>
      </div>
      <a
        href={href}
        className="mt-4 flex items-center justify-center gap-1 rounded-full border border-border/80 bg-background/60 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-background"
      >
        Contactar soporte
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </a>
    </section>
  );
}
