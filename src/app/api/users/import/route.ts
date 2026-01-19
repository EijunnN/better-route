import bcrypt from "bcryptjs";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { logCreate } from "@/lib/audit";
import { setTenantContext } from "@/lib/tenant";
import { createUserSchema, isExpired } from "@/lib/validations/user";

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

const VALID_ROLES = ["ADMIN_FLOTA", "PLANIFICADOR", "MONITOR", "CONDUCTOR"];
const VALID_DRIVER_STATUS = [
  "AVAILABLE",
  "ASSIGNED",
  "IN_ROUTE",
  "ON_PAUSE",
  "COMPLETED",
  "UNAVAILABLE",
  "ABSENT",
];

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

function validateRow(row: CSVRow, rowNumber: number): ImportError[] {
  const errors: ImportError[] = [];

  if (!row.name || row.name.length < 2) {
    errors.push({
      row: rowNumber,
      field: "name",
      message: "Nombre requerido (mín. 2 caracteres)",
    });
  }

  if (!row.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    errors.push({ row: rowNumber, field: "email", message: "Email inválido" });
  }

  if (!row.username || row.username.length < 3) {
    errors.push({
      row: rowNumber,
      field: "username",
      message: "Username requerido (mín. 3 caracteres)",
    });
  }

  if (!row.password || row.password.length < 8) {
    errors.push({
      row: rowNumber,
      field: "password",
      message: "Contraseña requerida (mín. 8 caracteres)",
    });
  }

  if (!row.role || !VALID_ROLES.includes(row.role)) {
    errors.push({
      row: rowNumber,
      field: "role",
      message: `Rol inválido. Usar: ${VALID_ROLES.join(", ")}`,
    });
  }

  if (row.role === "CONDUCTOR") {
    if (row.driverStatus && !VALID_DRIVER_STATUS.includes(row.driverStatus)) {
      errors.push({
        row: rowNumber,
        field: "driverStatus",
        message: `Estado inválido. Usar: ${VALID_DRIVER_STATUS.join(", ")}`,
      });
    }
  }

  return errors;
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

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          created: 0,
          errors: [{ row: 0, field: "file", message: "No se recibió archivo" }],
        },
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
        {
          success: false,
          created: 0,
          errors: [
            {
              row: 0,
              field: "file",
              message: "Archivo vacío o formato inválido",
            },
          ],
        },
        { status: 400 },
      );
    }

    const allErrors: ImportError[] = [];
    const validRows: { row: CSVRow; rowNumber: number }[] = [];

    // Validate all rows first
    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 2; // +2 because row 1 is header and arrays are 0-indexed
      const errors = validateRow(rows[i], rowNumber);

      if (errors.length > 0) {
        allErrors.push(...errors);
      } else {
        validRows.push({ row: rows[i], rowNumber });
      }
    }

    // Check for duplicate emails/usernames within the file
    const emails = new Set<string>();
    const usernames = new Set<string>();

    for (const { row, rowNumber } of validRows) {
      if (emails.has(row.email.toLowerCase())) {
        allErrors.push({
          row: rowNumber,
          field: "email",
          message: "Email duplicado en el archivo",
        });
      } else {
        emails.add(row.email.toLowerCase());
      }

      if (usernames.has(row.username.toLowerCase())) {
        allErrors.push({
          row: rowNumber,
          field: "username",
          message: "Username duplicado en el archivo",
        });
      } else {
        usernames.add(row.username.toLowerCase());
      }
    }

    // If there are validation errors, return them
    if (allErrors.length > 0) {
      return NextResponse.json({
        success: false,
        created: 0,
        errors: allErrors,
      });
    }

    // Create users
    let created = 0;
    const createErrors: ImportError[] = [];

    for (const { row, rowNumber } of validRows) {
      try {
        const hashedPassword = await bcrypt.hash(row.password, 10);
        const isConductor = row.role === "CONDUCTOR";

        const userData = {
          name: row.name,
          email: row.email.toLowerCase(),
          username: row.username.toLowerCase(),
          password: hashedPassword,
          role: row.role as
            | "ADMIN_FLOTA"
            | "PLANIFICADOR"
            | "MONITOR"
            | "CONDUCTOR",
          phone: row.phone || null,
          companyId: tenantCtx.companyId,
          // Driver fields
          identification: isConductor ? row.identification || null : null,
          licenseNumber: isConductor ? row.licenseNumber || null : null,
          licenseExpiry:
            isConductor && row.licenseExpiry
              ? parseDate(row.licenseExpiry)
              : null,
          licenseCategories: isConductor ? row.licenseCategories || null : null,
          driverStatus: isConductor
            ? ((row.driverStatus || "AVAILABLE") as
                | "AVAILABLE"
                | "ASSIGNED"
                | "IN_ROUTE"
                | "ON_PAUSE"
                | "COMPLETED"
                | "UNAVAILABLE"
                | "ABSENT")
            : null,
          primaryFleetId: isConductor ? row.primaryFleetId || null : null,
          active: true,
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
      } catch (error: unknown) {
        const err = error as {
          code?: string;
          constraint?: string;
          message?: string;
        };

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

    return NextResponse.json({
      success: createErrors.length === 0,
      created,
      errors: createErrors,
    });
  } catch (error) {
    console.error("Error importing users:", error);
    return NextResponse.json(
      {
        success: false,
        created: 0,
        errors: [
          { row: 0, field: "general", message: "Error interno del servidor" },
        ],
      },
      { status: 500 },
    );
  }
}
