import bcrypt from "bcryptjs";
import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { logCreate } from "@/lib/infra/audit";
import { setTenantContext } from "@/lib/infra/tenant";
import { EntityType, Action } from "@/lib/auth/authorization";
import {
  createUserSchema,
  isExpired,
  type CreateUserInput,
} from "@/lib/validations/user";

import { extractTenantContext } from "@/lib/routing/route-helpers";

interface CSVRow {
  name: string;
  email: string;
  username: string;
  password: string;
  role: string;
  phone?: string;
  identification?: string;
  licenseNumber?: string;
  licenseExpiry?: string;
  licenseCategories?: string;
  driverStatus?: string;
  primaryFleetId?: string;
}

interface ImportError {
  row: number;
  field: string;
  message: string;
}

interface ImportResponse {
  success: boolean;
  created: number;
  errors: ImportError[];
  error?: string;
  details?: ImportError[];
}

interface ValidatedImportRow {
  rowNumber: number;
  csvRow: CSVRow;
  data: CreateUserInput;
}

type ImportRole = "ADMIN_FLOTA" | "PLANIFICADOR" | "MONITOR" | "CONDUCTOR";
type ImportDriverStatus =
  | "AVAILABLE"
  | "ASSIGNED"
  | "IN_ROUTE"
  | "ON_PAUSE"
  | "COMPLETED"
  | "UNAVAILABLE"
  | "ABSENT";

const VALID_ROLES: ImportRole[] = [
  "ADMIN_FLOTA",
  "PLANIFICADOR",
  "MONITOR",
  "CONDUCTOR",
];

const VALID_DRIVER_STATUS: ImportDriverStatus[] = [
  "AVAILABLE",
  "ASSIGNED",
  "IN_ROUTE",
  "ON_PAUSE",
  "COMPLETED",
  "UNAVAILABLE",
  "ABSENT",
];

function buildImportResponse(
  data: Omit<ImportResponse, "details">,
): ImportResponse {
  return {
    ...data,
    details: data.errors,
  };
}

function detectSeparator(headerLine: string): string {
  // Count occurrences of common separators
  const commaCount = (headerLine.match(/,/g) || []).length;
  const semicolonCount = (headerLine.match(/;/g) || []).length;
  const tabCount = (headerLine.match(/\t/g) || []).length;

  // Return the most frequent separator
  if (semicolonCount > commaCount && semicolonCount > tabCount) return ";";
  if (tabCount > commaCount && tabCount > semicolonCount) return "\t";
  return ",";
}

function parseCSV(text: string): CSVRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  // Auto-detect separator from header line
  const separator = detectSeparator(lines[0]);

  const headers = parseCSVLine(lines[0], separator).map((h) =>
    h.trim().toLowerCase(),
  );
  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], separator);
    if (values.length === 0) continue;

    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index]?.trim() || "";
    });

    rows.push({
      name: row.name || "",
      email: row.email || "",
      username: row.username || "",
      password: row.password || "",
      role: row.role?.toUpperCase() || "",
      phone: row.phone || undefined,
      identification: row.identification || undefined,
      licenseNumber: row.licensenumber || undefined,
      licenseExpiry: row.licenseexpiry || undefined,
      licenseCategories: row.licensecategories || undefined,
      driverStatus: row.driverstatus?.toUpperCase() || undefined,
      primaryFleetId: row.primaryfleetid || undefined,
    });
  }

  return rows;
}

function parseCSVLine(line: string, separator: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === separator && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

// Parse date in various formats: DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  // Try DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyy = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) return date;
  }

  // Try YYYY-MM-DD or YYYY/MM/DD
  const yyyymmdd = dateStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (yyyymmdd) {
    const [, year, month, day] = yyyymmdd;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) return date;
  }

  // Try native Date parsing as fallback
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) return date;

  return null;
}

