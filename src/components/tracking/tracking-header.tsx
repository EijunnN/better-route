"use client";

import { DEFAULT_BRAND_ACCENT } from "./constants";

interface TrackingHeaderProps {
  companyName: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  customMessage?: string | null;
}

export function TrackingHeader({
  companyName,
  logoUrl,
  brandColor,
  customMessage,
}: TrackingHeaderProps) {
  return (
    <header className="border-b border-border/60 bg-card/40 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 p-4 sm:px-6">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={companyName}
            className="size-9 rounded-lg object-contain"
          />
        ) : (
          <div
            className="flex size-9 items-center justify-center rounded-lg text-sm font-bold text-white"
            style={{ backgroundColor: brandColor ?? DEFAULT_BRAND_ACCENT }}
          >
            {companyName.charAt(0).toUpperCase()}
          </div>
        )}
        <h1
          className="text-lg font-semibold"
          style={brandColor ? { color: brandColor } : undefined}
        >
          {companyName}
        </h1>
      </div>
      {customMessage && (
        <div className="mx-auto w-full max-w-6xl px-4 pb-3 sm:px-6">
          <p className="text-sm text-muted-foreground">{customMessage}</p>
        </div>
      )}
    </header>
  );
}
