"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title: string;
  error: string;
  onRetry: () => void;
  /** Use compact variant for narrow panels (e.g. sidebar) */
  compact?: boolean;
}

export function ErrorState({ title, error, onRetry, compact }: ErrorStateProps) {
  if (compact) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-8 text-center mx-4">
        <AlertCircle className="h-10 w-10 mx-auto text-destructive mb-3" />
        <h3 className="text-sm font-semibold mb-2">{title}</h3>
        <p className="text-xs text-muted-foreground mb-3">{error}</p>
        <Button size="sm" onClick={onRetry}>Reintentar</Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-12 text-center">
      <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground mb-4">{error}</p>
      <Button onClick={onRetry}>Reintentar</Button>
    </div>
  );
}
