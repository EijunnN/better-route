"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ProtectedPage } from "@/components/auth/protected-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AttemptBadge, VisitTimeline } from "@/components/visits";
import { useCompanyContext } from "@/hooks/use-company-context";

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

function OrderDetailContent() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;
  const { effectiveCompanyId: companyId, isReady } = useCompanyContext();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [attemptCount, setAttemptCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const [orderRes, visitsRes] = await Promise.all([
          fetch(`/api/orders/${orderId}`, {
            headers: { "x-company-id": companyId },
          }),
          fetch(`/api/orders/${orderId}/visits`, {
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
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error inesperado");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, orderId]);

  if (!isReady || (!order && !error)) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
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
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver
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
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver
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

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Historial de intentos</h2>
        <VisitTimeline orderId={order.id} companyId={companyId} />
      </section>
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
