import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { fleets, users } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { logDelete, logUpdate } from "@/lib/infra/audit";
import { setTenantContext } from "@/lib/infra/tenant";
import { isExpired, updateUserSchema } from "@/lib/validations/user";

import { extractTenantContext } from "@/lib/routing/route-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const { id } = await params;

    const whereClause = withTenantFilter(
      users,
      [eq(users.id, id)],
      tenantCtx.companyId,
    );

    const [user] = await db
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
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // If user has a primary fleet, get fleet details
    let primaryFleet = null;
    if (user.primaryFleetId) {
      const [fleet] = await db
        .select({
          id: fleets.id,
          name: fleets.name,
        })
        .from(fleets)
        .where(eq(fleets.id, user.primaryFleetId))
        .limit(1);
      primaryFleet = fleet || null;
    }

    return NextResponse.json({ ...user, primaryFleet });
  } catch (error) {
    after(() => console.error("Error fetching user:", error));
    return NextResponse.json({ error: "Error fetching user" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const { id } = await params;
    const body = await request.json();

    const validatedData = updateUserSchema.parse({ ...body, id });

    // Check if user exists
    const whereClause = withTenantFilter(
      users,
      [eq(users.id, id)],
      tenantCtx.companyId,
    );
    const [existingUser] = await db
      .select()
      .from(users)
      .where(whereClause)
      .limit(1);

    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check for duplicate email if updating
    if (validatedData.email && validatedData.email !== existingUser.email) {
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
    }

    // Check for duplicate username if updating
    if (
      validatedData.username &&
      validatedData.username !== existingUser.username
    ) {
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
    }

    // Check for duplicate identification if updating (only for conductors)
    const newRole = validatedData.role || existingUser.role;
    if (
      newRole === "CONDUCTOR" &&
      validatedData.identification &&
      validatedData.identification !== existingUser.identification
    ) {
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

    // Prepare update data
    const updateData: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };

    // Add all validated fields to update data
    if (validatedData.name !== undefined) updateData.name = validatedData.name;
    if (validatedData.email !== undefined)
      updateData.email = validatedData.email;
    if (validatedData.username !== undefined)
      updateData.username = validatedData.username;
    if (validatedData.role !== undefined) {
      updateData.role = validatedData.role;
      // ADMIN_SISTEMA users should not have a companyId
      if (validatedData.role === "ADMIN_SISTEMA") {
        updateData.companyId = null;
      }
    }
    if (validatedData.phone !== undefined)
      updateData.phone = validatedData.phone;
    if (validatedData.identification !== undefined)
      updateData.identification = validatedData.identification;
    if (validatedData.birthDate !== undefined) {
      updateData.birthDate = validatedData.birthDate
        ? new Date(validatedData.birthDate)
        : null;
    }
    if (validatedData.photo !== undefined)
      updateData.photo = validatedData.photo;
    if (validatedData.licenseNumber !== undefined)
      updateData.licenseNumber = validatedData.licenseNumber;
    if (validatedData.licenseExpiry !== undefined) {
      updateData.licenseExpiry = validatedData.licenseExpiry
        ? new Date(validatedData.licenseExpiry)
        : null;
    }
    if (validatedData.licenseCategories !== undefined)
      updateData.licenseCategories = validatedData.licenseCategories;
    if (validatedData.certifications !== undefined)
      updateData.certifications = validatedData.certifications;
    if (validatedData.driverStatus !== undefined)
      updateData.driverStatus = validatedData.driverStatus;
    if (validatedData.primaryFleetId !== undefined)
      updateData.primaryFleetId = validatedData.primaryFleetId;
    if (validatedData.active !== undefined)
      updateData.active = validatedData.active;

    // Hash password if provided
    if (validatedData.password) {
      updateData.password = await bcrypt.hash(validatedData.password, 10);
    }

    // Auto-set driver status to UNAVAILABLE if license is expired
    const finalLicenseExpiry =
      updateData.licenseExpiry || existingUser.licenseExpiry;
    const finalRole = updateData.role || existingUser.role;
    if (
      finalRole === "CONDUCTOR" &&
      finalLicenseExpiry &&
      isExpired(finalLicenseExpiry.toISOString())
    ) {
      updateData.driverStatus = "UNAVAILABLE";
    }

    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(whereClause)
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

    // Log update (non-blocking)
    after(async () => {
      await logUpdate("user", id, { before: existingUser, after: updatedUser });
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    after(() => console.error("Error updating user:", error));
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        {
          error: "Invalid input",
          details: (error as { errors?: unknown }).errors,
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Error updating user" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const { id } = await params;

    const whereClause = withTenantFilter(
      users,
      [eq(users.id, id)],
      tenantCtx.companyId,
    );

    const [existingUser] = await db
      .select()
      .from(users)
      .where(whereClause)
      .limit(1);

    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Soft delete by setting active to false
    const [deletedUser] = await db
      .update(users)
      .set({ active: false, updatedAt: new Date() })
      .where(whereClause)
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        active: users.active,
      });

    // Log deletion (non-blocking)
    after(async () => {
      await logDelete("user", id, existingUser);
    });

    return NextResponse.json({
      message: "User deactivated successfully",
      user: deletedUser,
    });
  } catch (error) {
    after(() => console.error("Error deleting user:", error));
    return NextResponse.json({ error: "Error deleting user" }, { status: 500 });
  }
}
