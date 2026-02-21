import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq, and } from "drizzle-orm";
import { testDb, cleanDatabase } from "../setup/test-db";
import { createTestToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import { createCompany, createPlanner, createOrder } from "../setup/test-data";
import { orders } from "@/db/schema";
import { POST } from "@/app/api/orders/import/route";

function toBase64(content: string): string {
  return Buffer.from(content, "utf-8").toString("base64");
}

const validCSV = `tracking_id,address,latitude,longitude,customer_name
TRK-CSV-001,Av. Arequipa 100,-12.0464,-77.0428,John Doe
TRK-CSV-002,Jr. Lima 200,-12.0500,-77.0400,Jane Smith
TRK-CSV-003,Av. Brasil 300,-12.0550,-77.0350,Bob Wilson`;

const semicolonCSV = `tracking_id;address;latitude;longitude
TRK-SC-001;Av. Test 1;-12.0464;-77.0428
TRK-SC-002;Av. Test 2;-12.0500;-77.0400`;

describe("POST /api/orders/import", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let planner: Awaited<ReturnType<typeof createPlanner>>;
  let token: string;

  beforeAll(async () => {
    await cleanDatabase();
    company = await createCompany();
    planner = await createPlanner(company.id);
    token = await createTestToken({
      userId: planner.id,
      companyId: company.id,
      email: planner.email,
      role: "PLANIFICADOR",
    });
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // -----------------------------------------------------------------------
  // 1. Preview mode (process=false)
  // -----------------------------------------------------------------------
  test("preview mode returns validation results without importing", async () => {
    const request = await createTestRequest("/api/orders/import", {
      method: "POST",
      token,
      companyId: company.id,
      userId: planner.id,
      body: { csvContent: toBase64(validCSV), process: false },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.totalRows).toBe(3);
    expect(data.validRows).toBeGreaterThan(0);
    expect(data.importedRows).toBe(0);
    expect(Array.isArray(data.preview)).toBe(true);
    expect(data.preview.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // 2. Import mode (process=true)
  // -----------------------------------------------------------------------
  test("import mode inserts valid rows into the database", async () => {
    // Use unique tracking IDs to avoid collision with other tests
    const csv = `tracking_id,address,latitude,longitude,customer_name
TRK-IMP-001,Av. Arequipa 100,-12.0464,-77.0428,John Doe
TRK-IMP-002,Jr. Lima 200,-12.0500,-77.0400,Jane Smith
TRK-IMP-003,Av. Brasil 300,-12.0550,-77.0350,Bob Wilson`;

    const request = await createTestRequest("/api/orders/import", {
      method: "POST",
      token,
      companyId: company.id,
      userId: planner.id,
      body: { csvContent: toBase64(csv), process: true },
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.importedRows).toBe(3);

    // Verify orders exist in the database
    const dbOrders = await testDb
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.companyId, company.id),
          eq(orders.trackingId, "TRK-IMP-001"),
        ),
      );
    expect(dbOrders.length).toBe(1);
    expect(dbOrders[0].address).toBe("Av. Arequipa 100");
  });

  // -----------------------------------------------------------------------
  // 3. Duplicate trackingId detection (existing in DB)
  // -----------------------------------------------------------------------
  test("detects duplicate trackingId already in database", async () => {
    // Create an existing order first
    await createOrder({ companyId: company.id, trackingId: "TRK-DUP-DB" });

    const csv = `tracking_id,address,latitude,longitude
TRK-DUP-DB,Av. Test 1,-12.0464,-77.0428`;

    const request = await createTestRequest("/api/orders/import", {
      method: "POST",
      token,
      companyId: company.id,
      userId: planner.id,
      body: { csvContent: toBase64(csv), process: false },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.duplicateTrackingIds).toContain("TRK-DUP-DB");
    const dupError = data.errors.find(
      (e: { field: string; message: string }) =>
        e.field === "trackingId" && e.message.includes("already exists"),
    );
    expect(dupError).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 4. Duplicate within CSV
  // -----------------------------------------------------------------------
  test("detects duplicate trackingId within the same CSV", async () => {
    const csv = `tracking_id,address,latitude,longitude
TRK-CSVDUP-001,Av. Test 1,-12.0464,-77.0428
TRK-CSVDUP-001,Av. Test 2,-12.0500,-77.0400`;

    const request = await createTestRequest("/api/orders/import", {
      method: "POST",
      token,
      companyId: company.id,
      userId: planner.id,
      body: { csvContent: toBase64(csv), process: false },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.invalidRecords.length).toBeGreaterThanOrEqual(1);
    const dupRecord = data.invalidRecords.find(
      (r: { trackingId: string }) => r.trackingId === "TRK-CSVDUP-001",
    );
    expect(dupRecord).toBeDefined();
    expect(
      dupRecord.errors.some((e: { message: string }) =>
        e.message.includes("Duplicate"),
      ),
    ).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 5. Semicolon delimiter
  // -----------------------------------------------------------------------
  test("parses CSV with semicolon delimiter correctly", async () => {
    const request = await createTestRequest("/api/orders/import", {
      method: "POST",
      token,
      companyId: company.id,
      userId: planner.id,
      body: { csvContent: toBase64(semicolonCSV), process: false },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.totalRows).toBe(2);
    expect(data.validRows).toBe(2);
  });

  // -----------------------------------------------------------------------
  // 6. Error summary structure
  // -----------------------------------------------------------------------
  test("returns error summary with byField, bySeverity, byErrorType", async () => {
    // Mix valid and invalid rows: missing address and missing latitude
    const csv = `tracking_id,address,latitude,longitude
TRK-SUM-001,Av. Valid,-12.0464,-77.0428
TRK-SUM-002,,-12.0500,-77.0400
TRK-SUM-003,Av. Valid 2,INVALID_LAT,-77.0350`;

    const request = await createTestRequest("/api/orders/import", {
      method: "POST",
      token,
      companyId: company.id,
      userId: planner.id,
      body: { csvContent: toBase64(csv), process: false },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.summary).toBeDefined();
    expect(data.summary.byField).toBeDefined();
    expect(data.summary.bySeverity).toBeDefined();
    expect(data.summary.byErrorType).toBeDefined();

    // There should be errors counted
    expect(data.invalidRows).toBeGreaterThan(0);
    const totalSeverityCounts = Object.values(
      data.summary.bySeverity as Record<string, number>,
    ).reduce((a: number, b: number) => a + b, 0);
    expect(totalSeverityCounts).toBeGreaterThan(0);
  });
});
