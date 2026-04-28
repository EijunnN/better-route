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
  | "stop.transitioned"
  | "driver.location";

export interface StopEvent {
  kind: Exclude<MonitoringEventKind, "driver.location">;
  companyId: string;
  stopId: string;
  routeId: string | null;
  driverId: string | null;
  systemState: string;
  occurredAt: string;
}

export interface DriverLocationEvent {
  kind: "driver.location";
  companyId: string;
  driverId: string;
  routeId: string | null;
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  isMoving: boolean | null;
  occurredAt: string;
}

export type MonitoringEvent = StopEvent | DriverLocationEvent;

const STATUS_TO_KIND: Record<string, StopEvent["kind"]> = {
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
  const kind = STATUS_TO_KIND[input.newStatus] ?? "stop.transitioned";
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

/**
 * Drop-and-go publisher for the location ping coming in from the
 * mobile app. The payload is intentionally small so the dashboard
 * can patch the marker locally without a re-fetch — but the client
 * still falls back to a SWR revalidate as a safety net.
 */
export function publishDriverLocationEvent(input: {
  companyId: string;
  driverId: string;
  routeId: string | null;
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  isMoving: boolean | null;
}): void {
  const event: DriverLocationEvent = {
    kind: "driver.location",
    companyId: input.companyId,
    driverId: input.driverId,
    routeId: input.routeId,
    latitude: input.latitude,
    longitude: input.longitude,
    heading: input.heading,
    speed: input.speed,
    isMoving: input.isMoving,
    occurredAt: new Date().toISOString(),
  };
  monitoringBus.publish(monitoringChannel(input.companyId), event);
}
