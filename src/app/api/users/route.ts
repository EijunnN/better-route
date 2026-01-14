import bcrypt from "bcryptjs";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { fleets, users } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { logCreate } from "@/lib/audit";
import { setTenantContext } from "@/lib/tenant";
import {
  createUserSchema,
  isExpired,
  userQuerySchema,
} from "@/lib/validations/user";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");

  if (!companyId) {
    return null;
  }

  return {
    companyId,
    userId: userId || undefined,
  };
}

function getLicenseStatusFilter(licenseStatus: string) {
  const today = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(today.getDate() + 30);

  switch (licenseStatus) {
    case "valid":
      return sql`${users.licenseExpiry} > ${thirtyDaysFromNow}`;
    case "expiring_soon":
      return sql`${users.licenseExpiry} >= ${today} AND ${users.licenseExpiry} <= ${thirtyDaysFromNow}`;
    case "expired":
      return sql`${users.licenseExpiry} < ${today}`;
    default:
      return undefined;
  }
}

export async function GET(request: NextRequest) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const { searchParams } = new URL(request.url);
    const query = userQuerySchema.parse(Object.fromEntries(searchParams));

    const conditions = [];

    // Filter by role
    if (query.role) {
      conditions.push(eq(users.role, query.role));
    }

    // Filter by driver status (only for conductors)
    if (query.driverStatus) {
      conditions.push(eq(users.driverStatus, query.driverStatus));
    }

    // Filter by primary fleet
    if (query.primaryFleetId) {
      conditions.push(eq(users.primaryFleetId, query.primaryFleetId));
    }

    // Filter by license status
    if (query.licenseStatus) {
      const licenseFilter = getLicenseStatusFilter(query.licenseStatus);
      if (licenseFilter) {
        conditions.push(licenseFilter);
      }
    }

    // Filter by certifications
    if (query.hasCertifications !== undefined) {
      if (query.hasCertifications) {
        conditions.push(
          sql`${users.certifications} IS NOT NULL AND ${users.certifications} != ''`,
        );
      } else {
        conditions.push(
          sql`${users.certifications} IS NULL OR ${users.certifications} = ''`,
        );
      }
    }

    // Filter by active status
    if (query.active !== undefined) {
      conditions.push(eq(users.active, query.active));
    }

    // Search by name, email, or username
    if (query.search) {
      const searchTerm = `%${query.search}%`;
      const searchCondition = or(
        ilike(users.name, searchTerm),
        ilike(users.email, searchTerm),
        ilike(users.username, searchTerm),
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    // Apply tenant filtering - filter out any undefined values
    const validConditions = conditions.filter((c): c is NonNullable<typeof c> => c !== undefined);
    const whereClause = withTenantFilter(users, validConditions);

    const [data, totalResult] = await Promise.all([
      db
        .select({
          id: users.id,
          companyId: users.companyId,
          name: users.name,
          email: users.email,
          username: users.username,
          role: users.role,
          phone: users.phone,
          identification: users.identification,
          birthDate: users.birthDate,
          photo: users.photo,
          licenseNumber: users.licenseNumber,
          licenseExpiry: users.licenseExpiry,
          licenseCategories: users.licenseCategories,
          certifications: users.certifications,
          driverStatus: users.driverStatus,
          primaryFleetId: users.primaryFleetId,
          active: users.active,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(whereClause)
        .orderBy(desc(users.createdAt))
        .limit(query.limit)
        .offset(query.offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(whereClause),
    ]);

    return NextResponse.json({
      data,
      meta: {
        total: Number(totalResult[0]?.count ?? 0),
        limit: query.limit,
        offset: query.offset,
      },
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json(
      { error: "Error fetching users" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const body = await request.json();
    const validatedData = createUserSchema.parse(body);

    // Check for duplicate email within the same company
    const existingEmail = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.companyId, tenantCtx.companyId),
          eq(users.email, validatedData.email),
        ),
      )
      .limit(1);

    if (existingEmail.length > 0) {
      return NextResponse.json(
        { error: "Ya existe un usuario con este correo en la empresa" },
        { status: 400 },
      );
    }

    // Check for duplicate username within the same company
    const existingUsername = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.companyId, tenantCtx.companyId),
          eq(users.username, validatedData.username),
        ),
      )
      .limit(1);

    if (existingUsername.length > 0) {
      return NextResponse.json(
        {
          error:
            "Ya existe un usuario con este nombre de usuario en la empresa",
        },
        { status: 400 },
      );
    }

    // Check for duplicate identification if role is CONDUCTOR
    if (validatedData.role === "CONDUCTOR" && validatedData.identification) {
      const existingIdentification = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.companyId, tenantCtx.companyId),
            eq(users.identification, validatedData.identification),
          ),
        )
        .limit(1);

      if (existingIdentification.length > 0) {
        return NextResponse.json(
          {
            error:
              "Ya existe un conductor con esta identificación en la empresa",
          },
          { status: 400 },
        );
      }
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(validatedData.password, 10);

    // Auto-set driver status to UNAVAILABLE if license is expired
    let finalDriverStatus = validatedData.driverStatus;
    if (validatedData.role === "CONDUCTOR" && validatedData.licenseExpiry) {
      if (isExpired(validatedData.licenseExpiry)) {
        finalDriverStatus = "UNAVAILABLE";
      } else if (!finalDriverStatus) {
        finalDriverStatus = "AVAILABLE";
      }
    }

    const [newUser] = await db
      .insert(users)
      .values({
        companyId: tenantCtx.companyId,
        name: validatedData.name,
        email: validatedData.email,
        username: validatedData.username,
        password: hashedPassword,
        role: validatedData.role,
        phone: validatedData.phone,
        identification: validatedData.identification,
        birthDate: validatedData.birthDate
          ? new Date(validatedData.birthDate)
          : null,
        photo: validatedData.photo,
        licenseNumber: validatedData.licenseNumber,
        licenseExpiry: validatedData.licenseExpiry
          ? new Date(validatedData.licenseExpiry)
          : null,
        licenseCategories: validatedData.licenseCategories,
        certifications: validatedData.certifications,
        driverStatus: finalDriverStatus,
        primaryFleetId: validatedData.primaryFleetId,
        active: validatedData.active,
        updatedAt: new Date(),
      })
      .returning({
        id: users.id,
        companyId: users.companyId,
        name: users.name,
        email: users.email,
        username: users.username,
        role: users.role,
        phone: users.phone,
        identification: users.identification,
        birthDate: users.birthDate,
        photo: users.photo,
        licenseNumber: users.licenseNumber,
        licenseExpiry: users.licenseExpiry,
        licenseCategories: users.licenseCategories,
        certifications: users.certifications,
        driverStatus: users.driverStatus,
        primaryFleetId: users.primaryFleetId,
        active: users.active,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });

    // Log creation
    await logCreate("user", newUser.id, newUser);

    return NextResponse.json(newUser, { status: 201 });
  } catch (error: any) {
    console.error("Error creating user:", error);
    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Error creating user" }, { status: 500 });
  }
}
