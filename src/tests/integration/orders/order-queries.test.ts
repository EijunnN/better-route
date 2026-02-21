import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { cleanDatabase } from "../setup/test-db";
import { createTestToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import {
  createCompany,
  createAdmin,
  createOrder,
  createTimeWindowPreset,
  createFieldDefinition,
  createCsvMappingTemplate,
  createCompanyProfile,
} from "../setup/test-data";

import { POST as validatePOST, GET as validateGET } from "@/app/api/orders/validate/route";
import { GET as geojsonGET } from "@/app/api/orders/geojson/route";
import { GET as pendingSummaryGET } from "@/app/api/orders/pending-summary/route";
import { GET as csvTemplateGET } from "@/app/api/orders/csv-template/route";
import { POST as suggestMappingPOST } from "@/app/api/orders/import/suggest-mapping/route";

describe("Order Queries API", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let token: string;

  beforeAll(async () => {
    await cleanDatabase();

    company = await createCompany();
    admin = await createAdmin(null);
    token = await createTestToken({
      userId: admin.id,
      companyId: company.id,
      email: admin.email,
      role: admin.role,
    });
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // ---------------------------------------------------------------------------
  // POST /api/orders/validate
  // ---------------------------------------------------------------------------
  describe("POST /api/orders/validate", () => {
    test("validates orders against time window constraints", async () => {
      const preset = await createTimeWindowPreset({
        companyId: company.id,
        startTime: "09:00",
        endTime: "12:00",
        strictness: "HARD",
        type: "SHIFT",
      });

      await createOrder({
        companyId: company.id,
        status: "PENDING",
        timeWindowPresetId: preset.id,
      });
      await createOrder({
        companyId: company.id,
        status: "PENDING",
      });

      const request = await createTestRequest("/api/orders/validate", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { arrivalTime: "10:00" },
      });

      const response = await validatePOST(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.summary).toBeDefined();
      expect(body.summary.total).toBeGreaterThan(0);
      expect(typeof body.summary.assignable).toBe("number");
      expect(typeof body.summary.unassignable).toBe("number");
      expect(body.assignableOrders).toBeDefined();
      expect(Array.isArray(body.assignableOrders)).toBe(true);
    });

    test("returns validation without arrivalTime (categorizes by strictness)", async () => {
      const request = await createTestRequest("/api/orders/validate", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {},
      });

      const response = await validatePOST(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.summary).toBeDefined();
      expect(body.summary.total).toBeGreaterThanOrEqual(0);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/orders/validate
  // ---------------------------------------------------------------------------
  describe("GET /api/orders/validate", () => {
    test("returns pending orders summary by strictness", async () => {
      const request = await createTestRequest("/api/orders/validate", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
      });

      const response = await validateGET(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.summary).toBeDefined();
      expect(typeof body.summary.totalPending).toBe("number");
      expect(typeof body.summary.hardConstraint).toBe("number");
      expect(typeof body.summary.softConstraint).toBe("number");
      expect(typeof body.summary.strictnessOverridden).toBe("number");
      expect(typeof body.summary.noTimeWindowPreset).toBe("number");
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/orders/geojson
  // ---------------------------------------------------------------------------
  describe("GET /api/orders/geojson", () => {
    beforeAll(async () => {
      // Create orders with valid coordinates
      await createOrder({
        companyId: company.id,
        status: "PENDING",
        latitude: "-12.0464",
        longitude: "-77.0428",
        customerName: "GeoTest Customer",
      });
      await createOrder({
        companyId: company.id,
        status: "COMPLETED",
        latitude: "-12.1000",
        longitude: "-77.0500",
      });
      // Order with null-island coordinates (should be filtered out)
      await createOrder({
        companyId: company.id,
        status: "PENDING",
        latitude: "0",
        longitude: "0",
      });
    });

    test("returns FeatureCollection with order points", async () => {
      const request = await createTestRequest("/api/orders/geojson", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
      });

      const response = await geojsonGET(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.type).toBe("FeatureCollection");
      expect(Array.isArray(body.features)).toBe(true);
      expect(body.features.length).toBeGreaterThan(0);

      const feature = body.features[0];
      expect(feature.type).toBe("Feature");
      expect(feature.geometry.type).toBe("Point");
      expect(feature.geometry.coordinates).toHaveLength(2);
      expect(feature.properties.id).toBeDefined();
      expect(feature.properties.status).toBeDefined();
      expect(feature.properties.color).toBeDefined();
    });

    test("filters by status and search", async () => {
      const request = await createTestRequest("/api/orders/geojson", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
        searchParams: {
          status: "PENDING",
          search: "GeoTest",
        },
      });

      const response = await geojsonGET(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.type).toBe("FeatureCollection");
      // All returned features should be PENDING
      for (const feature of body.features) {
        expect(feature.properties.status).toBe("PENDING");
      }
      // At least one feature should match the search
      const matchingFeature = body.features.find(
        (f: any) => f.properties.customerName === "GeoTest Customer",
      );
      expect(matchingFeature).toBeDefined();
    });

    test("filters out invalid coordinates (0,0)", async () => {
      const request = await createTestRequest("/api/orders/geojson", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
      });

      const response = await geojsonGET(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      // No feature should have [0,0] coordinates
      for (const feature of body.features) {
        const [lng, lat] = feature.geometry.coordinates;
        expect(lat === 0 && lng === 0).toBe(false);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/orders/pending-summary
  // ---------------------------------------------------------------------------
  describe("GET /api/orders/pending-summary", () => {
    test("returns weight/volume/skill aggregates", async () => {
      // Create orders with weight/volume data
      await createOrder({
        companyId: company.id,
        status: "PENDING",
        weightRequired: 500,
        volumeRequired: 10,
      });
      await createOrder({
        companyId: company.id,
        status: "PENDING",
        weightRequired: 300,
        volumeRequired: 5,
      });

      const request = await createTestRequest("/api/orders/pending-summary", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
      });

      const response = await pendingSummaryGET(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data).toBeDefined();
      expect(body.data.totalOrders).toBeGreaterThan(0);
      expect(typeof body.data.totalWeight).toBe("number");
      expect(typeof body.data.totalVolume).toBe("number");
      expect(typeof body.data.maxWeight).toBe("number");
      expect(typeof body.data.maxVolume).toBe("number");
      expect(typeof body.data.ordersWithWeightRequirements).toBe("number");
      expect(typeof body.data.ordersWithVolumeRequirements).toBe("number");
      expect(Array.isArray(body.data.requiredSkills)).toBe(true);
      expect(Array.isArray(body.data.orders)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/orders/csv-template
  // ---------------------------------------------------------------------------
  describe("GET /api/orders/csv-template", () => {
    test("returns CSV with correct headers", async () => {
      const request = await createTestRequest("/api/orders/csv-template", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
      });

      const response = await csvTemplateGET(request);
      expect(response.status).toBe(200);

      const contentType = response.headers.get("content-type");
      expect(contentType).toContain("text/csv");

      const contentDisposition = response.headers.get("content-disposition");
      expect(contentDisposition).toContain("attachment");
      expect(contentDisposition).toContain(".csv");

      const csvText = await response.text();
      // CSV should contain at least the BOM and header row
      expect(csvText.length).toBeGreaterThan(0);
      // Check for required header fields (Spanish locale default)
      expect(csvText).toContain("trackcode");
      expect(csvText).toContain("direccion");
      expect(csvText).toContain("latitud");
      expect(csvText).toContain("longitud");
    });

    test("returns JSON field documentation with format=json", async () => {
      const request = await createTestRequest("/api/orders/csv-template", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
        searchParams: { format: "json" },
      });

      const response = await csvTemplateGET(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data.fields)).toBe(true);
      expect(body.data.fields.length).toBeGreaterThan(0);

      // Each field should have documentation properties
      const field = body.data.fields[0];
      expect(field.key).toBeDefined();
      expect(field.label).toBeDefined();
      expect(typeof field.required).toBe("boolean");
      expect(field.description).toBeDefined();

      // Should include templates
      expect(Array.isArray(body.data.templates)).toBe(true);
      expect(body.data.templates.length).toBeGreaterThan(0);
    });

    test("includes custom field definitions in CSV template", async () => {
      await createFieldDefinition({
        companyId: company.id,
        entity: "orders",
        code: "custom_field_1",
        label: "Custom Field 1",
        fieldType: "text",
        showInCsv: true,
        active: true,
      });

      const request = await createTestRequest("/api/orders/csv-template", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
      });

      const response = await csvTemplateGET(request);
      expect(response.status).toBe(200);

      const csvText = await response.text();
      expect(csvText).toContain("custom_field_1");
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/orders/import/suggest-mapping
  // ---------------------------------------------------------------------------
  describe("POST /api/orders/import/suggest-mapping", () => {
    test("suggests column mappings from CSV headers", async () => {
      const request = await createTestRequest(
        "/api/orders/import/suggest-mapping",
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: {
            csvHeaders: [
              "tracking_id",
              "customer_name",
              "address",
              "latitude",
              "longitude",
              "weight",
              "notes",
            ],
          },
        },
      );

      const response = await suggestMappingPOST(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.suggestedMapping).toBeDefined();
      expect(body.confidence).toBeDefined();
      expect(typeof body.autoMappedCount).toBe("number");
      expect(typeof body.manualMappingRequired).toBe("boolean");

      // Common headers should be auto-mapped
      expect(body.suggestedMapping["tracking_id"]).toBe("trackingId");
      expect(body.suggestedMapping["customer_name"]).toBe("customerName");
      expect(body.suggestedMapping["address"]).toBe("address");
      expect(body.suggestedMapping["latitude"]).toBe("latitude");
      expect(body.suggestedMapping["longitude"]).toBe("longitude");

      // Required fields validation
      expect(body.requiredFieldsValidation).toBeDefined();
      expect(typeof body.requiredFieldsValidation.valid).toBe("boolean");
    });

    test("uses saved template mapping when templateId provided", async () => {
      const template = await createCsvMappingTemplate({
        companyId: company.id,
        name: "My Template",
        columnMapping: JSON.stringify({
          codigo: "trackingId",
          nombre: "customerName",
          dir: "address",
          lat: "latitude",
          lng: "longitude",
        }),
        requiredFields: [
          "trackingId",
          "customerName",
          "address",
          "latitude",
          "longitude",
        ],
      });

      const request = await createTestRequest(
        "/api/orders/import/suggest-mapping",
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: {
            csvHeaders: ["codigo", "nombre", "dir", "lat", "lng", "peso"],
            templateId: template.id,
          },
        },
      );

      const response = await suggestMappingPOST(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      // Template mappings should be applied
      expect(body.suggestedMapping["codigo"]).toBe("trackingId");
      expect(body.suggestedMapping["nombre"]).toBe("customerName");
      expect(body.suggestedMapping["dir"]).toBe("address");
    });

    test("returns 400 for invalid request body", async () => {
      const request = await createTestRequest(
        "/api/orders/import/suggest-mapping",
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { csvHeaders: [] },
        },
      );

      const response = await suggestMappingPOST(request);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toMatch(/validation/i);
    });
  });

  // ---------------------------------------------------------------------------
  // Tenant isolation
  // ---------------------------------------------------------------------------
  describe("Tenant isolation", () => {
    test("geojson only returns orders from own company", async () => {
      const companyB = await createCompany();
      const adminB = await createAdmin(null);
      const tokenB = await createTestToken({
        userId: adminB.id,
        companyId: companyB.id,
        email: adminB.email,
        role: adminB.role,
      });

      // Company B has no orders
      const request = await createTestRequest("/api/orders/geojson", {
        method: "GET",
        token: tokenB,
        companyId: companyB.id,
        userId: adminB.id,
      });

      const response = await geojsonGET(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.type).toBe("FeatureCollection");
      expect(body.features).toEqual([]);
    });
  });
});
