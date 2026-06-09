"use client";

import { Maximize2 } from "lucide-react";
import { type TrackingData, TrackingView } from "@/components/tracking";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { TrackingSettings } from "./configuracion-context";

/**
 * Builds a representative in-progress delivery so the planner sees the whole
 * page (map, timeline, driver, ...) exactly as a customer would — with the
 * live, unsaved brand color / message / visibility toggles applied.
 */
function buildSampleData(
  tracking: TrackingSettings,
  companyName: string,
): TrackingData {
  const now = Date.now();
  const iso = (minsAgo: number) =>
    new Date(now - minsAgo * 60_000).toISOString();
  return {
    company: {
      name: companyName,
      logoUrl: null,
      brandColor: tracking.brandColor || null,
      customMessage: tracking.customMessage,
    },
    settings: {
      showMap: tracking.showMap,
      showDriverLocation: tracking.showDriverLocation,
      showDriverName: tracking.showDriverName,
      showEvidence: tracking.showEvidence,
      showEta: tracking.showEta,
      showTimeline: tracking.showTimeline,
    },
    order: {
      trackingId: "TRK-28431",
      status: "IN_PROGRESS",
      address: "Av. Javier Prado 1580, San Isidro",
      latitude: -12.0931,
      longitude: -77.0465,
      customerName: "Juan Pérez",
      promisedDate: null,
      timeWindowStart: "13:00",
      timeWindowEnd: "15:00",
    },
    stop: {
      status: "IN_PROGRESS",
      sequence: 3,
      estimatedArrival: "15:42",
      startedAt: iso(22),
      completedAt: null,
      failureReason: null,
      evidenceUrls: [],
      notes: null,
    },
    driver: {
      name: "Carlos Ramírez",
      photo: null,
      location: {
        latitude: -12.0958,
        longitude: -77.041,
        speed: 24,
        heading: 75,
        recordedAt: iso(1),
      },
    },
    timeline: [
      { status: "PENDING", timestamp: iso(150), label: "Pedido confirmado" },
      {
        status: "ASSIGNED",
        timestamp: iso(95),
        label: "Asignado a un conductor",
      },
      { status: "IN_PROGRESS", timestamp: iso(22), label: "En camino" },
    ],
  };
}

export function TrackingFullPreview({
  tracking,
  companyName,
}: {
  tracking: TrackingSettings;
  companyName: string;
}) {
  const data = buildSampleData(tracking, companyName);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-2">
          <Maximize2 className="size-4" />
          Vista previa completa
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[92vh] max-w-[1100px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-2.5 text-left">
          <DialogTitle className="text-sm">
            Vista previa del tracking público — datos de ejemplo
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto bg-background">
          <TrackingView data={data} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
