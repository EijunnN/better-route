"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Small "Intento #N" pill shown anywhere a Stop / Order with prior
 * delivery attempts is listed. Render only when `attemptNumber > 1` —
 * the first attempt does not need a badge.
 */
export function AttemptBadge({
  attemptNumber,
  className,
}: {
  attemptNumber: number;
  className?: string;
}) {
  if (attemptNumber <= 1) return null;
  return (
    <Badge variant="warning" className={cn("font-mono text-[10px]", className)}>
      Intento #{attemptNumber}
    </Badge>
  );
}
