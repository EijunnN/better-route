"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, AlertTriangle } from "lucide-react";
import {
  TrackingHeader,
  TrackingOrderInfo,
  TrackingTimeline,
  TrackingMap,
  TrackingEvidence,
  TrackingDriverInfo,
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

  // Auto-refresh while not in terminal state
  useEffect(() => {
    if (!data || TERMINAL_STATUSES.includes(data.order.status)) {
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
  }, [data, fetchTracking]);

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
  const isTerminal = TERMINAL_STATUSES.includes(order.status);

  return (
    <div className="min-h-screen flex flex-col">
      <TrackingHeader
        companyName={company.name}
        logoUrl={company.logoUrl}
        brandColor={brandColor}
        customMessage={company.customMessage}
      />

      <main className="flex-1 px-4 py-4 mx-auto w-full max-w-2xl space-y-4">
        {/* Map - conditional */}
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
          />
        )}

        {/* Order info */}
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

        {/* Driver info - conditional */}
        {settings.showDriverName && driver && (
          <TrackingDriverInfo
            name={driver.name}
            photo={driver.photo}
          />
        )}

        {/* Timeline - conditional */}
        {settings.showTimeline && timeline.length > 0 && (
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold mb-4">Estado del envio</h3>
            <TrackingTimeline
              timeline={timeline}
              currentStatus={order.status}
              brandColor={brandColor}
            />
          </div>
        )}

        {/* Failure reason */}
        {order.status === "FAILED" && stop.failureReason && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-destructive">
              Motivo: {stop.failureReason}
            </p>
          </div>
        )}

        {/* Evidence - conditional */}
        {settings.showEvidence && stop.status === "COMPLETED" && (
          <TrackingEvidence
            evidenceUrls={stop.evidenceUrls || []}
            completedAt={stop.completedAt}
            notes={stop.notes}
          />
        )}

        {/* Auto-refresh indicator */}
        {!isTerminal && (
          <div className="flex items-center justify-center gap-1.5 py-2">
            <div
              className="h-1.5 w-1.5 rounded-full animate-pulse"
              style={
                brandColor
                  ? { backgroundColor: brandColor }
                  : { backgroundColor: "var(--color-primary)" }
              }
            />
            <span className="text-xs text-muted-foreground">
              Actualizando automaticamente
            </span>
          </div>
        )}
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
