"use client";

import { MessageCircle, Phone, User } from "lucide-react";

interface TrackingDriverInfoProps {
  name: string;
  photo?: string | null;
  phone?: string | null;
  brandColor?: string | null;
}

export function TrackingDriverInfo({
  name,
  photo,
  phone,
  brandColor,
}: TrackingDriverInfoProps) {
  const accent = brandColor ?? "#4AB855";
  const callHref = phone ? `tel:${phone}` : null;
  const smsHref = phone ? `sms:${phone}` : null;

  return (
    <section className="rounded-2xl border border-border/60 bg-card/80 p-5">
      <p className="text-xs text-muted-foreground">Tu conductor</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {photo ? (
            <img
              src={photo}
              alt={name}
              className="h-11 w-11 shrink-0 rounded-full border border-border/60 object-cover"
            />
          ) : (
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: `${accent}26`, color: accent }}
            >
              <User className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">{name}</p>
            {phone && (
              <p className="truncate text-xs text-muted-foreground">{phone}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DriverActionButton
            href={callHref}
            label="Llamar"
            icon={<Phone className="h-4 w-4" />}
            accent={accent}
            disabled={!callHref}
          />
          <DriverActionButton
            href={smsHref}
            label="Mensaje"
            icon={<MessageCircle className="h-4 w-4" />}
            accent={accent}
            variant="outline"
            disabled={!smsHref}
          />
        </div>
      </div>
    </section>
  );
}

function DriverActionButton({
  href,
  label,
  icon,
  accent,
  variant = "filled",
  disabled,
}: {
  href: string | null;
  label: string;
  icon: React.ReactNode;
  accent: string;
  variant?: "filled" | "outline";
  disabled?: boolean;
}) {
  const className =
    variant === "filled"
      ? "h-10 w-10 rounded-full flex items-center justify-center transition-opacity hover:opacity-90"
      : "h-10 w-10 rounded-full flex items-center justify-center border border-border/80 bg-background/40 transition-colors hover:bg-background";
  const style =
    variant === "filled"
      ? { backgroundColor: `${accent}26`, color: accent }
      : undefined;

  if (disabled || !href) {
    return (
      <span
        className={`${className} cursor-not-allowed opacity-40`}
        style={style}
        aria-label={label}
        aria-disabled="true"
      >
        {icon}
      </span>
    );
  }
  return (
    <a href={href} aria-label={label} className={className} style={style}>
      {icon}
    </a>
  );
}
