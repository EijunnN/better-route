import { 
  Package, 
  Truck, 
  Users, 
  Route, 
  TrendingUp, 
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface MetricCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: React.ElementType;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant: 'chart1' | 'chart2' | 'chart3' | 'chart4' | 'chart5';
}

const variantStyles = {
  chart1: 'bg-[hsl(var(--chart-1))]/10 text-[hsl(var(--chart-1))]',
  chart2: 'bg-[hsl(var(--chart-2))]/10 text-[hsl(var(--chart-2))]',
  chart3: 'bg-[hsl(var(--chart-3))]/10 text-[hsl(var(--chart-3))]',
  chart4: 'bg-[hsl(var(--chart-4))]/10 text-[hsl(var(--chart-4))]',
  chart5: 'bg-[hsl(var(--chart-5))]/10 text-[hsl(var(--chart-5))]',
};

const iconBgStyles = {
  chart1: 'bg-[hsl(var(--chart-1))]',
  chart2: 'bg-[hsl(var(--chart-2))]',
  chart3: 'bg-[hsl(var(--chart-3))]',
  chart4: 'bg-[hsl(var(--chart-4))]',
  chart5: 'bg-[hsl(var(--chart-5))]',
};

function MetricCard({ title, value, description, icon: Icon, trend, variant }: MetricCardProps) {
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
            <span className={`flex items-center font-medium ${trend.isPositive ? 'text-[hsl(var(--chart-2))]' : 'text-destructive'}`}>
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

interface RecentOrderProps {
  id: string;
  client: string;
  address: string;
  status: 'pending' | 'assigned' | 'in_progress' | 'completed';
  time: string;
}

function RecentOrderItem({ client, address, status, time }: RecentOrderProps) {
  const statusConfig = {
    pending: { label: 'Pendiente', variant: 'secondary' as const },
    assigned: { label: 'Asignado', variant: 'default' as const },
    in_progress: { label: 'En Ruta', variant: 'default' as const },
    completed: { label: 'Completado', variant: 'secondary' as const },
  };

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Package className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-medium">{client}</p>
          <p className="text-sm text-muted-foreground">{address}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant={statusConfig[status].variant}>
          {statusConfig[status].label}
        </Badge>
        <span className="text-sm text-muted-foreground">{time}</span>
      </div>
    </div>
  );
}

interface ActiveDriverProps {
  name: string;
  vehicle: string;
  stops: number;
  completed: number;
  status: 'active' | 'idle' | 'returning';
}

