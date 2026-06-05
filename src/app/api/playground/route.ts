import bcrypt from "bcryptjs";
import { and, eq, like, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  companyOptimizationProfiles,
  fleets,
  users,
  vehicleFleets,
  vehicles,
} from "@/db/schema";
import { getAuthenticatedUser } from "@/lib/auth/auth-api";
import { isAdmin } from "@/lib/auth/authorization";
import { setTenantContext } from "@/lib/infra/tenant";
import {
  capacitiesForProfile,
  DEFAULT_MAX_ORDERS,
  DEFAULT_WORKDAY_END,
  DEFAULT_WORKDAY_START,
  type GeoPoint,
  randomFullName,
  randomLicenseCategory,
  randomPhone,
  randomPlate,
  randomSlug,
  randomVehicleModel,
  TEST_DRIVER_PASSWORD,
  TEST_EMAIL_DOMAIN,
  TEST_PREFIX,
} from "@/lib/playground/fake-data";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";

/**
 * Dev-only playground for bulk-generating TEST fleets/vehicles/drivers, so the
 * optimizer can be exercised without filling forms one by one.
 *
 * Gated three ways: the NEXT_PUBLIC_ENABLE_PLAYGROUND env flag (off by default,
 * so it never reaches a real customer build), ADMIN_SISTEMA only, and the
 * standard tenant resolution. Everything created is TEST- tagged for one-click
 * cleanup — no DB migration, no special columns.
 */

const PLAYGROUND_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PLAYGROUND === "true";

const MAX_VEHICLES = 200;
const MAX_DRIVERS = 200;
const MAX_FLEETS = 50;

type TenantCtx = { companyId: string; userId: string };

async function guard(request: NextRequest): Promise<TenantCtx | NextResponse> {
  if (!PLAYGROUND_ENABLED) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser(request);
  } catch {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }
  if (!isAdmin(user)) {
    return NextResponse.json(
      { error: "El playground es solo para ADMIN_SISTEMA" },
      { status: 403 },
    );
  }
  const tenantCtx = extractTenantContextAuthed(request, user);
  if (tenantCtx instanceof NextResponse) return tenantCtx;
  setTenantContext(tenantCtx);
  return tenantCtx;
}

/** Which capacity dimensions the company's profile has enabled. */
async function getProfileFlags(companyId: string) {
  const [profile] = await db
    .select()
    .from(companyOptimizationProfiles)
    .where(eq(companyOptimizationProfiles.companyId, companyId))
    .limit(1);
  return {
    enableWeight: profile?.enableWeight ?? true,
    enableVolume: profile?.enableVolume ?? true,
    enableUnits: profile?.enableUnits ?? false,
    enableOrderValue: profile?.enableOrderValue ?? false,
  };
}

/** GET — how much test data currently exists (for the UI summary). */
export async function GET(request: NextRequest) {
  const ctx = await guard(request);
  if (ctx instanceof NextResponse) return ctx;

  const count = sql<number>`count(*)::int`;
  const [v, d, f] = await Promise.all([
    db
      .select({ count })
      .from(vehicles)
      .where(
        and(
          eq(vehicles.companyId, ctx.companyId),
          like(vehicles.name, `${TEST_PREFIX}%`),
        ),
      ),
    db
      .select({ count })
      .from(users)
      .where(
        and(
          eq(users.companyId, ctx.companyId),
          like(users.email, `%@${TEST_EMAIL_DOMAIN}`),
        ),
      ),
    db
      .select({ count })
      .from(fleets)
      .where(
        and(
          eq(fleets.companyId, ctx.companyId),
          like(fleets.name, `${TEST_PREFIX}%`),
        ),
      ),
  ]);

  const profile = await getProfileFlags(ctx.companyId);

  return NextResponse.json({
    data: {
      vehicles: v[0]?.count ?? 0,
      drivers: d[0]?.count ?? 0,
      fleets: f[0]?.count ?? 0,
      driverPassword: TEST_DRIVER_PASSWORD,
      profile,
    },
  });
}

interface GenerateBody {
  fleets?: number;
  drivers?: number;
  origins?: GeoPoint[];
  maxOrders?: number;
  workdayStart?: string;
  workdayEnd?: string;
  weightCapacity?: number | null;
  volumeCapacity?: number | null;
  maxUnitsCapacity?: number | null;
  maxValueCapacity?: number | null;
}

