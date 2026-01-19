import { and, count, eq, sql } from "drizzle-orm";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Package,
  Route,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db";
import { orders, USER_ROLES, users, vehicles } from "@/db/schema";
import { getCompanyId } from "@/lib/server-cache";

interface MetricCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: React.ElementType;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant: "chart1" | "chart2" | "chart3" | "chart4" | "chart5";
}

const variantStyles = {
  chart1: "bg-[hsl(var(--chart-1))]/10 text-[hsl(var(--chart-1))]",
  chart2: "bg-[hsl(var(--chart-2))]/10 text-[hsl(var(--chart-2))]",
  chart3: "bg-[hsl(var(--chart-3))]/10 text-[hsl(var(--chart-3))]",
  chart4: "bg-[hsl(var(--chart-4))]/10 text-[hsl(var(--chart-4))]",
  chart5: "bg-[hsl(var(--chart-5))]/10 text-[hsl(var(--chart-5))]",
};

const iconBgStyles = {
  chart1: "bg-[hsl(var(--chart-1))]",
  chart2: "bg-[hsl(var(--chart-2))]",
  chart3: "bg-[hsl(var(--chart-3))]",
  chart4: "bg-[hsl(var(--chart-4))]",
  chart5: "bg-[hsl(var(--chart-5))]",
};