function ActiveDriverItem({ name, vehicle, stops, completed, status }: ActiveDriverProps) {
  const progress = stops > 0 ? Math.round((completed / stops) * 100) : 0;
  
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--chart-2))]/10">
          <Users className="h-5 w-5 text-[hsl(var(--chart-2))]" />
        </div>
        <div>
          <p className="font-medium">{name}</p>
          <p className="text-sm text-muted-foreground">{vehicle}</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium">{completed}/{stops} paradas</p>
          <div className="mt-1 h-1.5 w-20 rounded-full bg-muted">
            <div 
              className="h-full rounded-full bg-[hsl(var(--chart-2))] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <Badge variant={status === 'active' ? 'default' : 'secondary'}>
          {status === 'active' ? 'Activo' : status === 'idle' ? 'Disponible' : 'Regresando'}
        </Badge>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const metrics = {
    ordersToday: 156,
    ordersTrend: 12,
    activeDrivers: 24,
    driversTrend: 8,
    vehiclesInRoute: 18,
    vehiclesTrend: -5,
    completionRate: 94,
    completionTrend: 3,
  };

  const recentOrders: RecentOrderProps[] = [
    { id: '1', client: 'Farmacia San Pablo', address: 'Av. Insurgentes Sur 1234', status: 'in_progress', time: '10:30' },
    { id: '2', client: 'Tienda OXXO', address: 'Calle Reforma 567', status: 'assigned', time: '10:15' },
    { id: '3', client: 'Restaurante El Rincón', address: 'Blvd. Miguel Hidalgo 890', status: 'pending', time: '10:00' },
    { id: '4', client: 'Hospital Central', address: 'Av. Universidad 234', status: 'completed', time: '09:45' },
  ];

  const activeDrivers: ActiveDriverProps[] = [
    { name: 'Juan Pérez', vehicle: 'Toyota Hilux - ABC-123', stops: 12, completed: 8, status: 'active' },
    { name: 'María García', vehicle: 'Ford Transit - XYZ-789', stops: 15, completed: 15, status: 'returning' },
    { name: 'Carlos López', vehicle: 'Chevrolet S10 - DEF-456', stops: 10, completed: 3, status: 'active' },
  ];

  return (
    <div className="space-y-6">
        {/* Metrics Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Pedidos Hoy"
            value={metrics.ordersToday}
            description="vs. ayer"
            icon={Package}
            trend={{ value: metrics.ordersTrend, isPositive: true }}
            variant="chart1"
          />
          <MetricCard
            title="Conductores Activos"
            value={metrics.activeDrivers}
            description="de 30 disponibles"
            icon={Users}
            trend={{ value: metrics.driversTrend, isPositive: true }}
            variant="chart2"
          />
          <MetricCard
            title="Vehículos en Ruta"
            value={metrics.vehiclesInRoute}
            description="de 25 operativos"
            icon={Truck}
            trend={{ value: metrics.vehiclesTrend, isPositive: false }}
            variant="chart3"
          />
          <MetricCard
            title="Tasa de Cumplimiento"
            value={`${metrics.completionRate}%`}
            description="en tiempo"
            icon={CheckCircle2}
            trend={{ value: metrics.completionTrend, isPositive: true }}
            variant="chart4"
          />
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-3">
          <Link href="/orders">
            <Card className="cursor-pointer transition-all hover:border-primary hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-6">
                <div className={`rounded-xl p-3 ${iconBgStyles.chart1}`}>
                  <Package className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold">Gestionar Pedidos</h3>
                  <p className="text-sm text-muted-foreground">Crear y editar pedidos</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/optimization">
            <Card className="cursor-pointer transition-all hover:border-primary hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-6">
                <div className={`rounded-xl p-3 ${iconBgStyles.chart2}`}>
                  <Route className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold">Optimizar Rutas</h3>
                  <p className="text-sm text-muted-foreground">Generar plan óptimo</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/monitoring">
            <Card className="cursor-pointer transition-all hover:border-primary hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-6">
                <div className={`rounded-xl p-3 ${iconBgStyles.chart4}`}>
                  <TrendingUp className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold">Monitorear</h3>
                  <p className="text-sm text-muted-foreground">Ver estado en tiempo real</p>
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
              <div className="divide-y divide-border">
                {recentOrders.map((order) => (
                  <RecentOrderItem key={order.id} {...order} />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Active Drivers */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Conductores Activos</CardTitle>
                <CardDescription>Estado actual de las rutas</CardDescription>
              </div>
              <Link href="/monitoring">
                <Button variant="outline" size="sm">
                  Ver mapa
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border">
                {activeDrivers.map((driver, index) => (
                  <ActiveDriverItem key={index} {...driver} />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Alerts Section */}
        <Card className="border-[hsl(var(--chart-5))]/30 bg-[hsl(var(--chart-5))]/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[hsl(var(--chart-5))]" />
              <CardTitle className="text-[hsl(var(--chart-5))]">Alertas Activas</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="flex items-center gap-3 rounded-lg bg-card p-3 border border-border">
                <Clock className="h-5 w-5 text-[hsl(var(--chart-5))]" />
                <div>
                  <p className="font-medium">3 entregas retrasadas</p>
                  <p className="text-sm text-muted-foreground">Revisar asignaciones</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-card p-3 border border-border">
                <Truck className="h-5 w-5 text-[hsl(var(--chart-5))]" />
                <div>
                  <p className="font-medium">2 vehículos en mantenimiento</p>
                  <p className="text-sm text-muted-foreground">Hasta mañana</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-card p-3 border border-border">
                <Users className="h-5 w-5 text-[hsl(var(--chart-5))]" />
                <div>
                  <p className="font-medium">1 conductor sin ruta</p>
                  <p className="text-sm text-muted-foreground">Disponible para asignar</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
    </div>
  );
}
