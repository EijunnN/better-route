/**
 * Monitoring event types and publish helpers.
 *
 * Subscribers receive these from the [`monitoringBus`] via the SSE
 * endpoint at `/api/monitoring/events`. Keep payloads small — they're
 * a hint to revalidate, not a replacement for the data fetch. The
 * client uses the `kind` to decide which SWR cache to invalidate.
 */
import { monitoringBus, monitoringChannel } from "./event-bus";

export type MonitoringEventKind =
  | "stop.started"
  | "stop.completed"
  | "stop.failed"
  | "stop.skipped"
  | "stop.transitioned";

export interface StopEvent {
  kind: MonitoringEventKind;
  companyId: string;
  stopId: string;
  routeId: string | null;
  driverId: string | null;
  systemState: string;
  occurredAt: string;
}

export type MonitoringEvent = StopEvent;

const STATUS_TO_KIND: Record<string, MonitoringEventKind> = {
  IN_PROGRESS: "stop.started",
  COMPLETED: "stop.completed",
  FAILED: "stop.failed",
  SKIPPED: "stop.skipped",
};

export function publishStopEvent(input: {
  companyId: string;
  stopId: string;
  routeId: string | null;
  driverId: string | null;
  previousStatus: string;
  newStatus: string;
}): void {
  const kind: MonitoringEventKind =
    STATUS_TO_KIND[input.newStatus] ?? "stop.transitioned";
  const event: StopEvent = {
    kind,
    companyId: input.companyId,
    stopId: input.stopId,
    routeId: input.routeId,
    driverId: input.driverId,
    systemState: input.newStatus,
    occurredAt: new Date().toISOString(),
  };
  monitoringBus.publish(monitoringChannel(input.companyId), event);
}
