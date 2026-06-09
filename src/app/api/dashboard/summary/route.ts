import { and, count, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { fleets, orders, USER_ROLES, users, vehicles } from "@/db/schema";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { setTenantContext } from "@/lib/infra/tenant";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";

const INTAKE_DAYS = 14;

/** Trailing 14-day intake window (UTC days) with per-day counts + 7d trend. */
function buildIntake(byDay: Map<string, number>) {
  const series: { label: string; value: number; emphasis?: boolean }[] = [];
  const now = new Date();
  for (let i = INTAKE_DAYS - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(now.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    series.push({ label: String(d.getUTCDate()), value: byDay.get(key) ?? 0 });
  }
  const last7 = series.slice(7).reduce((s, x) => s + x.value, 0);
  const prior7 = series.slice(0, 7).reduce((s, x) => s + x.value, 0);
  const trendPct =
    prior7 > 0
      ? Math.round(((last7 - prior7) / prior7) * 100)
      : last7 > 0
        ? 100
        : 0;
  const total = series.reduce((s, x) => s + x.value, 0);
  if (series.length > 0) series[series.length - 1].emphasis = true;
  return { series, trendPct, total };
}

/**
 * Dashboard summary, scoped to the caller's effective company. Unlike a
 * server component, this respects the client-selected company (x-company-id
 * header, validated against the JWT) so ADMIN_SISTEMA sees the company they
 * switched to — not just their JWT companyId.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireRoutePermission(
    request,
    EntityType.METRICS,
    Action.READ,
  );
  if (authResult instanceof NextResponse) return authResult;
  const tenantCtx = extractTenantContextAuthed(request, authResult);
  if (tenantCtx instanceof NextResponse) return tenantCtx;
  setTenantContext(tenantCtx);
  const companyId = tenantCtx.companyId;

  const [
    [orderStats],
    [driverStats],
    [vehicleStats],
    [fleetStats],
    intakeRows,
    recentOrders,
    driversWithFleets,
  ] = await Promise.all([
    db
      .select({
        total: count(),
        pending: sql<number>`count(*) filter (where ${orders.status} = 'PENDING')::int`,
        assigned: sql<number>`count(*) filter (where ${orders.status} = 'ASSIGNED')::int`,
        inProgress: sql<number>`count(*) filter (where ${orders.status} = 'IN_PROGRESS')::int`,
        completed: sql<number>`count(*) filter (where ${orders.status} = 'COMPLETED')::int`,
        failed: sql<number>`count(*) filter (where ${orders.status} = 'FAILED')::int`,
        cancelled: sql<number>`count(*) filter (where ${orders.status} = 'CANCELLED')::int`,
      })
      .from(orders)
      .where(and(eq(orders.companyId, companyId), eq(orders.active, true))),
    db
      .select({
        total: count(),
        available: sql<number>`count(*) filter (where ${users.driverStatus} = 'AVAILABLE')::int`,
        inRoute: sql<number>`count(*) filter (where ${users.driverStatus} = 'IN_ROUTE')::int`,
        assigned: sql<number>`count(*) filter (where ${users.driverStatus} = 'ASSIGNED')::int`,
      })
      .from(users)
      .where(
        and(
          eq(users.companyId, companyId),
          eq(users.active, true),
          eq(users.role, USER_ROLES.CONDUCTOR),
        ),
      ),
    db
      .select({
        total: count(),
        available: sql<number>`count(*) filter (where ${vehicles.status} = 'AVAILABLE')::int`,
        assigned: sql<number>`count(*) filter (where ${vehicles.status} = 'ASSIGNED')::int`,
        maintenance: sql<number>`count(*) filter (where ${vehicles.status} = 'IN_MAINTENANCE')::int`,
      })
      .from(vehicles)
      .where(and(eq(vehicles.companyId, companyId), eq(vehicles.active, true))),
    db
      .select({ total: count() })
      .from(fleets)
      .where(and(eq(fleets.companyId, companyId), eq(fleets.active, true))),
    db.execute(sql`
      select to_char(date_trunc('day', ${orders.createdAt}), 'YYYY-MM-DD') as day,
             count(*)::int as total
      from ${orders}
      where ${orders.companyId} = ${companyId}
        and ${orders.active} = true
        and ${orders.createdAt} >= now() - interval '${sql.raw(String(INTAKE_DAYS))} days'
      group by 1
    `) as unknown as Promise<Array<{ day: string; total: number }>>,
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
      .limit(6),
    db.query.users.findMany({
      where: and(
        eq(users.companyId, companyId),
        eq(users.active, true),
        eq(users.role, USER_ROLES.CONDUCTOR),
      ),
      with: { primaryFleet: true },
      limit: 6,
      orderBy: sql`${users.updatedAt} desc`,
    }),
  ]);

  const intakeByDay = new Map(
    intakeRows.map((r) => [r.day, Number(r.total)] as const),
  );

  return NextResponse.json({
    data: {
      orders: {
        total: orderStats?.total ?? 0,
        pending: Number(orderStats?.pending) || 0,
        assigned: Number(orderStats?.assigned) || 0,
        inProgress: Number(orderStats?.inProgress) || 0,
        completed: Number(orderStats?.completed) || 0,
        failed: Number(orderStats?.failed) || 0,
        cancelled: Number(orderStats?.cancelled) || 0,
      },
      drivers: {
        total: driverStats?.total ?? 0,
        available: Number(driverStats?.available) || 0,
        inRoute: Number(driverStats?.inRoute) || 0,
        assigned: Number(driverStats?.assigned) || 0,
      },
      vehicles: {
        total: vehicleStats?.total ?? 0,
        available: Number(vehicleStats?.available) || 0,
        assigned: Number(vehicleStats?.assigned) || 0,
        maintenance: Number(vehicleStats?.maintenance) || 0,
      },
      fleetCount: fleetStats?.total ?? 0,
      intake: buildIntake(intakeByDay),
      recentOrders,
      activeDrivers: driversWithFleets.map((d) => ({
        id: d.id,
        name: d.name,
        status: d.driverStatus || "AVAILABLE",
        fleetName: d.primaryFleet?.name || "Sin flota",
      })),
    },
  });
}
