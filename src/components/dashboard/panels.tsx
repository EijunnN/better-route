import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Package,
  Route,
  Truck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { BarDatum } from "./charts";
import { IntakeAreaChart } from "./intake-area-chart";

// ── Order intake chart ──────────────────────────────────────────────────

export function IntakeChart({
  data,
  total,
}: {
  data: BarDatum[];
  total: number;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>Pedidos ingresados</CardTitle>
          <CardDescription>Últimos 14 días</CardDescription>
        </div>
        <div className="text-right">
          <div className="font-bold text-2xl tracking-tight tabular-nums">
            {total}
          </div>
          <div className="text-muted-foreground text-xs">en el período</div>
        </div>
      </CardHeader>
      <CardContent>
        <IntakeAreaChart data={data} />
      </CardContent>
    </Card>
  );
}

// ── Order status distribution ───────────────────────────────────────────

export interface StatusSlice {
  label: string;
  count: number;
  /** Tailwind `bg-*` class. */
  color: string;
}

export function StatusDistribution({ slices }: { slices: StatusSlice[] }) {
  const total = slices.reduce((s, x) => s + x.count, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Estado de pedidos</CardTitle>
        <CardDescription>{total} activos</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
          {total > 0 &&
            slices.map((s) =>
              s.count > 0 ? (
                <div
                  key={s.label}
                  className={s.color}
                  style={{ width: `${(s.count / total) * 100}%` }}
                  title={`${s.label}: ${s.count}`}
                />
              ) : null,
            )}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          {slices.map((s) => (
            <div key={s.label} className="flex items-center gap-2 text-sm">
              <span className={`size-2.5 shrink-0 rounded-full ${s.color}`} />
              <span className="truncate text-muted-foreground">{s.label}</span>
              <span className="ml-auto font-semibold tabular-nums">
                {s.count}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Recent orders ───────────────────────────────────────────────────────

const ORDER_STATUS: Record<string, { label: string; dot: string }> = {
  PENDING: { label: "Pendiente", dot: "bg-chart-5" },
  ASSIGNED: { label: "Asignado", dot: "bg-chart-2" },
  IN_PROGRESS: { label: "En ruta", dot: "bg-primary" },
  COMPLETED: { label: "Completado", dot: "bg-chart-3" },
  FAILED: { label: "Fallido", dot: "bg-destructive" },
  CANCELLED: { label: "Cancelado", dot: "bg-muted-foreground" },
};

export interface RecentOrder {
  trackingId: string;
  customerName: string | null;
  address: string;
  status: string;
}

export function RecentOrders({ orders }: { orders: RecentOrder[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Pedidos recientes</CardTitle>
          <CardDescription>Últimos ingresados</CardDescription>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/orders">Ver todos</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <EmptyRow
            icon={Package}
            text="Aún no hay pedidos"
            href="/orders"
            cta="Crear pedido"
          />
        ) : (
          <ul className="-my-1 divide-y divide-border">
            {orders.map((o) => {
              const cfg = ORDER_STATUS[o.status] ?? {
                label: o.status,
                dot: "bg-muted-foreground",
              };
              return (
                <li
                  key={o.trackingId}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Package className="size-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-sm">
                        {o.customerName || o.trackingId}
                      </p>
                      <p className="truncate text-muted-foreground text-xs">
                        {o.address}
                      </p>
                    </div>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground text-xs">
                    <span className={`size-2 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ── Active drivers ──────────────────────────────────────────────────────

const DRIVER_STATUS: Record<string, { label: string; dot: string }> = {
  AVAILABLE: { label: "Disponible", dot: "bg-chart-3" },
  ASSIGNED: { label: "Asignado", dot: "bg-chart-2" },
  IN_ROUTE: { label: "En ruta", dot: "bg-primary" },
  ON_PAUSE: { label: "En pausa", dot: "bg-chart-5" },
  COMPLETED: { label: "Completado", dot: "bg-chart-3" },
  UNAVAILABLE: { label: "No disponible", dot: "bg-muted-foreground" },
  ABSENT: { label: "Ausente", dot: "bg-destructive" },
};

export interface ActiveDriver {
  id: string;
  name: string;
  status: string;
  fleetName: string;
}

export function ActiveDrivers({ drivers }: { drivers: ActiveDriver[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Conductores</CardTitle>
          <CardDescription>Estado del equipo</CardDescription>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/users">Ver todos</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {drivers.length === 0 ? (
          <EmptyRow
            icon={Users}
            text="Aún no hay conductores"
            href="/users"
            cta="Agregar conductor"
          />
        ) : (
          <ul className="-my-1 divide-y divide-border">
            {drivers.map((d) => {
              const cfg = DRIVER_STATUS[d.status] ?? {
                label: d.status,
                dot: "bg-muted-foreground",
              };
              const initials = d.name
                .split(" ")
                .slice(0, 2)
                .map((p) => p[0])
                .join("")
                .toUpperCase();
              return (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-chart-2/15 font-semibold text-chart-2 text-xs">
                      {initials || "?"}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-sm">{d.name}</p>
                      <p className="truncate text-muted-foreground text-xs">
                        {d.fleetName}
                      </p>
                    </div>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground text-xs">
                    <span className={`size-2 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyRow({
  icon: Icon,
  text,
  href,
  cta,
}: {
  icon: React.ElementType;
  text: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border border-dashed px-4 py-6">
      <div className="flex items-center gap-3 text-muted-foreground text-sm">
        <Icon className="size-5 opacity-60" />
        {text}
      </div>
      <Button asChild variant="ghost" size="sm" className="text-primary">
        <Link href={href}>{cta}</Link>
      </Button>
    </div>
  );
}

// ── Getting started (empty-state onboarding with real progress) ─────────

export interface SetupCounts {
  fleets: number;
  vehicles: number;
  drivers: number;
  orders: number;
}

export function GettingStarted({ counts }: { counts: SetupCounts }) {
  const steps = [
    {
      icon: Route,
      title: "Crea tus flotas",
      description: "Agrupa los vehículos por tipo de operación.",
      href: "/fleets",
      done: counts.fleets > 0,
    },
    {
      icon: Truck,
      title: "Registra vehículos",
      description: "Capacidad, jornada y origen de cada unidad.",
      href: "/vehicles",
      done: counts.vehicles > 0,
    },
    {
      icon: Users,
      title: "Suma conductores",
      description: "Asigna tu equipo y sus habilidades.",
      href: "/users",
      done: counts.drivers > 0,
    },
    {
      icon: ClipboardList,
      title: "Carga pedidos",
      description: "Importa por CSV o créalos a mano.",
      href: "/orders",
      done: counts.orders > 0,
    },
  ];
  const completed = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done) ?? steps[steps.length - 1];

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[1.1fr_2fr]">
        {/* Hero */}
        <div className="relative flex flex-col justify-between gap-6 border-border/60 border-b bg-primary/[0.06] p-6 lg:border-r lg:border-b-0">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 font-medium text-primary text-xs">
              Configuración inicial
            </span>
            <h2 className="mt-3 font-bold text-2xl tracking-tight">
              Pongamos tu operación en marcha
            </h2>
            <p className="mt-2 text-muted-foreground text-sm">
              Completa estos pasos para empezar a optimizar rutas. Te toma unos
              minutos.
            </p>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progreso</span>
              <span className="font-semibold tabular-nums">
                {completed} / {steps.length}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(completed / steps.length) * 100}%` }}
              />
            </div>
            <Button asChild className="mt-4 w-full">
              <Link href={next.href}>
                {completed === 0 ? "Empezar" : "Continuar"}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Steps */}
        <div className="divide-y divide-border">
          {steps.map((s, i) => (
            <Link
              key={s.title}
              href={s.href}
              className="group flex items-center gap-4 p-4 transition-colors hover:bg-muted/40"
            >
              <div
                className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
                  s.done
                    ? "bg-chart-3/15 text-chart-3"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s.done ? (
                  <CheckCircle2 className="size-5" />
                ) : (
                  <s.icon className="size-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={`font-medium text-sm ${s.done ? "text-muted-foreground line-through" : ""}`}
                >
                  {i + 1}. {s.title}
                </p>
                <p className="truncate text-muted-foreground text-xs">
                  {s.description}
                </p>
              </div>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </Link>
          ))}
        </div>
      </div>
    </Card>
  );
}
