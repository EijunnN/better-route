/**
 * Process-local realtime event bus.
 *
 * Used by the SSE endpoint to fan out monitoring events without going
 * to Redis. Upstash's REST client doesn't support pub/sub and we run
 * a single Next.js process today, so an in-memory `EventEmitter` is
 * the right fit. The `Bus` interface is intentionally narrow so a
 * Redis or Postgres LISTEN/NOTIFY adapter can replace this when we
 * scale to multiple instances — only this file changes.
 */
import { EventEmitter } from "node:events";

import type { MonitoringEvent } from "./events";

export interface MonitoringBus {
  publish(channel: string, event: MonitoringEvent): void;
  subscribe(
    channel: string,
    handler: (event: MonitoringEvent) => void,
  ): () => void;
}

class InMemoryBus implements MonitoringBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(channel: string, event: MonitoringEvent): void {
    this.emitter.emit(channel, event);
  }

  subscribe(
    channel: string,
    handler: (event: MonitoringEvent) => void,
  ): () => void {
    this.emitter.on(channel, handler);
    return () => this.emitter.off(channel, handler);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __betterRouteMonitoringBus: MonitoringBus | undefined;
}

// Cache the bus on globalThis so HMR in dev doesn't lose subscribers
// every reload. In prod the module is evaluated once anyway.
if (!globalThis.__betterRouteMonitoringBus) {
  globalThis.__betterRouteMonitoringBus = new InMemoryBus();
}
export const monitoringBus: MonitoringBus =
  globalThis.__betterRouteMonitoringBus;

export function monitoringChannel(companyId: string): string {
  return `monitoring:${companyId}`;
}