function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  variant,
}: MetricCardProps) {
  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className={`rounded-lg p-2 ${variantStyles[variant]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {trend && (
            <span
              className={`flex items-center font-medium ${trend.isPositive ? "text-[hsl(var(--chart-2))]" : "text-destructive"}`}
            >
              {trend.isPositive ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {Math.abs(trend.value)}%
            </span>
          )}
          <span>{description}</span>
        </div>
      </CardContent>
    </Card>
  );
}

interface OrderItemProps {
  trackingId: string;
  customerName: string | null;
  address: string;
  status: string;
}

function RecentOrderItem({
  trackingId,
  customerName,
  address,
  status,
}: OrderItemProps) {
  const statusConfig: Record<
    string,
    { label: string; variant: "default" | "secondary" | "destructive" }
  > = {
    PENDING: { label: "Pendiente", variant: "secondary" },
    ASSIGNED: { label: "Asignado", variant: "default" },
    IN_PROGRESS: { label: "En Ruta", variant: "default" },
    COMPLETED: { label: "Completado", variant: "secondary" },
    FAILED: { label: "Fallido", variant: "destructive" },
    CANCELLED: { label: "Cancelado", variant: "secondary" },
  };

  const config = statusConfig[status] || {
    label: status,
    variant: "secondary" as const,
  };

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Package className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-medium">{customerName || trackingId}</p>
          <p className="text-sm text-muted-foreground line-clamp-1">
            {address}
          </p>
        </div>
      </div>
      <Badge variant={config.variant}>{config.label}</Badge>
    </div>
  );
}

interface DriverItemProps {
  id: string;
  name: string;
  status: string;
  fleetName: string;
}

function ActiveDriverItem({
  id: _id,
  name,
  status,
  fleetName,
}: DriverItemProps) {
  const statusConfig: Record<string, { label: string; color: string }> = {
    AVAILABLE: { label: "Disponible", color: "bg-[hsl(var(--chart-2))]" },
    ASSIGNED: { label: "Asignado", color: "bg-[hsl(var(--chart-3))]" },
    IN_ROUTE: { label: "En Ruta", color: "bg-[hsl(var(--chart-1))]" },
    ON_PAUSE: { label: "En Pausa", color: "bg-[hsl(var(--chart-4))]" },
    COMPLETED: { label: "Completado", color: "bg-[hsl(var(--chart-2))]" },
    UNAVAILABLE: { label: "No Disponible", color: "bg-muted" },
    ABSENT: { label: "Ausente", color: "bg-destructive" },
  };

  const config = statusConfig[status] || { label: status, color: "bg-muted" };

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--chart-2))]/10">
          <Users className="h-5 w-5 text-[hsl(var(--chart-2))]" />
        </div>
        <div>
          <p className="font-medium">{name}</p>
          <p className="text-sm text-muted-foreground">{fleetName}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${config.color}`} />
        <span className="text-sm text-muted-foreground">{config.label}</span>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const companyId = await getCompanyId();

  // Datos por defecto si no hay sesión
  let metrics = {
    totalOrders: 0,
    pendingOrders: 0,
    activeDrivers: 0,
    totalDrivers: 0,
    vehiclesInRoute: 0,
    totalVehicles: 0,
    completedOrders: 0,
  };

  let recentOrders: OrderItemProps[] = [];
  let activeDriversList: DriverItemProps[] = [];

  if (companyId) {
    // Execute all queries in parallel for better performance
    const [
      [orderStats],
      [driverStats],
      [vehicleStats],
      recentOrdersData,
      driversWithFleets,
    ] = await Promise.all([
      // Obtener métricas de pedidos
      db
        .select({
          total: count(),
          pending: sql<number>`count(*) filter (where ${orders.status} = 'PENDING')`,
          completed: sql<number>`count(*) filter (where ${orders.status} = 'COMPLETED')`,
          inProgress: sql<number>`count(*) filter (where ${orders.status} = 'IN_PROGRESS')`,
        })
        .from(orders)
        .where(and(eq(orders.companyId, companyId), eq(orders.active, true))),
      // Obtener métricas de conductores (usuarios con rol CONDUCTOR)
      db
        .select({
          total: count(),
          available: sql<number>`count(*) filter (where ${users.driverStatus} = 'AVAILABLE')`,
          inRoute: sql<number>`count(*) filter (where ${users.driverStatus} = 'IN_ROUTE')`,
          assigned: sql<number>`count(*) filter (where ${users.driverStatus} = 'ASSIGNED')`,
        })
        .from(users)
        .where(
          and(
            eq(users.companyId, companyId),
            eq(users.active, true),
            eq(users.role, USER_ROLES.CONDUCTOR),
          ),
        ),
      // Obtener métricas de vehículos
      db
        .select({
          total: count(),
          available: sql<number>`count(*) filter (where ${vehicles.status} = 'AVAILABLE')`,
          assigned: sql<number>`count(*) filter (where ${vehicles.status} = 'ASSIGNED')`,
          maintenance: sql<number>`count(*) filter (where ${vehicles.status} = 'IN_MAINTENANCE')`,
        })
        .from(vehicles)
        .where(
          and(eq(vehicles.companyId, companyId), eq(vehicles.active, true)),
        ),
      // Obtener pedidos recientes
      db
        .select({
          trackingId: orders.trackingId,
          customerName: orders.customerName,
          address: orders.address,
          status: orders.status,
        })
        .from(orders)
        .where(and(eq(orders.companyId, companyId), eq(orders.active, true)))
        .orderBy(sql`${orders.createdAt} desc`)
        .limit(5),
      // Obtener conductores activos con sus flotas (usuarios con rol CONDUCTOR)
      db.query.users.findMany({
        where: and(
          eq(users.companyId, companyId),
          eq(users.active, true),
          eq(users.role, USER_ROLES.CONDUCTOR),
        ),
        with: {
          primaryFleet: true,
        },
        limit: 5,
        orderBy: sql`${users.updatedAt} desc`,
      }),
    ]);

    metrics = {
      totalOrders: orderStats?.total || 0,
      pendingOrders: Number(orderStats?.pending) || 0,
      activeDrivers:
        Number(driverStats?.inRoute) + Number(driverStats?.assigned) || 0,
      totalDrivers: driverStats?.total || 0,
      vehiclesInRoute: Number(vehicleStats?.assigned) || 0,
      totalVehicles: vehicleStats?.total || 0,
      completedOrders: Number(orderStats?.completed) || 0,
    };

    recentOrders = recentOrdersData;

    activeDriversList = driversWithFleets.map((d) => ({
      id: d.id,
      name: d.name,
      status: d.driverStatus || "AVAILABLE",
      fleetName: d.primaryFleet?.name || "Sin flota",
    }));
  }

  const completionRate =
    metrics.totalOrders > 0
      ? Math.round((metrics.completedOrders / metrics.totalOrders) * 100)
      : 0;

  return (
    <div className="space-y-2 p-4">
      {/* Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Pedidos Totales"
          value={metrics.totalOrders}
          description={`${metrics.pendingOrders} pendientes`}
          icon={Package}
          variant="chart1"
        />
        <MetricCard
          title="Conductores Activos"
          value={metrics.activeDrivers}
          description={`de ${metrics.totalDrivers} disponibles`}
          icon={Users}
          variant="chart2"
        />
        <MetricCard
          title="Vehículos Asignados"
          value={metrics.vehiclesInRoute}
          description={`de ${metrics.totalVehicles} operativos`}
          icon={Truck}
          variant="chart3"
        />
        <MetricCard
          title="Tasa de Cumplimiento"
          value={`${completionRate}%`}
          description={`${metrics.completedOrders} completados`}
          icon={CheckCircle2}
          variant="chart4"
        />
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/orders">
          <Card className="cursor-pointer transition-shadow hover:border-primary hover:shadow-md">
            <CardContent className="flex items-center gap-4 p-6">
              <div className={`rounded-xl p-3 ${iconBgStyles.chart1}`}>
                <Package className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-semibold">Gestionar Pedidos</h3>
                <p className="text-sm text-muted-foreground">
                  Crear y editar pedidos
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/planificacion">
          <Card className="cursor-pointer transition-shadow hover:border-primary hover:shadow-md">
            <CardContent className="flex items-center gap-4 p-6">
              <div className={`rounded-xl p-3 ${iconBgStyles.chart2}`}>
                <Route className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-semibold">Planificación</h3>
                <p className="text-sm text-muted-foreground">
                  Optimizar rutas de entrega
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/monitoring">
          <Card className="cursor-pointer transition-shadow hover:border-primary hover:shadow-md">
            <CardContent className="flex items-center gap-4 p-6">
              <div className={`rounded-xl p-3 ${iconBgStyles.chart4}`}>
                <TrendingUp className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-semibold">Monitorear</h3>
                <p className="text-sm text-muted-foreground">
                  Ver estado en tiempo real
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Orders */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Pedidos Recientes</CardTitle>
              <CardDescription>Últimos pedidos ingresados</CardDescription>
            </div>
            <Link href="/orders">
              <Button variant="outline" size="sm">
                Ver todos
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Package className="mx-auto h-12 w-12 opacity-50" />
                <p className="mt-2">No hay pedidos registrados</p>
                <Link href="/orders">
                  <Button variant="link" className="mt-2">
                    Crear primer pedido
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentOrders.map((order) => (
                  <RecentOrderItem key={order.trackingId} {...order} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Drivers */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Conductores</CardTitle>
              <CardDescription>Estado actual del equipo</CardDescription>
            </div>
            <Link href="/users">
              <Button variant="outline" size="sm">
                Ver todos
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {activeDriversList.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Users className="mx-auto h-12 w-12 opacity-50" />
                <p className="mt-2">No hay conductores registrados</p>
                <Link href="/users">
                  <Button variant="link" className="mt-2">
                    Agregar conductor
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {activeDriversList.map((driver) => (
                  <ActiveDriverItem key={driver.id} {...driver} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Info Section */}
      {metrics.totalOrders === 0 && (
        <Card className="border-[hsl(var(--chart-4))]/30 bg-[hsl(var(--chart-4))]/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[hsl(var(--chart-4))]" />
              <CardTitle className="text-[hsl(var(--chart-4))]">
                Primeros pasos
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              <Link
                href="/fleets"
                className="flex items-center gap-3 rounded-lg bg-card p-3 border border-border hover:border-primary transition-colors"
              >
                <Truck className="h-5 w-5 text-[hsl(var(--chart-4))]" />
                <div>
                  <p className="font-medium">1. Crear flotas</p>
                  <p className="text-sm text-muted-foreground">
                    Organiza tus vehículos
                  </p>
                </div>
              </Link>
              <Link
                href="/vehicles"
                className="flex items-center gap-3 rounded-lg bg-card p-3 border border-border hover:border-primary transition-colors"
              >
                <Truck className="h-5 w-5 text-[hsl(var(--chart-4))]" />
                <div>
                  <p className="font-medium">2. Agregar vehículos</p>
                  <p className="text-sm text-muted-foreground">
                    Registra tu flota
                  </p>
                </div>
              </Link>
              <Link
                href="/users"
                className="flex items-center gap-3 rounded-lg bg-card p-3 border border-border hover:border-primary transition-colors"
              >
                <Users className="h-5 w-5 text-[hsl(var(--chart-4))]" />
                <div>
                  <p className="font-medium">3. Agregar conductores</p>
                  <p className="text-sm text-muted-foreground">
                    Asigna tu equipo
                  </p>
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
