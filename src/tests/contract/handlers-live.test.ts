/**
 * Contract-tests (b) del §10 de docs/API-CONTRACT-MOBILE.md: respuestas
 * REALES de los handlers del seam validadas contra los mismos schemas
 * Zod que validan los fixtures golden. Necesita Postgres (TEST_DATABASE_URL):
 * si la DB no responde, la suite entera se marca skip en lugar de fallar
 * por conexión — así `bun test src/tests/contract/` queda verde sin DB.
 *
 * Cobertura deliberada: los endpoints mobile/driver + PATCH de stop
 * (los shapes que el parser Dart castea sin nulls, §9). Auth y chat ya
 * tienen integración propia en src/tests/integration/{auth,chat}.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { CONTRACT_HEADER, CONTRACT_VERSION } from "@/lib/mobile-contract";
import {
  deliveryPolicyResponseSchema,
  fieldDefinitionsResponseSchema,
  locationGetResponseSchema,
  locationPostResponseSchema,
  myRouteResponseSchema,
  presignedUrlResponseSchema,
  routeStopPatchResponseSchema,
} from "./schemas";

async function isDbReachable(): Promise<boolean> {
  try {
    const { testDb } = await import("../integration/setup/test-db");
    await Promise.race([
      testDb.execute(sql`select 1`),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("db probe timeout")), 3000),
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

const dbUp = await isDbReachable();

function expectContractResponse(
  response: Response,
  schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } },
  body: unknown,
) {
  expect(response.headers.get(CONTRACT_HEADER)).toBe(String(CONTRACT_VERSION));
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new Error(
      `Respuesta real no valida contra el schema del contrato:\n${JSON.stringify(result.error, null, 2)}\nbody: ${JSON.stringify(body, null, 2)}`,
    );
  }
}

describe.skipIf(!dbUp)(
  "API-CONTRACT-MOBILE.md §10 — handlers reales vs schemas (requiere DB)",
  () => {
    const ROUTE_ID = "route-contract-test";
    // biome-ignore lint/suspicious/noExplicitAny: harness dinámico compartido con integration
    let h: any;
    // biome-ignore lint/suspicious/noExplicitAny: filas seed tipadas por el harness
    let seed: any;
    let driverToken: string;

    beforeAll(async () => {
      const testData = await import("../integration/setup/test-data");
      const { cleanDatabase } = await import("../integration/setup/test-db");
      const { createTestToken } = await import(
        "../integration/setup/test-auth"
      );
      const { createTestRequest } = await import(
        "../integration/setup/test-request"
      );
      h = { ...testData, createTestRequest };

      await cleanDatabase();

      const company = await testData.createCompany();
      const driver = await testData.createDriver(company.id);
      driverToken = await createTestToken({
        userId: driver.id,
        companyId: company.id,
        email: driver.email,
        role: "CONDUCTOR",
      });
      const vehicle = await testData.createVehicle({
        companyId: company.id,
        assignedDriverId: driver.id,
        originAddress: "Depot Contract",
      });
      const order = await testData.createOrder({
        companyId: company.id,
        status: "ASSIGNED",
        customerName: "Cliente Contrato",
      });
      const config = await testData.createOptimizationConfig({
        companyId: company.id,
      });
      const result = testData.buildOptimizationResult([
        {
          routeId: ROUTE_ID,
          vehicleId: vehicle.id,
          vehiclePlate: vehicle.plate,
          driverId: driver.id,
          stops: [
            {
              orderId: order.id,
              trackingId: order.trackingId,
              sequence: 1,
              address: order.address,
              latitude: "-12.0464",
              longitude: "-77.0428",
            },
          ],
          totalDistance: 5000,
          totalDuration: 1800,
          totalWeight: 10,
          totalVolume: 4,
          utilizationPercentage: 50,
          timeWindowViolations: 0,
        },
      ]);
      const job = await testData.createOptimizationJob({
        companyId: company.id,
        configurationId: config.id,
        status: "COMPLETED",
        result: JSON.stringify(result),
      });
      const stop = await testData.createRouteStop({
        companyId: company.id,
        jobId: job.id,
        routeId: ROUTE_ID,
        userId: driver.id,
        vehicleId: vehicle.id,
        orderId: order.id,
        sequence: 1,
        status: "PENDING",
        address: "Calle Contrato 100, Lima",
        latitude: "-12.0464",
        longitude: "-77.0428",
      });
      await testData.createFieldDefinition({
        companyId: company.id,
        entity: "route_stops",
        code: "contract_field",
        label: "Contract Field",
        showInMobile: true,
        active: true,
        position: 1,
      });

      seed = { company, driver, vehicle, order, job, stop };
    });

    afterAll(async () => {
      const { cleanDatabase } = await import("../integration/setup/test-db");
      await cleanDatabase();
    });

    test("GET /api/mobile/driver/delivery-policy", async () => {
      const { GET } = await import(
        "@/app/api/mobile/driver/delivery-policy/route"
      );
      const request = await h.createTestRequest(
        "/api/mobile/driver/delivery-policy",
        { token: driverToken, companyId: seed.company.id },
      );
      const response = await GET(request as NextRequest);
      expect(response.status).toBe(200);
      expectContractResponse(
        response,
        deliveryPolicyResponseSchema,
        await response.json(),
      );
    });

    test("GET /api/mobile/driver/field-definitions", async () => {
      const { GET } = await import(
        "@/app/api/mobile/driver/field-definitions/route"
      );
      const request = await h.createTestRequest(
        "/api/mobile/driver/field-definitions",
        { token: driverToken, companyId: seed.company.id },
      );
      const response = await GET(request as NextRequest);
      expect(response.status).toBe(200);
      expectContractResponse(
        response,
        fieldDefinitionsResponseSchema,
        await response.json(),
      );
    });

    test("GET /api/mobile/driver/my-route (variante con ruta)", async () => {
      const { GET } = await import("@/app/api/mobile/driver/my-route/route");
      const request = await h.createTestRequest("/api/mobile/driver/my-route", {
        token: driverToken,
        companyId: seed.company.id,
      });
      const response = await GET(request as NextRequest);
      expect(response.status).toBe(200);
      const body = await response.json();
      expectContractResponse(response, myRouteResponseSchema, body);
      expect(body.data.route).not.toBeNull();
    });

    test("POST /api/mobile/driver/location (FIX-6: ceros persistidos)", async () => {
      const { POST } = await import("@/app/api/mobile/driver/location/route");
      const request = await h.createTestRequest("/api/mobile/driver/location", {
        method: "POST",
        token: driverToken,
        companyId: seed.company.id,
        body: {
          latitude: -12.0464,
          longitude: -77.0428,
          accuracy: 0,
          speed: 0,
          heading: 0,
          batteryLevel: 0,
          recordedAt: new Date().toISOString(),
          source: "GPS",
          routeId: ROUTE_ID,
          stopSequence: 1,
          jobId: seed.job.id,
        },
      });
      const response = await POST(request as NextRequest);
      expect(response.status).toBe(201);
      expectContractResponse(
        response,
        locationPostResponseSchema,
        await response.json(),
      );
    });

    test("GET /api/mobile/driver/location", async () => {
      const { GET } = await import("@/app/api/mobile/driver/location/route");
      const request = await h.createTestRequest("/api/mobile/driver/location", {
        token: driverToken,
        companyId: seed.company.id,
      });
      const response = await GET(request as NextRequest);
      expect(response.status).toBe(200);
      expectContractResponse(
        response,
        locationGetResponseSchema,
        await response.json(),
      );
    });

    test("GET /api/upload/presigned-url", async () => {
      const { GET } = await import("@/app/api/upload/presigned-url/route");
      const request = await h.createTestRequest("/api/upload/presigned-url", {
        token: driverToken,
        companyId: seed.company.id,
        searchParams: {
          trackingId: seed.order.trackingId,
          contentType: "image/jpeg",
          index: "1",
        },
      });
      const response = await GET(request as NextRequest);
      expect(response.status).toBe(200);
      expectContractResponse(
        response,
        presignedUrlResponseSchema,
        await response.json(),
      );
    });

    test("PATCH /api/route-stops/[id] devuelve la fila cruda (§4 col-2)", async () => {
      const { PATCH } = await import("@/app/api/route-stops/[id]/route");
      const request = await h.createTestRequest(
        `/api/route-stops/${seed.stop.id}`,
        {
          method: "PATCH",
          token: driverToken,
          companyId: seed.company.id,
          body: { status: "IN_PROGRESS" },
        },
      );
      const response = await PATCH(request as NextRequest, {
        params: Promise.resolve({ id: seed.stop.id }),
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expectContractResponse(response, routeStopPatchResponseSchema, body);
      expect(body.data.status).toBe("IN_PROGRESS");
    });
  },
);
