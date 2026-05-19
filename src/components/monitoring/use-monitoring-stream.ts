"use client";

import { Centrifuge } from "centrifuge";
import { useEffect, useRef } from "react";
import type { MonitoringEventKind } from "@/lib/realtime";

/**
 * Resolve the Centrifugo WebSocket URL. In production the reverse proxy
 * exposes it same-origin at `/connection/websocket`; in dev the app and
 * Centrifugo run on different ports, so `NEXT_PUBLIC_CENTRIFUGO_WS_URL`
 * gives an explicit override.
 */
function resolveWsUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_CENTRIFUGO_WS_URL;
  if (explicit) return explicit;
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/connection/websocket`;
}

/**
 * Subscribes the monitoring page to its company's realtime channel over
 * Centrifugo (ADR-0007). Each event triggers `onEvent` so the caller can
 * revalidate the SWR caches it owns — payloads are small hints, not data.
 *
 * Uses server-side subscriptions: the `channels` claim in the token
 * (issued by `/api/realtime/token`) subscribes the connection to
 * `monitoring:{companyId}`, so publications arrive on the client-level
 * `publication` event. The SDK reconnects with backoff on its own and
 * refreshes the token transparently via the `getToken` callback.
 */
export function useMonitoringStream(
  companyId: string | null,
  onEvent: (kind: MonitoringEventKind) => void,
): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!companyId) return;

    const centrifuge = new Centrifuge(resolveWsUrl(), {
      getToken: async () => {
        const res = await fetch("/api/realtime/token", {
          headers: { "x-company-id": companyId },
        });
        if (!res.ok) throw new Error("Failed to fetch realtime token");
        const { token } = (await res.json()) as { token: string };
        return token;
      },
    });

    // Server-side subscriptions deliver publications on the client object.
    centrifuge.on("publication", (ctx) => {
      const kind = (ctx.data as { kind?: MonitoringEventKind } | undefined)
        ?.kind;
      if (kind) onEventRef.current(kind);
    });

    centrifuge.connect();

    return () => {
      centrifuge.disconnect();
    };
  }, [companyId]);
}
