"use client";

import { ChevronRight, Headphones } from "lucide-react";
import { DEFAULT_BRAND_ACCENT } from "./constants";

interface TrackingHelpProps {
  supportUrl?: string | null;
  brandColor?: string | null;
}

export function TrackingHelp({ supportUrl, brandColor }: TrackingHelpProps) {
  const accent = brandColor ?? DEFAULT_BRAND_ACCENT;
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
          className="flex size-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${accent}26`, color: accent }}
        >
          <Headphones className="size-5" />
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
        <ChevronRight className="size-4 text-muted-foreground" />
      </a>
    </section>
  );
}
