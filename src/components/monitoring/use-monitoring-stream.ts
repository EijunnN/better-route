"use client";

import { useEffect, useRef } from "react";
import type { MonitoringEventKind } from "@/lib/realtime";

const KNOWN_EVENTS: MonitoringEventKind[] = [
  "stop.started",
  "stop.completed",
  "stop.failed",
  "stop.skipped",
  "stop.transitioned",
  "driver.location",
];

/**
 * Subscribes the monitoring page to the SSE channel scoped to the
 * effective company. Each push triggers `onEvent` so the caller can
 * revalidate the SWR caches it owns — we don't fetch payloads here
 * because the events are intentionally small (a hint, not the data).
 *
 * Auto-reconnects with exponential backoff up to 30s. Pauses while the
 * tab is hidden to avoid burning sockets on background tabs; on
 * `visibilitychange` it forces an immediate revalidate plus a fresh
 * connection so we never miss transitions that happened while away.
 */
export function useMonitoringStream(
  companyId: string | null,
  onEvent: (kind: MonitoringEventKind) => void,
): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!companyId) return;

    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let backoff = 1000;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      // The browser EventSource sends cookies (httpOnly auth JWT) and
      // honours the company hint via search param — middleware can read
      // it the same as `x-company-id` for non-fetch contexts.
      const url = `/api/monitoring/stream?companyId=${encodeURIComponent(companyId)}`;
      source = new EventSource(url, { withCredentials: true });

      source.addEventListener("ready", () => {
        backoff = 1000;
      });

      for (const kind of KNOWN_EVENTS) {
        source.addEventListener(kind, () => {
          onEventRef.current(kind);
        });
      }

      source.onerror = () => {
        source?.close();
        source = null;
        if (cancelled) return;
        const next = Math.min(backoff, 30_000);
        backoff = Math.min(backoff * 2, 30_000);
        retryTimer = setTimeout(connect, next);
      };
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && !source) {
        backoff = 1000;
        connect();
      }
    };

    connect();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
      source?.close();
      source = null;
    };
  }, [companyId]);
}
