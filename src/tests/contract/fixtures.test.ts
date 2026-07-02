/**
 * Contract-tests (a) del §10 de docs/API-CONTRACT-MOBILE.md: cada
 * fixture golden valida contra su schema Zod. Corren SIN base de datos.
 *
 * Si un test acá falla después de tocar un handler del seam, el flujo
 * es: actualizar fixture + schema + el doc del contrato (bump de
 * CONTRACT_VERSION si cambió el shape) + sync del espejo móvil con
 * scripts/sync-contract-fixtures.{ps1,sh}.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONTRACT_VERSION } from "@/lib/mobile-contract";
import { CONTRACT_SCHEMAS } from "./schemas";

const FIXTURES_DIR = join(import.meta.dir, "fixtures");

interface ContractFixture {
  contractVersion: number;
  endpoint: string;
  status: number;
  body: unknown;
}

function loadFixture(name: string): ContractFixture {
  return JSON.parse(
    readFileSync(join(FIXTURES_DIR, `${name}.json`), "utf8"),
  ) as ContractFixture;
}

describe("API-CONTRACT-MOBILE.md §10 — fixtures golden del seam", () => {
  test("biyección exacta entre fixtures/*.json y CONTRACT_SCHEMAS", () => {
    const files = readdirSync(FIXTURES_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
    const schemaNames = Object.keys(CONTRACT_SCHEMAS).sort();
    expect(files).toEqual(schemaNames);
  });

  for (const [name, schema] of Object.entries(CONTRACT_SCHEMAS)) {
    describe(name, () => {
      const fixture = loadFixture(name);

      test(`declara contractVersion = ${CONTRACT_VERSION}`, () => {
        expect(fixture.contractVersion).toBe(CONTRACT_VERSION);
      });

      test("tiene metadata de endpoint y status", () => {
        expect(fixture.endpoint).toMatch(/^(GET|POST|PATCH|DELETE) \/api\//);
        expect(fixture.status).toBeGreaterThanOrEqual(200);
        expect(fixture.status).toBeLessThan(300);
      });

      test("el body valida contra su schema", () => {
        const result = schema.safeParse(fixture.body);
        if (!result.success) {
          // El mensaje completo de Zod en el fallo hace el drift obvio.
          throw new Error(
            `Fixture '${name}' no valida:\n${JSON.stringify(result.error.issues, null, 2)}`,
          );
        }
        expect(result.success).toBe(true);
      });
    });
  }
});
