"use client";

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
    <header className="border-b bg-card px-4 py-4">
      <div className="mx-auto max-w-2xl flex items-center gap-3">
        {logoUrl && (
          <img
            src={logoUrl}
            alt={companyName}
            className="h-8 w-8 rounded object-contain"
          />
        )}
        <h1
          className="text-lg font-semibold"
          style={brandColor ? { color: brandColor } : undefined}
        >
          {companyName}
        </h1>
      </div>
      {customMessage && (
        <p className="mx-auto max-w-2xl mt-2 text-sm text-muted-foreground">
          {customMessage}
        </p>
      )}
    </header>
  );
}
