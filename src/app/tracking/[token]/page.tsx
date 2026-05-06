"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, AlertTriangle } from "lucide-react";
import {
  TrackingDriverInfo,
  TrackingEvidence,
  TrackingHeader,
  TrackingHelp,
  TrackingHero,
  TrackingMap,
  TrackingOrderInfo,
  TrackingTimeline,
} from "@/components/tracking";

interface TrackingData {
  company: {
    name: string;
    logoUrl?: string | null;
    brandColor?: string | null;
    customMessage?: string | null;
  };
  settings: {
    showMap: boolean;
    showDriverLocation: boolean;
    showDriverName: boolean;
    showEvidence: boolean;
    showEta: boolean;
    showTimeline: boolean;
  };
  order: {
    trackingId: string;
    status: string;
    address: string;
    latitude: number;
    longitude: number;
    customerName: string;
    promisedDate?: string | null;
    timeWindowStart?: string | null;
    timeWindowEnd?: string | null;
  };
  stop: {
    status: string;
    sequence: number;
    estimatedArrival?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
    failureReason?: string | null;
    evidenceUrls?: string[];
    notes?: string | null;
  };
  driver?: {
    name: string;
    photo?: string | null;
    location?: {
      latitude: number;
      longitude: number;
      speed?: number;
      heading?: number;
      recordedAt?: string;
    } | null;
  } | null;
  timeline: Array<{
    status: string;
    timestamp: string | null;
    label: string;
  }>;
}

const TERMINAL_STATUSES = ["COMPLETED", "FAILED", "CANCELLED"];
const REFRESH_INTERVAL = 15000;

export default function TrackingPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [data, setData] = useState<TrackingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Memoised by token only — without useCallback the function identity
  // changed on every render, retriggering the effects below in an
  // infinite fetch/setState/re-render loop.
  const fetchTracking = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/tracking/${token}`);
      if (res.status === 404) {
        setError("Enlace de seguimiento no valido");
        setData(null);
        return;
      }
      if (res.status === 410) {
        setError("Este enlace de seguimiento ha expirado");
        setData(null);
        return;
      }
      if (!res.ok) {
        setError("Error al cargar la informacion de seguimiento");
        return;
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch {
      setError("Error de conexion. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Initial fetch
  useEffect(() => {
    fetchTracking();
  }, [fetchTracking]);

  // Auto-refresh while not in terminal state. Depending on `data`
  // directly would tear down and rebuild the interval on every poll
  // (since each fetch produces a new object), defeating the throttle —
  // we only care whether the load succeeded (`hasData`) and whether
  // we've reached a terminal status.
  const hasData = data !== null;
  const isTerminal = data
    ? TERMINAL_STATUSES.includes(data.order.status)
    : false;

  useEffect(() => {
    if (!hasData || isTerminal) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(fetchTracking, REFRESH_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [hasData, isTerminal, fetchTracking]);

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="text-center space-y-3">
          <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground" />
          <h2 className="text-lg font-semibold">
            {error || "No se encontro la informacion"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Verifica que el enlace sea correcto o contacta al remitente.
          </p>
        </div>
      </div>
    );
  }

  const { company, settings, order, stop, driver, timeline } = data;
  const brandColor = company.brandColor;

  // Surface "last update" in the hero. Use the most relevant
  // timestamp for each stage so the user sees activity-correlated
  // info: completion time when delivered, otherwise the last
  // transition we know about.
  const lastUpdate =
    stop.completedAt ??
    stop.startedAt ??
    timeline.findLast?.((e) => e.timestamp)?.timestamp ??
    null;

  return (
    <div className="min-h-screen flex flex-col">
      <TrackingHeader
        companyName={company.name}
        logoUrl={company.logoUrl}
        brandColor={brandColor}
        customMessage={company.customMessage}
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* ── Main column ─────────────────────────────────────── */}
          <div className="space-y-5">
            <TrackingHero
              status={order.status}
              lastUpdate={lastUpdate}
              brandColor={brandColor}
            />

            {settings.showMap && (
              <TrackingMap
                deliveryLat={order.latitude}
                deliveryLng={order.longitude}
                driverLocation={
                  settings.showDriverLocation && driver?.location
                    ? driver.location
                    : null
                }
                showDriverLocation={settings.showDriverLocation}
                brandColor={brandColor}
                estimatedArrival={stop.estimatedArrival}
                status={order.status}
              />
            )}

            {settings.showTimeline && timeline.length > 0 && (
              <TrackingTimeline
                timeline={timeline}
                currentStatus={order.status}
                driverName={driver?.name ?? null}
                brandColor={brandColor}
              />
            )}

            {order.status === "FAILED" && stop.failureReason && (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-5 py-4">
                <p className="text-sm font-semibold text-destructive">
                  Motivo del fallo
                </p>
                <p className="mt-1 text-sm text-destructive/80">
                  {stop.failureReason}
                </p>
              </div>
            )}

            {!isTerminal && (
              <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground">
                <span
                  className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
                  style={{ backgroundColor: brandColor ?? "#4AB855" }}
                />
                Actualizando automáticamente
              </div>
            )}
          </div>

          {/* ── Sidebar ─────────────────────────────────────────── */}
          <aside className="space-y-5">
            <TrackingOrderInfo
              trackingId={order.trackingId}
              status={order.status}
              address={order.address}
              customerName={order.customerName}
              promisedDate={order.promisedDate}
              timeWindowStart={order.timeWindowStart}
              timeWindowEnd={order.timeWindowEnd}
              estimatedArrival={stop.estimatedArrival}
              showEta={settings.showEta}
              brandColor={brandColor}
            />

            {settings.showDriverName && driver && (
              <TrackingDriverInfo
                name={driver.name}
                photo={driver.photo}
                brandColor={brandColor}
              />
            )}

            {settings.showEvidence && stop.status === "COMPLETED" && (
              <TrackingEvidence
                evidenceUrls={stop.evidenceUrls || []}
                completedAt={stop.completedAt}
                notes={stop.notes}
              />
            )}

            <TrackingHelp brandColor={brandColor} />
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t px-4 py-3 text-center">
        <p className="text-xs text-muted-foreground">
          Seguimiento por BetterRoute
        </p>
      </footer>
    </div>
  );
}
