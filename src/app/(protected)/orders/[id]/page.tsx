"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Can } from "@/components/auth/can";
import { ProtectedPage } from "@/components/auth/protected-page";
import {
  CancelOrderDialog,
  type CancelOrderPayload,
} from "@/components/orders/cancel-order-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AttemptBadge,
  ProgramarProximaEntregaDialog,
  type ReschedulePayload,
  type ReschedulePrefill,
  VisitTimeline,
} from "@/components/visits";
import { useCompanyContext } from "@/hooks/use-company-context";
import { useToast } from "@/hooks/use-toast";

interface OrderDetail {
  id: string;
  trackingId: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  address: string;
  status: string;
  notes: string | null;
  promisedDate: string | null;
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
  presetName: string | null;
}

interface LatestStop {
  id: string;
  status: string;
  attemptNumber: number;
  address: string;
  latitude: string;
  longitude: string;
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
  notes: string | null;
  failureReason: string | null;
  createdAt: string;
}

function isoToHHmm(iso: string | null): string | null {
  return iso ? new Date(iso).toISOString().slice(11, 16) : null;
}

function OrderDetailContent() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;
  const { effectiveCompanyId: companyId, isReady } = useCompanyContext();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [attemptCount, setAttemptCount] = useState<number>(0);
  const [latestStop, setLatestStop] = useState<LatestStop | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const { toast } = useToast();

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const [orderRes, visitsRes, stopRes] = await Promise.all([
          fetch(`/api/orders/${orderId}`, {
            headers: { "x-company-id": companyId },
          }),
          fetch(`/api/orders/${orderId}/visits`, {
            headers: { "x-company-id": companyId },
          }),
          fetch(`/api/orders/${orderId}/stops/latest`, {
            headers: { "x-company-id": companyId },
          }),
        ]);
        if (!orderRes.ok) {
          throw new Error(
            orderRes.status === 404 ? "Pedido no encontrado" : "Error al cargar el pedido",
          );
        }
        const orderJson = (await orderRes.json()) as OrderDetail;
        if (cancelled) return;
        setOrder(orderJson);

        if (visitsRes.ok) {
          const v = (await visitsRes.json()) as { data: unknown[] };
          if (!cancelled) setAttemptCount(v.data.length);
        }
        if (stopRes.ok) {
          const s = (await stopRes.json()) as { data: LatestStop | null };
          if (!cancelled) setLatestStop(s.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error inesperado");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, orderId, refreshTick]);

  const handleReopenSubmit = async (payload: ReschedulePayload) => {
    if (!latestStop || !companyId) return;
    const res = await fetch(
      `/api/route-stops/${latestStop.id}/reopen`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId,
        },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || "No se pudo reabrir la parada");
    }
    toast({ title: "Parada reabierta", description: "El conductor verá el pedido nuevamente en su lista." });
    refresh();
  };

  const reopenPrefill: ReschedulePrefill | null = latestStop
    ? {
        address: latestStop.address,
        latitude: latestStop.latitude,
        longitude: latestStop.longitude,
        timeWindowStart: isoToHHmm(latestStop.timeWindowStart),
        timeWindowEnd: isoToHHmm(latestStop.timeWindowEnd),
        promisedDate: null,
        notes: latestStop.notes ?? null,
      }
    : null;

  const handleCancelSubmit = async (payload: CancelOrderPayload) => {
    if (!order || !companyId) return;
    const res = await fetch(`/api/orders/${order.id}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-company-id": companyId,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || "No se pudo cancelar el pedido");
    }
    toast({
      title: "Pedido cancelado",
      description: "El pedido se marcó como CANCELLED definitivamente.",
    });
    refresh();
  };

  const isTerminal =
    order?.status === "CANCELLED" || order?.status === "COMPLETED";

  const handleReactivateSubmit = async (payload: ReschedulePayload) => {
    if (!order || !companyId) return;
    const res = await fetch(`/api/orders/${order.id}/reactivate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-company-id": companyId,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || "No se pudo reactivar el pedido");
    }
    toast({
      title: "Pedido reactivado",
      description: "Entrará en el próximo plan disponible.",
    });
    refresh();
  };

  const reactivatePrefill: ReschedulePrefill | null = order
    ? {
        address: order.address,
        latitude: latestStop?.latitude ?? "",
        longitude: latestStop?.longitude ?? "",
        timeWindowStart: order.timeWindowStart
          ? order.timeWindowStart.slice(0, 5)
          : null,
        timeWindowEnd: order.timeWindowEnd
          ? order.timeWindowEnd.slice(0, 5)
          : null,
        promisedDate: order.promisedDate
          ? order.promisedDate.slice(0, 10)
          : null,
        notes: order.notes ?? null,
      }
    : null;

  if (!isReady || (!order && !error)) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/orders")}
        >
          <ArrowLeft className="mr-2 size-4" /> Volver
        </Button>
        <Card className="mt-4">
          <CardContent className="py-12 text-center text-destructive">
            {error}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!order) return null;

  const nextAttemptNumber = attemptCount + 1;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/orders")}
        >
          <ArrowLeft className="mr-2 size-4" /> Volver
        </Button>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {order.trackingId}
          </h1>
          <Badge variant="outline">{order.status}</Badge>
          <AttemptBadge attemptNumber={nextAttemptNumber} />
        </div>
        {order.customerName && (
          <div className="text-muted-foreground">{order.customerName}</div>
        )}
      </div>

      <Card>
        <CardContent className="space-y-3 py-5 text-sm">
          <DetailRow label="Dirección" value={order.address} />
          {order.customerPhone && (
            <DetailRow label="Teléfono" value={order.customerPhone} />
          )}
          {order.customerEmail && (
            <DetailRow label="Email" value={order.customerEmail} />
          )}
          {(order.timeWindowStart || order.presetName) && (
            <DetailRow
              label="Ventana horaria"
              value={
                order.timeWindowStart && order.timeWindowEnd
                  ? `${order.timeWindowStart.slice(0, 5)} – ${order.timeWindowEnd.slice(0, 5)}`
                  : order.presetName ?? "—"
              }
            />
          )}
          {order.promisedDate && (
            <DetailRow
              label="Fecha prometida"
              value={new Date(order.promisedDate).toLocaleDateString("es-PE")}
            />
          )}
          {order.notes && <DetailRow label="Notas" value={order.notes} />}
        </CardContent>
      </Card>

      {latestStop && latestStop.status === "FAILED" && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <div className="text-sm font-medium">Parada con entrega fallida</div>
              <div className="text-xs text-muted-foreground">
                Reabre la parada para que el conductor lo vuelva a intentar.
              </div>
            </div>
            <Can perm="route_stop:update">
              <Button onClick={() => setReopenOpen(true)}>
                Reabrir parada
              </Button>
            </Can>
          </CardContent>
        </Card>
      )}

      {order.status === "FAILED" && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <div className="text-sm font-medium">Pedido marcado como fallido</div>
              <div className="text-xs text-muted-foreground">
                Reactívalo para que entre en el próximo plan disponible.
              </div>
            </div>
            <Can perm="order:update">
              <Button onClick={() => setReactivateOpen(true)}>
                Programar próxima entrega
              </Button>
            </Can>
          </CardContent>
        </Card>
      )}

      {!isTerminal && (
        <Can perm="order:update">
          <div className="flex justify-end">
            <Button
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setCancelOpen(true)}
            >
              Cancelar definitivamente
            </Button>
          </div>
        </Can>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Historial de intentos</h2>
        <VisitTimeline
          key={refreshTick}
          orderId={order.id}
          companyId={companyId}
        />
      </section>

      {reopenPrefill && (
        <ProgramarProximaEntregaDialog
          open={reopenOpen}
          onOpenChange={setReopenOpen}
          mode="same-day"
          prefill={reopenPrefill}
          onSubmit={handleReopenSubmit}
        />
      )}

      {reactivatePrefill && (
        <ProgramarProximaEntregaDialog
          open={reactivateOpen}
          onOpenChange={setReactivateOpen}
          mode="cross-day"
          prefill={reactivatePrefill}
          onSubmit={handleReactivateSubmit}
        />
      )}

      <CancelOrderDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onConfirm={handleCancelSubmit}
      />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px,1fr] gap-3">
      <div className="text-muted-foreground">{label}</div>
      <div className="break-words">{value}</div>
    </div>
  );
}

export default function OrderDetailPage() {
  return (
    <ProtectedPage requiredPermission="order:read">
      <OrderDetailContent />
    </ProtectedPage>
  );
}
