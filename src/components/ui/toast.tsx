"use client";

import { useToast } from "@/hooks/use-toast";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <div className="fixed bottom-0 right-0 z-[100] flex flex-col gap-2 p-4 max-w-[420px] w-full">
      {toasts.map(({ id, title, description, variant = "default" }) => (
        <div
          key={id}
          className={`p-4 rounded-lg shadow-lg border ${
            variant === "destructive"
              ? "bg-destructive text-destructive-foreground border-destructive"
              : "bg-background border-border"
          }`}
        >
          {title && <div className="font-semibold mb-1">{title}</div>}
          {description && (
            <div className="text-sm opacity-90">{description}</div>
          )}
        </div>
      ))}
    </div>
  );
}
