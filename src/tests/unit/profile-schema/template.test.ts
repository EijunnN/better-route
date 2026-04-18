import { describe, test, expect } from "bun:test";
import { generateCsvTemplate } from "@/lib/orders/profile-schema";
import { baseSchema } from "./fixtures";

describe("generateCsvTemplate", () => {
  test("emits Spanish headers with semicolons and BOM", () => {
    const out = generateCsvTemplate(baseSchema());
    expect(out.charCodeAt(0)).toBe(0xfeff);
    const lines = out.slice(1).split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      "trackcode;direccion;latitud;longitud;nombre_cliente;peso",
    );
  });

  test("emits English headers with commas when locale=en", () => {
    const schema = baseSchema({
      fields: baseSchema().fields.map((f) => ({ ...f, labelEn: f.label.toUpperCase() })),
    });
    const out = generateCsvTemplate(schema, { locale: "en" });
    const firstLine = out.slice(1).split("\n")[0];
    expect(firstLine.includes(",")).toBe(true);
    expect(firstLine.includes(";")).toBe(false);
  });

  test("includes a sample row with field examples", () => {
    const schema = baseSchema({
      fields: baseSchema().fields.map((f, i) => ({ ...f, example: `ex-${i}` })),
    });
    const out = generateCsvTemplate(schema);
    const sample = out.slice(1).split("\n")[1];
    expect(sample).toBe("ex-0;ex-1;ex-2;ex-3;ex-4;ex-5");
  });
});
