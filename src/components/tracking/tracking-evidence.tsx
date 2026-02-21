"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, Clock } from "lucide-react";

interface TrackingEvidenceProps {
  evidenceUrls: string[];
  completedAt?: string | null;
  notes?: string | null;
}

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleString("es-PE", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function TrackingEvidence({
  evidenceUrls,
  completedAt,
  notes,
}: TrackingEvidenceProps) {
  if (evidenceUrls.length === 0 && !notes) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Camera className="h-4 w-4" />
          Evidencia de entrega
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {completedAt && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Entregado: {formatTimestamp(completedAt)}
          </div>
        )}

        {evidenceUrls.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {evidenceUrls.map((url, idx) => (
              <a
                key={idx}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-md overflow-hidden border hover:opacity-90 transition-opacity"
              >
                <img
                  src={url}
                  alt={`Evidencia ${idx + 1}`}
                  className="w-full h-32 object-cover"
                />
              </a>
            ))}
          </div>
        )}

        {notes && (
          <div className="text-sm text-muted-foreground bg-muted rounded-md px-3 py-2">
            {notes}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
