/**
 * Monitoring event types and publish helpers.
 *
 * Events are published to the `monitoring:{companyId}` Centrifugo
 * channel (ADR-0007); the dashboard subscribes over WebSocket and uses
 * `kind` to decide which SWR cache to revalidate. Payloads stay small —
 * a hint to refetch, not the data itself.
 */

import { centrifugoPublish } from "./centrifugo";
import { centrifugoChannels } from "./channels";

export type MonitoringEventKind =
  | "stop.started"
  | "stop.completed"
  | "stop.failed"
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
};

/**
 * Publish a stop transition to the company's monitoring channel.
 * Fire-and-forget — `centrifugoPublish` never throws.
 */
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
  void centrifugoPublish(centrifugoChannels.monitoring(input.companyId), event);
}

/**
 * Publish a driver location ping to the company's monitoring channel.
 * The dashboard patches the marker and revalidates the driver list.
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
  void centrifugoPublish(centrifugoChannels.monitoring(input.companyId), event);
}