function normalizeOptional(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeDateToIso(value: string | undefined): string | null {
  const trimmed = normalizeOptional(value);
  if (!trimmed) {
    return null;
  }

  const parsed = parseDate(trimmed);
  return parsed ? parsed.toISOString() : null;
}

function normalizeLicenseCategories(value: string | undefined): string | null {
  const trimmed = normalizeOptional(value);
  if (!trimmed) {
    return null;
  }

  return trimmed
    .split(",")
    .map((category) => category.trim().toUpperCase())
    .filter(Boolean)
    .join(", ");
}

function validateRow(
  row: CSVRow,
  rowNumber: number,
): { errors: ImportError[]; data: CreateUserInput | null } {
  const errors: ImportError[] = [];

  if (!row.role || !VALID_ROLES.includes(row.role as ImportRole)) {
    errors.push({
      row: rowNumber,
      field: "role",
      message: `Rol inválido. Usar: ${VALID_ROLES.join(", ")}`,
    });
    return { errors, data: null };
  }

  if (row.role === "CONDUCTOR") {
    if (row.driverStatus && !VALID_DRIVER_STATUS.includes(row.driverStatus as ImportDriverStatus)) {
      errors.push({
        row: rowNumber,
        field: "driverStatus",
        message: `Estado inválido. Usar: ${VALID_DRIVER_STATUS.join(", ")}`,
      });
    }
  }

  const normalized: CreateUserInput = {
    name: row.name.trim(),
    email: row.email.trim().toLowerCase(),
    username: row.username.trim().toLowerCase(),
    password: row.password,
    role: row.role as CreateUserInput["role"],
    phone: normalizeOptional(row.phone),
    identification:
      row.role === "CONDUCTOR" ? normalizeOptional(row.identification) : null,
    birthDate: null,
    photo: null,
    licenseNumber:
      row.role === "CONDUCTOR" ? normalizeOptional(row.licenseNumber) : null,
    licenseExpiry:
      row.role === "CONDUCTOR" ? normalizeDateToIso(row.licenseExpiry) : null,
    licenseCategories:
      row.role === "CONDUCTOR"
        ? normalizeLicenseCategories(row.licenseCategories)
        : null,
    certifications: null,
    driverStatus:
      row.role === "CONDUCTOR"
        ? ((normalizeOptional(row.driverStatus) ?? "AVAILABLE") as CreateUserInput["driverStatus"])
        : null,
    primaryFleetId:
      row.role === "CONDUCTOR" ? normalizeOptional(row.primaryFleetId) : null,
    active: true,
  };

  const validation = createUserSchema.safeParse(normalized);
  if (!validation.success) {
    return {
      data: null,
      errors: [
        ...errors,
        ...validation.error.issues.map((issue) => ({
          row: rowNumber,
          field:
            typeof issue.path[0] === "string" ? issue.path[0] : "general",
          message: issue.message,
        })),
      ],
    };
  }

  return { errors, data: validation.data };
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(request, EntityType.USER, Action.IMPORT);
    if (authResult instanceof NextResponse) return authResult;

    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        buildImportResponse({
          success: false,
          error: "No se recibió archivo",
          created: 0,
          errors: [{ row: 0, field: "file", message: "No se recibió archivo" }],
        }),
        { status: 400 },
      );
    }

    // Read file with proper encoding detection
    const arrayBuffer = await file.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(arrayBuffer);

    // Check for encoding issues (replacement character indicates wrong encoding)
    if (text.includes("�") || text.includes("\ufffd")) {
      // Try Windows-1252 (common for Excel in Spanish)
      text = new TextDecoder("windows-1252").decode(arrayBuffer);
    }
    const rows = parseCSV(text);

    if (rows.length === 0) {
      return NextResponse.json(
        buildImportResponse({
          success: false,
          error: "Archivo vacío o formato inválido",
          created: 0,
          errors: [
            {
              row: 0,
              field: "file",
              message: "Archivo vacío o formato inválido",
            },
          ],
        }),
        { status: 400 },
      );
    }

    const allErrors: ImportError[] = [];
    const validRows: ValidatedImportRow[] = [];

    // Validate all rows first
    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 2; // +2 because row 1 is header and arrays are 0-indexed
      const { errors, data } = validateRow(rows[i], rowNumber);

      if (errors.length > 0) {
        allErrors.push(...errors);
      } else if (data) {
        validRows.push({ rowNumber, csvRow: rows[i], data });
      }
    }

    // Check for duplicate emails/usernames/identifications within the file
    const emails = new Set<string>();
    const usernames = new Set<string>();
    const identifications = new Set<string>();

    for (const { data, rowNumber } of validRows) {
      if (emails.has(data.email)) {
        allErrors.push({
          row: rowNumber,
          field: "email",
          message: "Email duplicado en el archivo",
        });
      } else {
        emails.add(data.email);
      }

      if (usernames.has(data.username)) {
        allErrors.push({
          row: rowNumber,
          field: "username",
          message: "Username duplicado en el archivo",
        });
      } else {
        usernames.add(data.username);
      }

      if (data.role === "CONDUCTOR" && data.identification) {
        const normalizedIdentification = data.identification.toLowerCase();
        if (identifications.has(normalizedIdentification)) {
          allErrors.push({
            row: rowNumber,
            field: "identification",
            message: "Identificación duplicada en el archivo",
          });
        } else {
          identifications.add(normalizedIdentification);
        }
      }
    }

    // If there are validation errors, return them
    if (allErrors.length > 0) {
      return NextResponse.json(
        buildImportResponse({
          success: false,
          error: "Validation failed",
          created: 0,
          errors: allErrors,
        }),
        { status: 400 },
      );
    }

    const emailsToCheck = validRows.map(({ data }) => data.email);
    const usernamesToCheck = validRows.map(({ data }) => data.username);
    const identificationsToCheck = validRows
      .map(({ data }) =>
        data.role === "CONDUCTOR" ? data.identification : null,
      )
      .filter((identification): identification is string => Boolean(identification));

    const [existingEmails, existingUsernames, existingIdentifications] =
      await Promise.all([
        emailsToCheck.length > 0
          ? db
              .select({ value: users.email })
              .from(users)
              .where(
                and(
                  eq(users.companyId, tenantCtx.companyId),
                  inArray(users.email, emailsToCheck),
                ),
              )
          : Promise.resolve([]),
        usernamesToCheck.length > 0
          ? db
              .select({ value: users.username })
              .from(users)
              .where(
                and(
                  eq(users.companyId, tenantCtx.companyId),
                  inArray(users.username, usernamesToCheck),
                ),
              )
          : Promise.resolve([]),
        identificationsToCheck.length > 0
          ? db
              .select({ value: users.identification })
              .from(users)
              .where(
                and(
                  eq(users.companyId, tenantCtx.companyId),
                  inArray(users.identification, identificationsToCheck),
                ),
              )
          : Promise.resolve([]),
      ]);

    const existingEmailSet = new Set(
      existingEmails.map(({ value }) => value.toLowerCase()),
    );
    const existingUsernameSet = new Set(
      existingUsernames.map(({ value }) => value.toLowerCase()),
    );
    const existingIdentificationSet = new Set(
      existingIdentifications
        .map(({ value }) => value)
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toLowerCase()),
    );

    // Create users
    let created = 0;
    const createErrors: ImportError[] = [];
    const rowsToCreate = validRows.filter(({ data, rowNumber }) => {
      let hasConflict = false;

      if (existingEmailSet.has(data.email)) {
        createErrors.push({
          row: rowNumber,
          field: "email",
          message: "Email ya existe en el sistema",
        });
        hasConflict = true;
      }

      if (existingUsernameSet.has(data.username)) {
        createErrors.push({
          row: rowNumber,
          field: "username",
          message: "Username ya existe en el sistema",
        });
        hasConflict = true;
      }

      if (
        data.role === "CONDUCTOR" &&
        data.identification &&
        existingIdentificationSet.has(data.identification.toLowerCase())
      ) {
        createErrors.push({
          row: rowNumber,
          field: "identification",
          message: "Identificación ya existe en la empresa",
        });
        hasConflict = true;
      }

      return !hasConflict;
    });

    for (const { data, rowNumber } of rowsToCreate) {
      try {
        const hashedPassword = await bcrypt.hash(data.password, 10);
        const isConductor = data.role === "CONDUCTOR";

        const userData = {
          name: data.name,
          email: data.email,
          username: data.username,
          password: hashedPassword,
          role: data.role as ImportRole,
          phone: data.phone,
          companyId: tenantCtx.companyId,
          // Driver fields
          identification: isConductor ? data.identification : null,
          birthDate: data.birthDate ? new Date(data.birthDate) : null,
          photo: data.photo,
          licenseNumber: isConductor ? data.licenseNumber : null,
          licenseExpiry:
            isConductor && data.licenseExpiry
              ? new Date(data.licenseExpiry)
              : null,
          licenseCategories: isConductor ? data.licenseCategories : null,
          certifications: data.certifications,
          driverStatus: isConductor
            ? ((data.driverStatus || "AVAILABLE") as ImportDriverStatus)
            : null,
          primaryFleetId: isConductor ? data.primaryFleetId : null,
          active: data.active,
        };

        // Check for license expiry and set status accordingly
        if (
          isConductor &&
          userData.licenseExpiry &&
          isExpired(userData.licenseExpiry.toISOString())
        ) {
          userData.driverStatus = "UNAVAILABLE";
        }

        const [newUser] = await db.insert(users).values(userData).returning();

        await logCreate("users", newUser.id, newUser);
        created++;
      } catch (error) {
        const err =
          error instanceof Error
            ? ({
                code:
                  "code" in error && typeof error.code === "string"
                    ? error.code
                    : undefined,
                constraint:
                  "constraint" in error &&
                  typeof error.constraint === "string"
                    ? error.constraint
                    : undefined,
                message: error.message,
              } as {
                code?: string;
                constraint?: string;
                message?: string;
              })
            : {};

        if (err.code === "23505") {
          if (err.constraint?.includes("email")) {
            createErrors.push({
              row: rowNumber,
              field: "email",
              message: "Email ya existe en el sistema",
            });
          } else if (err.constraint?.includes("username")) {
            createErrors.push({
              row: rowNumber,
              field: "username",
              message: "Username ya existe en el sistema",
            });
          } else {
            createErrors.push({
              row: rowNumber,
              field: "general",
              message: "Registro duplicado",
            });
          }
        } else {
          createErrors.push({
            row: rowNumber,
            field: "general",
            message: err.message || "Error al crear usuario",
          });
        }
      }
    }

    if (createErrors.length > 0) {
      return NextResponse.json(
        buildImportResponse({
          success: false,
          error: "Algunos usuarios no pudieron ser creados",
          created,
          errors: createErrors,
        }),
        { status: 207 },
      );
    }

    return NextResponse.json(
      buildImportResponse({
        success: true,
        created,
        errors: [],
      }),
    );
  } catch (error) {
    console.error("Error importing users:", error);
    return NextResponse.json(
      buildImportResponse({
        success: false,
        error: "Error interno del servidor",
        created: 0,
        errors: [
          { row: 0, field: "general", message: "Error interno del servidor" },
        ],
      }),
      { status: 500 },
    );
  }
}
