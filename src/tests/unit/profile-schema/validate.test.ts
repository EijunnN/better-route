import { describe, test, expect } from "bun:test";
import {
  validateCsvHeaders,
  validateCsvRow,
} from "@/lib/orders/profile-schema";
import { baseSchema } from "./fixtures";

describe("validateCsvHeaders", () => {
  test("maps canonical Spanish headers exactly", () => {
    const schema = baseSchema();
    const result = validateCsvHeaders(
      ["trackcode", "direccion", "latitud", "longitud", "nombre_cliente", "peso"],
      schema,
    );
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual([]);
    expect(result.mapping).toEqual({
      trackcode: "trackingId",
      direccion: "address",
      latitud: "latitude",
      longitud: "longitude",
      nombre_cliente: "customerName",
      peso: "weightRequired",
    });
  });

  test("maps English aliases", () => {
    const schema = baseSchema();
    const result = validateCsvHeaders(
      ["tracking_id", "address", "lat", "lng", "customer_name", "weight"],
      schema,
    );
    expect(result.missing).toEqual([]);
    expect(result.mapping.tracking_id).toBe("trackingId");
    expect(result.mapping.weight).toBe("weightRequired");
    expect(result.ambiguous.length).toBeGreaterThan(0);
  });

  test("reports missing required fields", () => {
    const schema = baseSchema();
    const result = validateCsvHeaders(["trackcode", "direccion"], schema);
    expect(result.missing).toContain("latitude");
    expect(result.missing).toContain("longitude");
    expect(result.missing).toContain("customerName");
    expect(result.missing).toContain("weightRequired");
  });

  test("reports unknown headers as extra", () => {
    const schema = baseSchema();
    const result = validateCsvHeaders(
      [
        "trackcode",
        "direccion",
        "latitud",
        "longitud",
        "nombre_cliente",
        "peso",
        "columna_inventada",
      ],
      schema,
    );
    expect(result.extra).toEqual(["columna_inventada"]);
  });
});

describe("validateCsvRow", () => {
  test("passes a fully valid row", () => {
    const schema = baseSchema();
    const row = {
      trackingId: "ORD-1",
      address: "Av. Test 123",
      latitude: "-12.05",
      longitude: "-77.04",
      customerName: "Cliente",
      weightRequired: "500",
    };
    const result = validateCsvRow(row, schema);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.normalized.latitude).toBe(-12.05);
    expect(result.normalized.weightRequired).toBe(500);
  });

  test("flags missing required fields", () => {
    const schema = baseSchema();
    const row = {
      trackingId: "ORD-1",
      address: "",
      latitude: "-12.05",
      longitude: "-77.04",
      customerName: "Cliente",
      weightRequired: "500",
    };
    const result = validateCsvRow(row, schema);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.fieldKey === "address")).toBe(true);
  });

  test("enforces numeric bounds", () => {
    const schema = baseSchema();
    const row = {
      trackingId: "ORD-1",
      address: "x",
      latitude: "99",
      longitude: "-77.04",
      customerName: "Cliente",
      weightRequired: "-5",
    };
    const result = validateCsvRow(row, schema);
    expect(result.ok).toBe(false);
    expect(result.errors.find((e) => e.fieldKey === "latitude")).toBeDefined();
    expect(result.errors.find((e) => e.fieldKey === "weightRequired")).toBeDefined();
  });

  test("applies defaultValue when field is optional and empty", () => {
    const schema = baseSchema({
      fields: [
        ...baseSchema().fields,
        {
          key: "notes",
          label: "notas",
          required: false,
          kind: "string",
          description: "",
          example: "",
          origin: "system",
          defaultValue: "—",
        },
      ],
    });
    const row = {
      trackingId: "ORD-1",
      address: "x",
      latitude: "-12",
      longitude: "-77",
      customerName: "c",
      weightRequired: "100",
      notes: "",
    };
    const result = validateCsvRow(row, schema);
    expect(result.ok).toBe(true);
    expect(result.normalized.notes).toBe("—");
  });
});
