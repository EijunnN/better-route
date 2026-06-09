"use client";

import { DEFAULT_BRAND_ACCENT, TERMINAL_STATUSES } from "./constants";
import { TrackingDriverInfo } from "./tracking-driver-info";
import { TrackingEvidence } from "./tracking-evidence";
import { TrackingHeader } from "./tracking-header";
import { TrackingHelp } from "./tracking-help";
import { TrackingHero } from "./tracking-hero";
import { TrackingMap } from "./tracking-map";
import { TrackingOrderInfo } from "./tracking-order-info";
import { TrackingTimeline } from "./tracking-timeline";

export interface TrackingData {
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
  } | null;
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
  /**
   * ETA recalculado en vivo desde la posición actual del driver (OSRM).
   * null cuando no hay cálculo vigente — la vista cae al estimatedArrival
   * planificado de la parada.
   */
  liveEta?: { etaAt: string; computedAt: string } | null;
  timeline: Array<{
    status: string;
    timestamp: string | null;
    label: string;
  }>;
}

/**
 * The complete public tracking page, as a pure view over [TrackingData].
 * Both the live page (`/tracking/[token]`) and the settings "full preview"
 * render THIS — so the preview can never drift from what the customer sees.
 */
export function TrackingView({ data }: { data: TrackingData }) {
  const { company, settings, order, stop, driver, liveEta, timeline } = data;
  const brandColor = company.brandColor;
  const isTerminal = TERMINAL_STATUSES.includes(order.status);

  // El ETA vivo (posición real del driver) manda sobre el planificado.
  const effectiveEta = liveEta?.etaAt ?? stop?.estimatedArrival ?? null;
  const etaIsLive = Boolean(liveEta);

  // Most relevant "last update" timestamp for the current stage.
  const lastUpdate =
    stop?.completedAt ??
    stop?.startedAt ??
    timeline.findLast?.((e) => e.timestamp)?.timestamp ??
    null;

  return (
    <div className="flex min-h-screen flex-col">
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
                estimatedArrival={effectiveEta}
                etaIsLive={etaIsLive}
                etaComputedAt={liveEta?.computedAt ?? null}
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

            {order.status === "FAILED" && stop?.failureReason && (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-5 py-4">
                <p className="font-semibold text-destructive text-sm">
                  Motivo del fallo
                </p>
                <p className="mt-1 text-destructive/80 text-sm">
                  {stop.failureReason}
                </p>
              </div>
            )}

            {!isTerminal && (
              <div className="flex items-center justify-center gap-2 pt-2 text-muted-foreground text-xs">
                <span
                  className="inline-block size-1.5 animate-pulse rounded-full"
                  style={{
                    backgroundColor: brandColor ?? DEFAULT_BRAND_ACCENT,
                  }}
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
              estimatedArrival={effectiveEta}
              etaIsLive={etaIsLive}
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

            {stop && settings.showEvidence && stop.status === "COMPLETED" && (
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

      <footer className="border-t px-4 py-3 text-center">
        <p className="text-muted-foreground text-xs">
          Seguimiento por BetterRoute
        </p>
      </footer>
    </div>
  );
}
