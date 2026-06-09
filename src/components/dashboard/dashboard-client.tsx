"use client";

import { CheckCircle2, Package, Truck, Users } from "lucide-react";
import {
  ACCENTS,
  type ActiveDriver,
  ActiveDrivers,
  GettingStarted,
  IntakeChart,
  MetricCard,
  type RecentOrder,
  RecentOrders,
  StatusDistribution,
} from "@/components/dashboard";
import { Card, CardContent } from "@/components/ui/card";
import { useApiData } from "@/hooks/use-api";
import { useCompanyContext } from "@/hooks/use-company-context";

interface Summary {
  orders: {
    total: number;
    pending: number;
    assigned: number;
    inProgress: number;
    completed: number;
    failed: number;
    cancelled: number;
  };
  drivers: {
    total: number;
    available: number;
    inRoute: number;
    assigned: number;
  };
  vehicles: {
    total: number;
    available: number;
    assigned: number;
    maintenance: number;
  };
  fleetCount: number;
  intake: {
    series: { label: string; value: number; emphasis?: boolean }[];
    trendPct: number;
    total: number;
  };
  recentOrders: RecentOrder[];
  activeDrivers: ActiveDriver[];
}

export function DashboardClient() {
  const { effectiveCompanyId } = useCompanyContext();
  const { data, isLoading } = useApiData<Summary>(
    "/api/dashboard/summary",
    effectiveCompanyId,
  );

  const today = new Intl.DateTimeFormat("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-semibold text-xl tracking-tight">Resumen</h1>
          <p className="text-muted-foreground text-sm">
            Vista general de tu operación
          </p>
        </div>
        <span className="hidden text-muted-foreground text-sm capitalize sm:block">
          {today}
        </span>
      </div>

      {isLoading || !data ? (
        <DashboardSkeleton />
      ) : (
        <DashboardBody data={data} />
      )}
    </div>
  );
}

function DashboardBody({ data }: { data: Summary }) {
  const o = data.orders;
  const drv = data.drivers;
  const veh = data.vehicles;
  const { intake } = data;

  const completionRate =
    o.total > 0 ? Math.round((o.completed / o.total) * 100) : 0;
  const activeDrivers = drv.inRoute + drv.assigned;
  const driverOffline = Math.max(
    0,
    drv.total - drv.available - drv.inRoute - drv.assigned,
  );
  const vehicleOther = Math.max(
    0,
    veh.total - veh.available - veh.assigned - veh.maintenance,
  );
  const hasData = o.total > 0;
  const hasLists =
    data.recentOrders.length > 0 || data.activeDrivers.length > 0;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Pedidos totales"
          value={o.total}
          icon={Package}
          accent={ACCENTS.lime}
          sparkline={intake.series.map((s) => s.value)}
          trend={
            hasData
              ? { value: intake.trendPct, label: "vs. semana previa" }
              : undefined
          }
          footer={hasData ? undefined : `${o.pending} pendientes`}
        />
        <MetricCard
          title="Conductores activos"
          value={activeDrivers}
          icon={Users}
          accent={ACCENTS.blue}
          segments={[
            { label: "En ruta", value: drv.inRoute, color: "bg-primary" },
            { label: "Asignado", value: drv.assigned, color: "bg-chart-2" },
            { label: "Disponible", value: drv.available, color: "bg-chart-3" },
            {
              label: "Offline",
              value: driverOffline,
              color: "bg-muted-foreground/40",
            },
          ]}
          footer={`de ${drv.total} en total`}
        />
        <MetricCard
          title="Vehículos asignados"
          value={veh.assigned}
          icon={Truck}
          accent={ACCENTS.violet}
          segments={[
            { label: "Asignado", value: veh.assigned, color: "bg-chart-2" },
            { label: "Disponible", value: veh.available, color: "bg-chart-3" },
            { label: "Mantenim.", value: veh.maintenance, color: "bg-chart-5" },
            {
              label: "Otro",
              value: vehicleOther,
              color: "bg-muted-foreground/40",
            },
          ]}
          footer={`de ${veh.total} operativos`}
        />
        <MetricCard
          title="Tasa de cumplimiento"
          value={`${completionRate}%`}
          icon={CheckCircle2}
          accent={ACCENTS.green}
          segments={[
            { label: "Completado", value: o.completed, color: "bg-chart-3" },
            { label: "En ruta", value: o.inProgress, color: "bg-primary" },
            {
              label: "Pendiente",
              value: o.pending + o.assigned,
              color: "bg-chart-5",
            },
            { label: "Fallido", value: o.failed, color: "bg-destructive" },
          ]}
        />
      </div>

      {hasData ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <IntakeChart data={intake.series} total={intake.total} />
          </div>
          <StatusDistribution
            slices={[
              { label: "Pendiente", count: o.pending, color: "bg-chart-5" },
              { label: "Asignado", count: o.assigned, color: "bg-chart-2" },
              { label: "En ruta", count: o.inProgress, color: "bg-primary" },
              { label: "Completado", count: o.completed, color: "bg-chart-3" },
              { label: "Fallido", count: o.failed, color: "bg-destructive" },
              {
                label: "Cancelado",
                count: o.cancelled,
                color: "bg-muted-foreground/50",
              },
            ]}
          />
        </div>
      ) : (
        <GettingStarted
          counts={{
            fleets: data.fleetCount,
            vehicles: veh.total,
            drivers: drv.total,
            orders: o.total,
          }}
        />
      )}

      {(hasData || hasLists) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <RecentOrders orders={data.recentOrders} />
          <ActiveDrivers drivers={data.activeDrivers} />
        </div>
      )}
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="space-y-3 p-5">
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="h-8 w-16 rounded bg-muted" />
              <div className="h-2 w-full rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <div className="h-56 w-full rounded bg-muted" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="h-4 w-32 rounded bg-muted" />
            <div className="h-2.5 w-full rounded bg-muted" />
            <div className="h-24 w-full rounded bg-muted" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
