"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  TERMINAL_STATUSES,
  type TrackingData,
  TrackingView,
} from "@/components/tracking";

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

  // Auto-refresh while not in terminal state. Depending on `data` directly
  // would tear down and rebuild the interval on every poll (each fetch yields
  // a new object), defeating the throttle — we only care whether the load
  // succeeded (`hasData`) and whether we've reached a terminal status.
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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="space-y-3 text-center">
          <AlertTriangle className="mx-auto size-12 text-muted-foreground" />
          <h2 className="font-semibold text-lg">
            {error || "No se encontro la informacion"}
          </h2>
          <p className="text-muted-foreground text-sm">
            Verifica que el enlace sea correcto o contacta al remitente.
          </p>
        </div>
      </div>
    );
  }

  return <TrackingView data={data} />;
}
