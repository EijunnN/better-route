/**
 * assertSameTenant — guard de tenancy para rutas con `companyId` en el path.
 *
 * Por qué existe este archivo
 * ─────────────────────────────────────────────────────────────────────
 * `/api/companies/[id]` usaba `setupAuthContext`, que exige el header
 * `x-company-id` cuando el JWT no trae companyId — el caso de
 * ADMIN_SISTEMA. La página /companies no manda ese header (la empresa
 * objetivo está en el path), así que editar una empresa devolvía
 * `401 UNAUTHORIZED` en lugar de funcionar: un admin legítimo tratado
 * como no autenticado.
 *
 * El contrato que fija este test: el path nombra al tenant, el header es
 * irrelevante, y un cruce de tenant es 403 — nunca 401.
 */

import { describe, expect, test } from "bun:test";
import { NextResponse } from "next/server";

import type { AuthenticatedUser } from "@/lib/auth/auth-api";
import { getTenantContext } from "@/lib/infra/tenant";
import { assertSameTenant } from "@/lib/routing/route-helpers";

const COMPANY_A = "11111111-1111-1111-1111-111111111111";
const COMPANY_B = "22222222-2222-2222-2222-222222222222";

function makeUser(
  overrides: Partial<AuthenticatedUser> = {},
): AuthenticatedUser {
  return {
    userId: "user-1",
    companyId: COMPANY_A,
    email: "user@test.local",
    role: "ADMIN_FLOTA",
    ...overrides,
  };
}

describe("assertSameTenant", () => {
  test("ADMIN_SISTEMA opera sobre cualquier empresa sin header", () => {
    const result = assertSameTenant(
      makeUser({ role: "ADMIN_SISTEMA", companyId: null }),
      COMPANY_B,
    );

    expect(result).toBeNull();
    expect(getTenantContext()?.companyId).toBe(COMPANY_B);
  });

  test("un usuario de la empresa del path pasa y entra a su tenant", () => {
    const result = assertSameTenant(makeUser(), COMPANY_A);

    expect(result).toBeNull();
    expect(getTenantContext()?.companyId).toBe(COMPANY_A);
  });

  test("cross-tenant es 403 TENANT_MISMATCH, nunca 401", async () => {
    const result = assertSameTenant(makeUser(), COMPANY_B);

    expect(result).toBeInstanceOf(NextResponse);
    if (!result) throw new Error("esperaba una respuesta 403");
    expect(result.status).toBe(403);
    expect(await result.json()).toMatchObject({ code: "TENANT_MISMATCH" });
  });

  test("una denegación no entra al tenant ajeno", () => {
    assertSameTenant(makeUser(), COMPANY_A);
    assertSameTenant(makeUser(), COMPANY_B);

    expect(getTenantContext()?.companyId).toBe(COMPANY_A);
  });

  test("un usuario sin empresa no opera sobre ninguna", () => {
    const result = assertSameTenant(makeUser({ companyId: null }), COMPANY_A);

    expect(result?.status).toBe(403);
  });
});
