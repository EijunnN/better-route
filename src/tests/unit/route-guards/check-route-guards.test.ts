/**
 * Auto-tests del gate de tenancy/RBAC (docs/specs/hook-tenancy-gate.spec.md §5).
 *
 * Casos 1-4 de la spec como tests puros sobre la lógica exportada del script.
 * El caso 5 (smoke sobre todas las rutas del repo) se corre por separado
 * pipeando `git ls-files` de las route.ts al script — no vive acá porque su
 * resultado depende del working tree completo, no de la lógica del script.
 */
import { describe, expect, test } from "bun:test";

import {
  evaluateRoute,
  failureReport,
  hasGuards,
  isAllowlisted,
  loadAllowlist,
  toApiRoutePath,
} from "../../../../scripts/check-route-guards";

const ROUTE_PATH = "src/app/api/orders/route.ts";

const CONTENT_BOTH_GUARDS = `
export async function GET(request: NextRequest) {
  const user = await requireRoutePermission(request, EntityType.ORDER, Action.READ);
  if (user instanceof NextResponse) return user;
  const tenant = extractTenantContextAuthed(request, user);
}
`;

const CONTENT_ONLY_RBAC = `
export async function GET(request: NextRequest) {
  const user = await requireRoutePermission(request, EntityType.ORDER, Action.READ);
}
`;

const CONTENT_NO_GUARDS = `
export async function GET() {
  return NextResponse.json({ ok: true });
}
`;

const CONTENT_WRAPPER_A = `
export async function GET(request: NextRequest) {
  const authResult = await setupAuthContext(request);
  if (!authResult.authenticated || !authResult.user) return unauthorizedResponse();
  const permError = await checkPermissionOrError(authResult.user, EntityType.ROLE, Action.READ);
  if (permError) return permError;
}
`;

const CONTENT_TENANT_FILTER = `
export async function GET(request: NextRequest) {
  const user = await requireRoutePermission(request, EntityType.COMPANY, Action.READ);
  if (user instanceof NextResponse) return user;
  const whereClause = withTenantFilter(companies, conditions, user.companyId);
}
`;

const CONTENT_MIDDLEWARE_C = `
export const GET = withAuthAndAudit(
  EntityType.CACHE,
  Action.READ,
  async (_request: AuthenticatedRequest) => NextResponse.json(await getCacheStats()),
);
`;

describe("check-route-guards", () => {
  test("ruta con ambos guards pasa", () => {
    expect(hasGuards(CONTENT_BOTH_GUARDS)).toBe(true);
    expect(evaluateRoute(ROUTE_PATH, CONTENT_BOTH_GUARDS, [])).toBe("pass");
  });

  test("assertSameTenant cuenta como tenant helper", () => {
    const content = `${CONTENT_ONLY_RBAC}\nassertSameTenant(user, companyId);`;
    expect(evaluateRoute(ROUTE_PATH, content, [])).toBe("pass");
  });

  test("requireRoutePermission sin tenant helper falla", () => {
    expect(hasGuards(CONTENT_ONLY_RBAC)).toBe(false);
    expect(evaluateRoute(ROUTE_PATH, CONTENT_ONLY_RBAC, [])).toBe("fail");
  });

  test("wrapper (a): setupAuthContext + checkPermissionOrError pasa", () => {
    expect(hasGuards(CONTENT_WRAPPER_A)).toBe(true);
    expect(evaluateRoute(ROUTE_PATH, CONTENT_WRAPPER_A, [])).toBe("pass");
  });

  test("setupAuthContext solo (tenant sin RBAC) falla", () => {
    const content = "const authResult = await setupAuthContext(request);";
    expect(hasGuards(content)).toBe(false);
  });

  test("checkPermissionOrError solo (RBAC sin tenant) falla", () => {
    const content =
      "const permError = await checkPermissionOrError(user, EntityType.ROLE, Action.READ);";
    expect(hasGuards(content)).toBe(false);
  });

  test("patrón (b): requireRoutePermission + withTenantFilter pasa", () => {
    expect(hasGuards(CONTENT_TENANT_FILTER)).toBe(true);
    expect(evaluateRoute(ROUTE_PATH, CONTENT_TENANT_FILTER, [])).toBe("pass");
  });

  test("withTenantFilter solo falla", () => {
    const content = "const where = withTenantFilter(orders, [], companyId);";
    expect(hasGuards(content)).toBe(false);
  });

  test("wrapper completo (c): withAuthAndAudit solo pasa", () => {
    expect(hasGuards(CONTENT_MIDDLEWARE_C)).toBe(true);
    expect(evaluateRoute(ROUTE_PATH, CONTENT_MIDDLEWARE_C, [])).toBe("pass");
  });

  test("ruta sin nada falla; la misma ruta en la allowlist pasa", () => {
    expect(evaluateRoute(ROUTE_PATH, CONTENT_NO_GUARDS, [])).toBe("fail");
    expect(evaluateRoute(ROUTE_PATH, CONTENT_NO_GUARDS, [ROUTE_PATH])).toBe(
      "pass",
    );
  });

  test("prefijo de allowlist cubre el subtree completo", () => {
    const allowlist = loadAllowlist();
    expect(isAllowlisted("src/app/api/auth/refresh/route.ts", allowlist)).toBe(
      true,
    );
    expect(
      isAllowlisted(
        "src/app/api/auth/sessions/invalidate-all/route.ts",
        allowlist,
      ),
    ).toBe(true);
    expect(isAllowlisted(ROUTE_PATH, allowlist)).toBe(false);
  });

  test("path exacto de allowlist no cubre vecinos", () => {
    const allowlist = ["src/app/api/realtime/token/route.ts"];
    expect(
      isAllowlisted("src/app/api/realtime/token/route.ts", allowlist),
    ).toBe(true);
    expect(
      isAllowlisted("src/app/api/realtime/token/extra/route.ts", allowlist),
    ).toBe(false);
  });

  test("toApiRoutePath normaliza paths absolutos de Windows y filtra no-rutas", () => {
    expect(
      toApiRoutePath(
        "C:\\Users\\vicen\\Desktop\\Projects\\Bun\\planeamiento\\src\\app\\api\\orders\\route.ts",
      ),
    ).toBe("src/app/api/orders/route.ts");
    expect(toApiRoutePath("src/app/api/orders/helpers.ts")).toBeNull();
    expect(toApiRoutePath("src/components/orders/route.ts")).toBeNull();
    expect(toApiRoutePath("src/app/api/route.ts")).toBe("src/app/api/route.ts");
  });

  test("failureReport usa el mensaje de la spec §4", () => {
    const report = failureReport(["src/app/api/foo/route.ts"]);
    expect(report).toContain(
      "✗ route-guards: src/app/api/foo/route.ts no tiene guards de tenancy/RBAC.",
    );
    expect(report).toContain(
      "1. requireRoutePermission(request, EntityType.X, Action.Y)",
    );
    expect(report).toContain("scripts/route-guards-allowlist.json");
  });
});