/** POST — generate fleets + drivers + vehicles for the company. */
export async function POST(request: NextRequest) {
  const ctx = await guard(request);
  if (ctx instanceof NextResponse) return ctx;

  const body = (await request.json()) as GenerateBody;
  const origins = Array.isArray(body.origins) ? body.origins : [];
  const fleetCount = Math.min(
    Math.max(Math.trunc(body.fleets ?? 1), 1),
    MAX_FLEETS,
  );
  const driverCount = Math.min(
    Math.max(Math.trunc(body.drivers ?? origins.length), 1),
    MAX_DRIVERS,
  );

  if (origins.length === 0) {
    return NextResponse.json(
      { error: "Colocá al menos un vehículo en el mapa" },
      { status: 400 },
    );
  }
  if (origins.length > MAX_VEHICLES) {
    return NextResponse.json(
      { error: `Máximo ${MAX_VEHICLES} vehículos por tanda` },
      { status: 400 },
    );
  }
  if (
    origins.some(
      (p) =>
        typeof p?.lat !== "number" ||
        typeof p?.lng !== "number" ||
        Number.isNaN(p.lat) ||
        Number.isNaN(p.lng),
    )
  ) {
    return NextResponse.json(
      { error: "Coordenadas inválidas" },
      { status: 400 },
    );
  }

  const capProfile = await getProfileFlags(ctx.companyId);
  // Capacities + params come from the request (the user sets them in the UI),
  // applied uniformly to every generated vehicle. capacitiesForProfile keeps
  // disabled dimensions null and falls back to sensible defaults.
  const caps = capacitiesForProfile(capProfile, {
    weight: body.weightCapacity,
    volume: body.volumeCapacity,
    units: body.maxUnitsCapacity,
    value: body.maxValueCapacity,
  });
  const maxOrders = Math.min(
    Math.max(Math.trunc(body.maxOrders ?? DEFAULT_MAX_ORDERS), 1),
    9999,
  );
  const workdayStart = body.workdayStart || DEFAULT_WORKDAY_START;
  const workdayEnd = body.workdayEnd || DEFAULT_WORKDAY_END;

  const passwordHash = await bcrypt.hash(TEST_DRIVER_PASSWORD, 10);
  const licenseExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  try {
    const result = await db.transaction(async (tx) => {
      // Fleets
      const fleetRows = await tx
        .insert(fleets)
        .values(
          Array.from({ length: fleetCount }, (_, i) => ({
            companyId: ctx.companyId,
            name: `${TEST_PREFIX}Flota ${i + 1}`,
            description: "Generada por el playground de datos de prueba",
            type: "LIGHT_LOAD" as const,
          })),
        )
        .returning({ id: fleets.id });

      // Drivers (CONDUCTOR users). Index in code + random slug guarantees the
      // unique email/username constraints can't collide within or across runs.
      const driverRows = await tx
        .insert(users)
        .values(
          Array.from({ length: driverCount }, (_, i) => {
            const slug = `${i + 1}_${randomSlug()}`;
            return {
              companyId: ctx.companyId,
              name: `${TEST_PREFIX}${randomFullName()}`,
              email: `test_${slug}@${TEST_EMAIL_DOMAIN}`,
              username: `test_${slug}`,
              password: passwordHash,
              role: "CONDUCTOR" as const,
              phone: randomPhone(),
              identification: randomSlug().toUpperCase(),
              licenseNumber: randomSlug().toUpperCase(),
              licenseCategories: randomLicenseCategory(),
              licenseExpiry,
              driverStatus: "AVAILABLE" as const,
              primaryFleetId: fleetRows[i % fleetRows.length].id,
              active: true,
            };
          }),
        )
        .returning({ id: users.id });

      // Vehicles — one per placed origin.
      const vehicleRows = await tx
        .insert(vehicles)
        .values(
          origins.map((origin, i) => {
            const { brand, model } = randomVehicleModel();
            const plate = randomPlate();
            return {
              companyId: ctx.companyId,
              name: plate, // TEST- prefixed → used for cleanup
              plate,
              brand,
              model,
              maxOrders,
              weightCapacity: caps.weightCapacity,
              volumeCapacity: caps.volumeCapacity,
              maxUnitsCapacity: caps.maxUnitsCapacity,
              maxValueCapacity: caps.maxValueCapacity,
              workdayStart,
              workdayEnd,
              originLatitude: origin.lat.toFixed(6),
              originLongitude: origin.lng.toFixed(6),
              originAddress: `${TEST_PREFIX}origen ${i + 1}`,
              assignedDriverId: driverRows[i % driverRows.length].id,
              licenseRequired: randomLicenseCategory(),
              status: "AVAILABLE" as const,
              active: true,
            };
          }),
        )
        .returning({ id: vehicles.id });

      // Vehicle ↔ fleet links (round-robin across the created fleets).
      await tx.insert(vehicleFleets).values(
        vehicleRows.map((v, i) => ({
          companyId: ctx.companyId,
          vehicleId: v.id,
          fleetId: fleetRows[i % fleetRows.length].id,
        })),
      );

      return {
        fleets: fleetRows.length,
        drivers: driverRows.length,
        vehicles: vehicleRows.length,
      };
    });

    return NextResponse.json({
      data: { ...result, driverPassword: TEST_DRIVER_PASSWORD },
    });
  } catch (error) {
    console.error("Playground generate failed:", error);
    return NextResponse.json(
      { error: "No se pudieron generar los datos de prueba" },
      { status: 500 },
    );
  }
}

/** DELETE — remove every TEST- tagged record for this company. */
export async function DELETE(request: NextRequest) {
  const ctx = await guard(request);
  if (ctx instanceof NextResponse) return ctx;

  try {
    await db.transaction(async (tx) => {
      // Vehicles first — cascades vehicle_fleets via the FK onDelete.
      await tx
        .delete(vehicles)
        .where(
          and(
            eq(vehicles.companyId, ctx.companyId),
            like(vehicles.name, `${TEST_PREFIX}%`),
          ),
        );
      await tx
        .delete(users)
        .where(
          and(
            eq(users.companyId, ctx.companyId),
            like(users.email, `%@${TEST_EMAIL_DOMAIN}`),
          ),
        );
      await tx
        .delete(fleets)
        .where(
          and(
            eq(fleets.companyId, ctx.companyId),
            like(fleets.name, `${TEST_PREFIX}%`),
          ),
        );
    });

    return NextResponse.json({ data: { cleaned: true } });
  } catch (error) {
    console.error("Playground cleanup failed:", error);
    return NextResponse.json(
      { error: "No se pudieron borrar los datos de prueba" },
      { status: 500 },
    );
  }
}
