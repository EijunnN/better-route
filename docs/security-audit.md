# Security Audit — Multi-Tenant API (Pre-Deploy)

**Scope:** `src/app/api/**/route.ts` — 111 route files audited
**Audit date:** 2026-04-17
**Focus:** (A) Tenant isolation on `companyId`-scoped tables, (B) authorization enforcement
**Severity scale:** CRITICAL | HIGH | MEDIUM | LOW | OK

---

## Executive Summary

- **Routes audited:** 111
- **CRITICAL findings:** 6 systemic (affecting ~90 routes) + 2 route-specific
- **HIGH findings:** 8 route-specific
- **MEDIUM findings:** 5
- **LOW findings:** 3

The codebase enforces **authorization** reasonably well — nearly every data route gates with `requireRoutePermission(...)` or `checkPermissionOrError(...)` before DB access, and role permissions are pre-defined. However, the **tenant isolation model is broken by design**: the canonical helper `extractTenantContext(request)` reads `x-company-id` **from a request header without ever cross-checking it against the authenticated user's JWT `companyId`**. Any non-admin user can set that header to any company UUID and the rest of the request will operate against that tenant. `withTenantFilter(...)` then faithfully filters to the forged companyId, so the query succeeds and **returns another tenant's data**.

Effect: a PLANIFICADOR in company A can, by sending `x-company-id: <B>` with their valid access token, read/write/import/delete orders, vehicles, fleets, users, drivers, optimization jobs, alerts, tracking settings, role definitions, custom field definitions, and workflow states for company B. This is a cross-tenant data breach path present on ~90 of 111 routes. The gap is not a per-route coding slip — it is the intended contract of `extractTenantContext` (`src/lib/routing/route-helpers.ts` lines 22–30) and `setupAuthContext` (lines 66–107), which trusts header-supplied companyId as long as `x-company-id` is present, and only falls through to the JWT when it is absent.

Two other systemic gaps are notable: a handful of sensitive mutation endpoints under `/api/output/[outputId]`, `/api/driver-assignment/remove/*` (GET), `/api/reassignment/output/[historyId]` (POST), and `/api/optimization/jobs/[id]/confirm` (GET) either skip permission checks or skip authentication entirely; and two monitoring endpoints use `optionalRoutePermission`, which returns success even when the caller is unauthenticated, yielding anonymous cross-tenant reads.

**Top-priority remediation:** add one mandatory check inside `extractTenantContext` / `setupAuthContext` — `if (user.role !== "ADMIN_SISTEMA" && headerCompanyId !== user.companyId) return 403`. This single change closes the CRITICAL cross-tenant surface on every route that uses the helper without touching route logic.

---

## Top 5 Systemic Issues

### 1. CRITICAL — Header-only tenant trust (IDOR across ALL tenant-scoped routes)

**Where:** `src/lib/routing/route-helpers.ts` — `extractTenantContext()` (lines 22–30) and `extractUserContext()` / `setupAuthContext()` (lines 36–107).

`extractTenantContext` returns `{ companyId, userId }` parsed from `x-company-id` and `x-user-id` headers with **no validation**. These values are then fed into `setTenantContext(...)` and `withTenantFilter(..., companyId)` across ~90 routes. The JWT is validated separately (by `requireRoutePermission` → `getAuthenticatedUser`) but the JWT's `companyId` is never compared to the header value, so a valid non-admin token + forged header grants cross-tenant access.

Even worse, `setupAuthContext` treats fully header-supplied user identity as authoritative when all four headers (`x-company-id`, `x-user-id`, `x-user-email`, `x-user-role`) are present (lines 49–51). Although the JWT path below still runs in most routes, any route whose *only* auth is `setupAuthContext` (e.g. `/api/companies`, `/api/roles/*`, `/api/users/[id]/roles`, `/api/permissions`) trusts the header-supplied role. **An attacker can set `x-user-role: ADMIN_SISTEMA` and read all companies** — see finding A-2.

**Exploit sketch (any PLANIFICADOR token):**

```http
GET /api/orders?limit=5000 HTTP/1.1
Cookie: access_token=<valid token for user in company A>
x-company-id: <UUID of company B>

HTTP/1.1 200 OK
{"data":[ ...5000 orders from company B... ]}
```

Applies to: every route table row marked `header-trust` in the audit tables.

**Fix (one place, closes all 90+ routes):**

```ts
// src/lib/routing/route-helpers.ts
export async function extractTenantContextAuthed(
  request: NextRequest,
  user: AuthenticatedUser,
): Promise<{ companyId: string; userId: string } | NextResponse> {
  const headerCompanyId = request.headers.get("x-company-id");

  // ADMIN_SISTEMA has no companyId in JWT — they must choose one via header.
  if (user.role === "ADMIN_SISTEMA") {
    if (!headerCompanyId) {
      return NextResponse.json(
        { error: "x-company-id header required for ADMIN_SISTEMA" },
        { status: 400 },
      );
    }
    return { companyId: headerCompanyId, userId: user.userId };
  }

  // Non-admin: JWT's companyId is authoritative.
  if (!user.companyId) {
    return NextResponse.json(
      { error: "User has no company", code: "NO_COMPANY" },
      { status: 403 },
    );
  }

  // If a header was sent, it MUST match the JWT (defense-in-depth).
  if (headerCompanyId && headerCompanyId !== user.companyId) {
    return NextResponse.json(
      { error: "Tenant mismatch", code: "TENANT_MISMATCH" },
      { status: 403 },
    );
  }

  return { companyId: user.companyId, userId: user.userId };
}
```

Then retrofit every call site:

```ts
// Before
const tenantCtx = extractTenantContext(request);
if (!tenantCtx) return NextResponse.json({ error: "Missing tenant context" }, { status: 401 });
setTenantContext(tenantCtx);

// After
const authResult = await requireRoutePermission(request, EntityType.ORDER, Action.READ);
if (authResult instanceof NextResponse) return authResult;
const tenantCtx = await extractTenantContextAuthed(request, authResult);
if (tenantCtx instanceof NextResponse) return tenantCtx;
setTenantContext(tenantCtx);
```

The ordering (auth first, then tenant-derivation) also fixes issue #3 below.

### 2. CRITICAL — Header-supplied `x-user-role` overrides JWT in `setupAuthContext`

**Where:** `src/lib/routing/route-helpers.ts` lines 36–60 (`extractUserContext`) used by `setupAuthContext` (lines 66–107).

If the request carries all four of `x-company-id`, `x-user-id`, `x-user-email`, and `x-user-role` headers, `setupAuthContext` **skips the JWT check entirely** and returns an `AuthenticatedUser` built from headers. This is the `if (companyId && userId && email && role)` short-circuit on line 49. Several routes (`/api/companies`, `/api/companies/[id]`, `/api/roles/*`, `/api/users/[id]/roles`, `/api/permissions`, `/api/users/[id]/sessions` (indirect)) use `setupAuthContext`, and their permission check relies on `user.role`. An attacker can send headers `x-user-role: ADMIN_SISTEMA` plus any UUIDs and bypass all permission checks entirely (including RBAC), because `hasPermission()` sees the forged role and returns `true` for the wildcard `*` permission.

No token is needed at all in that path — the function never verifies the headers correspond to a real session.

**Fix:** delete lines 49–59 in `extractUserContext` and make `setupAuthContext` call `getAuthenticatedUser` directly. Headers should only serve as a tenant-selection hint *after* JWT validation, never as an auth fallback.

```ts
// src/lib/routing/route-helpers.ts — replace setupAuthContext
export async function setupAuthContext(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request); // JWT only
    // Derive companyId safely (see issue #1 fix).
    const tenant = await extractTenantContextAuthed(request, user);
    if (tenant instanceof NextResponse) return { authenticated: false, user: null, error: tenant };
    setTenantContext(tenant);
    return { authenticated: true, user: { ...user, companyId: tenant.companyId } };
  } catch {
    return { authenticated: false, user: null };
  }
}
```

### 3. HIGH — Permission check runs *after* tenant context is set on many routes

**Pattern:** Many routes set `setTenantContext(tenantCtx)` *before* calling `requireRoutePermission(...)`. Examples: `src/app/api/optimization/jobs/[id]/route.ts` (lines 19–32), `src/app/api/alerts/route.ts` (lines 13–25), `src/app/api/alerts/rules/route.ts` (lines 13–25), `src/app/api/monitoring/drivers/[id]/route.ts`, `src/app/api/monitoring/events/route.ts`, `src/app/api/mobile/driver/my-orders/route.ts`, `src/app/api/mobile/driver/location/route.ts`, `src/app/api/mobile/driver/my-route/route.ts`, `src/app/api/zones/*`.

Because tenant context mutates `AsyncLocalStorage`, a side-effect of this ordering is that the error response for a missing tenant header (401) leaks before any auth check, making anonymous enumeration of permitted/denied endpoints easier. When combined with finding #1, it also means the tenant was already trusted before the request was authorized. The mobile endpoints explicitly use the tenantCtx to decide which company's data to serve, so the pre-auth `setTenantContext` is logically meaningless but demonstrates the anti-pattern.

**Fix:** always auth first, then tenant:

```ts
export async function GET(request: NextRequest) {
  const user = await requireRoutePermission(request, EntityType.X, Action.READ);
  if (user instanceof NextResponse) return user;
  const tenant = await extractTenantContextAuthed(request, user);
  if (tenant instanceof NextResponse) return tenant;
  setTenantContext(tenant);
  // … now run business logic …
}
```

### 4. CRITICAL — `optionalRoutePermission` on tenant-scoped monitoring endpoints

**Where:** `src/app/api/monitoring/summary/route.ts` line 33, `src/app/api/monitoring/geojson/route.ts` line 68.

These two endpoints call `optionalRoutePermission(...)` (`src/lib/infra/api-middleware.ts` lines 121–138), which returns `null` on authentication failure and continues execution. The only remaining gate is `tenantCtx` from the `x-company-id` header. Result: **anyone on the internet can hit these endpoints unauthenticated**, supply any company UUID, and receive that company's fleet positions, route GeoJSON, driver counts, active alerts counts, completion percentages — real-time operational data.

This is not hypothetical: the routes explicitly comment "Optional auth - if authenticated, enforce permissions". There is no IP allowlist, no internal-service token, no rate limit beyond the shared rate limiter (not applied here).

**Fix:** either (a) promote to `requireRoutePermission` (preferred — monitoring needs RBAC anyway: MONITOR / ADMIN roles), or (b) if truly public is desired for embedded dashboards, add a signed query-param token like `/api/public/tracking/[token]` does.

### 5. HIGH — Sensitive mutations with missing or skipped permission checks

| Route | Method | Issue |
|---|---|---|
| `src/app/api/output/[outputId]/route.ts` | POST | No `requireRoutePermission` at all; only reads tenant from `getTenantContext()` which (on a fresh request) returns the default `{ companyId: null }` because nothing earlier set it. The route then calls `setTenantContext({ companyId, userId: "" })` with that null-ish object and `generatePlanOutput(companyId, ...)` — effectively uncontrolled invocation. |
| `src/app/api/output/[outputId]/route.ts` | DELETE | Same pattern — no auth, no permission. |
| `src/app/api/driver-assignment/remove/[routeId]/[vehicleId]/route.ts` | GET | Only reads tenant context, no `requireRoutePermission`. Returns current driver assignment — information disclosure. |
| `src/app/api/reassignment/output/[historyId]/route.ts` | POST | No `requireRoutePermission` — triggers output regeneration and "notifications" for any reassignment history row in the tenant. |
| `src/app/api/optimization/jobs/[id]/confirm/route.ts` | GET | No `requireRoutePermission` — reveals confirmed plan metadata and `confirmedBy` user ID for any job. |
| `src/app/api/optimization/jobs/[id]/route.ts` | GET, DELETE | `setTenantContext` is called **before** `requireRoutePermission` (lines 19–32 and 86–99); same ordering anti-pattern as issue #3. DELETE is a destructive cancel with `Action.DELETE`, which is appropriate, but ordering must be inverted. |
| `src/app/api/admin/cache/route.ts` | POST (warmup) | Takes `companyId` from the **request body**, not the JWT. Requires `EntityType.CACHE` + `Action.WARMUP` which ADMIN_SISTEMA has via `*`, but any legitimately-admin caller can warm cache for an arbitrary tenant — acceptable for SYSTEM role, however the body-supplied companyId pattern is an anti-pattern if this endpoint is ever granted to non-SISTEMA in future. Document or hard-code `isAdmin()` check (already present as double-check on DELETE line 47 — missing on POST). |

**Fix:** add `requireRoutePermission` at the top of every handler before any DB read/write. Use the correct `EntityType` + `Action` pair (see tables below). For `output/*` POST/DELETE, use `EntityType.OUTPUT` + `Action.UPDATE` / `Action.DELETE`.

---

## Additional Systemic Observations

### MEDIUM — Orders DELETE is a soft-delete gated by `Action.DELETE`, but **batch delete requires `Action.BULK_DELETE`** — check grant

`ROLE_PERMISSIONS` in `src/lib/auth/authorization.ts` grants `EntityType.ORDER:Action.DELETE` to no legacy role except `ADMIN_SISTEMA` (via wildcard). PLANIFICADOR has create/update/validate/import on orders but not delete. That is correct. However, the custom-role pipeline in `getUserPermissionsFromDB` (lines 493–583) can grant `order:delete` to any custom role a company admin creates, which is also correct design — just validate that DB-seeded system roles do not grant it by accident. (Recommended: write a smoke test at startup that asserts PLANIFICADOR's computed permission set does not include `order:delete`.)

### MEDIUM — `orders/batch/delete` hard-delete bypasses tenant filter in a transaction

`src/app/api/orders/batch/delete/route.ts` lines 44–55 delete from `trackingTokens`, `routeStops`, and `orders` filtered by `companyId` — that filter comes from `tenantCtx.companyId`, which (per finding #1) can be any company. The operation is a physical cascade delete of every order, every route stop, and every tracking token for the targeted tenant. With a forged header, a non-admin user can wipe another company's entire order history. Combined with the `Action.BULK_DELETE` gate (PLANIFICADOR does not have it, but any custom role could), this is at minimum a data-integrity blast radius concern. Though line 33 restricts hard-delete to `ADMIN_SISTEMA`, soft-delete (active=false on all orders for a tenant) is still reachable by any role with `order:bulk_delete`, which is not currently in any legacy role but **can be granted via custom role** (`getUserPermissionsFromDB`).

### MEDIUM — `reassignment/execute` validates `data.companyId === tenantCtx.companyId` but tenantCtx is forged

Line 60 of `reassignment/execute/route.ts` checks the request-body companyId matches `tenantCtx.companyId`. Since both come from attacker-controlled surfaces (body + header), this check is a no-op against a motivated attacker. Fix at the tenant-derivation layer (#1) makes this check effective.

### LOW — `/api/health` is public

`/api/health` leaks database-reachable/unreachable state to anyone. This is standard for load balancers but consider a dedicated unauthenticated liveness on `/healthz` that returns only `200 OK` with no body, and put DB check behind a private network.

### LOW — `x-user-id` header used as audit actor

When the JWT path in `setupAuthContext` runs, `tenantCtx.userId` is set from `user.userId` (good). But when the header short-circuit runs (finding #2), `userId` is taken from `x-user-id`. Audit logs built via `getAuditLogContext()` in `src/db/tenant-aware.ts` use this value. An attacker can impersonate any user in audit trails.

### LOW — JWT `companyId` is not re-validated against `users.companyId` on each request

The JWT may be stale if a user is moved between companies. Consider periodic revalidation or at least invalidate sessions when `users.companyId` changes. Low risk for pre-deploy but worth noting.

---

## Audit A — Tenant Isolation Findings

**Legend:** `header-trust` = route calls `extractTenantContext(request)` and does not cross-validate header vs JWT (Finding #1 applies). `filter-ok` = once `companyId` is set, DB queries do apply `companyId` filtering (either via `withTenantFilter` or explicit `eq(table.companyId, …)`). `CROSS-CHECK` = route explicitly compares JWT role/companyId to URL param (good).

| Route | Method | Gap | Severity | Fix |
|---|---|---|---|---|
| `/api/orders` | GET, POST | header-trust; filter-ok | CRITICAL | Apply finding #1 fix |
| `/api/orders/[id]` | GET, PATCH, DELETE | header-trust; filter-ok | CRITICAL | Apply finding #1 fix |
| `/api/orders/batch` | POST | header-trust; filter-ok | CRITICAL | Apply finding #1 fix |
| `/api/orders/batch/delete` | DELETE | header-trust; filter-ok; hard-delete blast radius | CRITICAL | Apply finding #1 fix + restrict `BULK_DELETE` grants |
| `/api/orders/import` | POST | header-trust; filter-ok | CRITICAL | Apply finding #1 fix |
| `/api/orders/import/suggest-mapping` | POST | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/orders/validate` | POST | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/orders/geojson` | GET | header-trust; filter-ok | CRITICAL | Apply finding #1 fix |
| `/api/orders/pending-summary` | GET | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/orders/csv-template` | GET | header-trust; filter-ok | MEDIUM | Apply finding #1 fix |
| `/api/vehicles` | GET, POST | header-trust; filter-ok | CRITICAL | Apply finding #1 fix |
| `/api/vehicles/[id]` | GET, PATCH, DELETE | header-trust; filter-ok | CRITICAL | Apply finding #1 fix |
| `/api/vehicles/[id]/skills` | GET, POST, DELETE | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/vehicles/[id]/status-history` | GET | header-trust; filter-ok | MEDIUM | Apply finding #1 fix |
| `/api/vehicles/[id]/status-transition` | POST | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/vehicles/available` | GET | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/vehicle-skills` | GET, POST | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/vehicle-skills/[id]` | GET, PATCH, DELETE | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/fleets` | GET, POST | header-trust; filter-ok | CRITICAL | Apply finding #1 fix |
| `/api/fleets/[id]` | GET, PATCH, DELETE | header-trust; filter-ok; uses `TenantAccessDeniedError` import but still trusts header | CRITICAL | Apply finding #1 fix |
| `/api/fleets/[id]/vehicles` | GET, POST | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/fleets/[id]/vehicle-counts` | GET | header-trust; filter-ok | MEDIUM | Apply finding #1 fix |
| `/api/users` | GET, POST | header-trust; filter-ok; ADMIN_SISTEMA handled via `companyId = null` | CRITICAL | Apply finding #1 fix |
| `/api/users/[id]` | GET, PUT, DELETE | header-trust; filter-ok | CRITICAL | Apply finding #1 fix |
| `/api/users/import` | POST | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/users/[id]/roles` | GET, POST, DELETE | `setupAuthContext` header trust (finding #2) | CRITICAL | Apply findings #1 + #2 fixes |
| `/api/users/[id]/sessions` | GET, DELETE | JWT-only auth via `getAuthenticatedUser` — no tenant filter; session ownership checked; cross-tenant admin override possible only via forged role | HIGH | Remove `authorize` role override or tighten |
| `/api/user-skills` | GET, POST | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/user-skills/[id]` | GET, PATCH, DELETE | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/companies` | GET, POST | `setupAuthContext` → ADMIN_SISTEMA check; CREATE bypasses tenant filter by design | CRITICAL | Apply finding #2 fix (drop header role trust) |
| `/api/companies/[id]` | GET, PATCH, DELETE | `setupAuthContext` + `canAccessCompany(user, id)` CROSS-CHECK — correctly gated if JWT is trusted | OK (depends on #2) | Apply finding #2 fix |
| `/api/companies/[id]/workflow-states` | GET, POST | `setupAuthContext` + explicit `canAccessCompany` CROSS-CHECK | OK (depends on #2) | Apply finding #2 fix |
| `/api/companies/[id]/workflow-states/[stateId]` | PATCH, DELETE | `canAccessCompany` CROSS-CHECK | OK (depends on #2) | Apply finding #2 fix |
| `/api/companies/[id]/workflow-transitions` | GET, POST | `canAccessCompany` CROSS-CHECK | OK (depends on #2) | Apply finding #2 fix |
| `/api/companies/[id]/workflow-transitions/[transitionId]` | PATCH, DELETE | `canAccessCompany` CROSS-CHECK | OK (depends on #2) | Apply finding #2 fix |
| `/api/companies/[id]/field-definitions` | GET, POST | `canAccessCompany` CROSS-CHECK | OK (depends on #2) | Apply finding #2 fix |
| `/api/companies/[id]/field-definitions/[fieldId]` | PATCH, DELETE | `canAccessCompany` CROSS-CHECK | OK (depends on #2) | Apply finding #2 fix |
| `/api/company-profiles` | GET, POST, PUT, DELETE | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/roles` | GET, POST | `setupAuthContext` (finding #2); `tenantCtx.companyId` used to scope | CRITICAL | Apply finding #2 fix |
| `/api/roles/[id]` | GET, PATCH, DELETE | `setupAuthContext`; company scoping on all reads | CRITICAL | Apply finding #2 fix |
| `/api/roles/[id]/permissions` | GET, PUT, PATCH | `setupAuthContext`; company scoping | CRITICAL | Apply finding #2 fix |
| `/api/roles/batch/permissions` | GET | `setupAuthContext`; verifies roles belong to company | CRITICAL | Apply finding #2 fix |
| `/api/permissions` | GET | `setupAuthContext`; lists system-wide permissions catalog | MEDIUM | Apply finding #2 fix; read-only catalog so impact limited |
| `/api/plans/[id]` | GET | header-trust; filter-ok | CRITICAL | Apply finding #1 fix |
| `/api/plans` (GET/POST) | GET, POST | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/alerts` | GET, POST | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/alerts/[id]` | GET, PATCH, DELETE | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/alerts/[id]/acknowledge` | POST | header-trust; filter-ok | MEDIUM | Apply finding #1 fix |
| `/api/alerts/[id]/dismiss` | POST | header-trust; filter-ok | MEDIUM | Apply finding #1 fix |
| `/api/alerts/rules` | GET, POST | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/alerts/rules/[id]` | GET, PATCH, DELETE | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/alerts/evaluate` | POST | header-trust; evaluates alerts for the forged tenant | HIGH | Apply finding #1 fix |
| `/api/driver-assignment/manual` | POST | header-trust; `vehicle.companyId` defense-in-depth check exists | HIGH | Apply finding #1 fix |
| `/api/driver-assignment/suggestions` | POST | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/driver-assignment/validate` | POST | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/driver-assignment/history/[routeId]` | GET | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/driver-assignment/remove/[routeId]/[vehicleId]` | GET | header-trust; **no permission check**; defense-in-depth tenant check on vehicle | CRITICAL | Add `requireRoutePermission`; apply finding #1 |
| `/api/driver-assignment/remove/[routeId]/[vehicleId]` | DELETE | header-trust; permission = `ROUTE:ASSIGN`; defense-in-depth tenant check on vehicle | HIGH | Apply finding #1 fix |
| `/api/reassignment/execute` | POST | header-trust; `data.companyId === tenantCtx.companyId` (no-op against #1) | CRITICAL | Apply finding #1 fix |
| `/api/reassignment/history` | GET | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/reassignment/impact` | POST | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/reassignment/options` | POST | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/reassignment/output/[historyId]` | GET | header-trust; filter-ok (explicit companyId) | HIGH | Apply finding #1 fix |
| `/api/reassignment/output/[historyId]` | POST | header-trust; **no permission check** | CRITICAL | Add `requireRoutePermission(REASSIGNMENT, UPDATE)`; apply #1 |
| `/api/route-stops` | GET, POST | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/route-stops/[id]` | GET, PATCH, DELETE | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/route-stops/[id]/history` | GET | header-trust; filter-ok | MEDIUM | Apply finding #1 fix |
| `/api/monitoring/drivers` | GET | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/monitoring/drivers/[id]` | GET | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/monitoring/events` | GET | header-trust; filter via jobId (jobId is tenant-filtered) | HIGH | Apply finding #1 fix |
| `/api/monitoring/summary` | GET | header-trust + `optionalRoutePermission` — **anonymous cross-tenant read** (finding #4) | CRITICAL | Promote to `requireRoutePermission` + apply #1 |
| `/api/monitoring/geojson` | GET | header-trust + `optionalRoutePermission` — **anonymous cross-tenant read** (finding #4) | CRITICAL | Promote to `requireRoutePermission` + apply #1 |
| `/api/optimization/jobs` | GET, POST | header-trust; filter-ok | CRITICAL | Apply finding #1 fix |
| `/api/optimization/jobs/[id]` | GET, DELETE | header-trust; filter-ok; perm check runs AFTER `setTenantContext` (finding #3) | HIGH | Apply #1 + reorder auth before tenant |
| `/api/optimization/jobs/[id]/confirm` | POST | header-trust; filter-ok | CRITICAL | Apply finding #1 fix |
| `/api/optimization/jobs/[id]/confirm` | GET | header-trust; **no permission check** | HIGH | Add `requireRoutePermission(PLAN, READ)`; apply #1 |
| `/api/optimization/jobs/[id]/metrics` | GET | header-trust; filter-ok | MEDIUM | Apply finding #1 fix |
| `/api/optimization/jobs/[id]/reassign` | POST | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/optimization/jobs/[id]/swap-vehicles` | POST | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/optimization/jobs/[id]/validate` | POST | header-trust; filter-ok | MEDIUM | Apply finding #1 fix |
| `/api/optimization/configure` | GET, POST | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/optimization/configure/[id]` | GET, PATCH, DELETE | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/optimization/engines` | GET | no tenant coupling (engine list is static/global) | OK | — |
| `/api/optimization-presets` | GET, POST | header-trust; filter-ok | MEDIUM | Apply finding #1 fix |
| `/api/optimization-presets/[id]` | GET, PATCH, DELETE | header-trust; filter-ok | MEDIUM | Apply finding #1 fix |
| `/api/time-window-presets` | GET, POST | header-trust; filter-ok | MEDIUM | Apply finding #1 fix |
| `/api/time-window-presets/[id]` | GET, PATCH, DELETE | header-trust; filter-ok | MEDIUM | Apply finding #1 fix |
| `/api/csv-column-mapping-templates` | GET, POST | header-trust; filter-ok | MEDIUM | Apply finding #1 fix |
| `/api/csv-column-mapping-templates/[id]` | GET, PATCH, DELETE | header-trust; filter-ok | MEDIUM | Apply finding #1 fix |
| `/api/output` | GET | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/output/[outputId]` | GET | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/output/[outputId]` | POST | **no auth check, no permission check**; uses `getTenantContext()` (not `setup`) which returns null companyId on a fresh request | CRITICAL | Add `requireRoutePermission(OUTPUT, UPDATE)`; apply #1 |
| `/api/output/[outputId]` | DELETE | **no auth check, no permission check** (also a no-op in implementation) | CRITICAL | Add `requireRoutePermission(OUTPUT, DELETE)` or remove route |
| `/api/metrics/history` | GET | perm check via `requireRoutePermission` but reads tenantContext from `getTenantContext()` — returns null companyId; endpoint then early-returns 400 unless an earlier call seeded context; effectively broken | MEDIUM | Use `extractTenantContextAuthed` |
| `/api/zones` | GET, POST | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/zones/[id]` | GET, PATCH, DELETE | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/zones/[id]/vehicles` | GET, POST, DELETE | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/tracking/generate` | POST | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/tracking/settings` | GET, PUT | header-trust; filter-ok | HIGH | Apply finding #1 fix |
| `/api/mobile/driver/my-orders` | GET | header-trust; filter-ok; additional `authUser.role !== CONDUCTOR` check | HIGH | Apply finding #1 fix |
| `/api/mobile/driver/my-route` | GET | header-trust; filter-ok; CONDUCTOR gate | HIGH | Apply finding #1 fix |
| `/api/mobile/driver/location` | POST, GET | header-trust; filter-ok; CONDUCTOR gate | HIGH | Apply finding #1 fix |
| `/api/mobile/driver/field-definitions` | GET | header-trust; filter-ok | MEDIUM | Apply finding #1 fix |
| `/api/mobile/driver/workflow-states` | GET | header-trust; filter-ok | MEDIUM | Apply finding #1 fix |
| `/api/public/tracking/[token]` | GET | public by design; token → companyId lookup — no IDOR risk; rate-limited | OK | — |
| `/api/admin/cache` | GET, DELETE, POST | `withAuthAndAudit` + explicit `isAdmin()` on DELETE; POST takes companyId from body without `isAdmin` re-check | MEDIUM | Add `isAdmin()` re-check on POST warmup |
| `/api/onboarding/setup` | POST | JWT auth + `user.role !== "ADMIN_SISTEMA"` check + `companyCount > 0` guard | OK | — |
| `/api/auth/login` | POST | public; rate-limited; returns JWT with JWT-bound companyId | OK | — |
| `/api/auth/refresh` | POST | JWT-bound; validates refresh token against Redis | OK | — |
| `/api/auth/me` | GET | JWT-only | OK | — |
| `/api/auth/logout` | POST | JWT-only | OK | — |
| `/api/auth/sessions` | GET | JWT-only; filters to own userId | OK | — |
| `/api/auth/sessions/[id]` | GET, DELETE | JWT-only; ownership + admin override | OK | — |
| `/api/auth/sessions/invalidate-all` | POST | JWT + `authorize(user, SESSION, INVALIDATE_ALL)` — ADMIN_SISTEMA only | OK | — |
| `/api/health` | GET | public | LOW | Consider private liveness |
| `/api/upload/presigned-url` | GET | JWT auth; uses `authUser.companyId` from JWT directly — good; no permission check but file scope limited by companyId path prefix | MEDIUM | Add `requireRoutePermission(OUTPUT/ORDER, UPDATE)` to gate uploads |

**Tenant finding totals:** 111 routes audited — 34 CRITICAL, 44 HIGH, 17 MEDIUM, 2 LOW, 14 OK (public/auth/admin routes).

---

## Audit B — Authorization Enforcement Findings

**Legend:** `gated` = `requireRoutePermission` / `withPermission` / `withAuthAndAudit` / `setupAuthContext`+`checkPermissionOrError` called before DB access. `ungated` = handler reaches DB without a permission check (auth-only or none).

| Route | Method | Enforcement | EntityType:Action | Sensible? | Severity | Fix |
|---|---|---|---|---|---|---|
| `/api/orders` | GET | `requireRoutePermission` | ORDER:READ | yes | OK | — |
| `/api/orders` | POST | `requireRoutePermission` | ORDER:CREATE | yes | OK | — |
| `/api/orders/[id]` | GET | `requireRoutePermission` | ORDER:READ | yes | OK | — |
| `/api/orders/[id]` | PATCH | `requireRoutePermission` | ORDER:UPDATE | yes | OK | — |
| `/api/orders/[id]` | DELETE | `requireRoutePermission` | ORDER:DELETE | yes | OK | — |
| `/api/orders/batch` | POST | `requireRoutePermission` | ORDER:IMPORT | yes | OK | — |
| `/api/orders/batch/delete` | DELETE | `requireRoutePermission` + role check for hard delete | ORDER:BULK_DELETE | yes | OK | — |
| `/api/orders/import` | POST | `requireRoutePermission` | ORDER:IMPORT | yes | OK | — |
| `/api/orders/geojson` | GET | `requireRoutePermission` | ORDER:READ | yes | OK | — |
| `/api/orders/pending-summary` | GET | `requireRoutePermission` | ORDER:READ | yes | OK | — |
| `/api/orders/validate` | POST | `requireRoutePermission` | ORDER:VALIDATE | yes | OK | — |
| `/api/orders/csv-template` | GET | `requireRoutePermission` | ORDER:READ | yes | OK | — |
| `/api/orders/import/suggest-mapping` | POST | `requireRoutePermission` | ORDER:IMPORT | yes | OK | — |
| `/api/vehicles` | GET | `requireRoutePermission` | VEHICLE:READ | yes | OK | — |
| `/api/vehicles` | POST | `requireRoutePermission` | VEHICLE:CREATE | yes | OK | — |
| `/api/vehicles/[id]` | GET, PATCH, DELETE | `requireRoutePermission` | VEHICLE:{READ,UPDATE,DELETE} | yes | OK | — |
| `/api/vehicles/[id]/skills` | * | `requireRoutePermission` | VEHICLE:UPDATE | acceptable | OK | consider VEHICLE_SKILL:ASSIGN |
| `/api/vehicles/[id]/status-history` | GET | `requireRoutePermission` | VEHICLE:READ | yes | OK | — |
| `/api/vehicles/[id]/status-transition` | POST | `requireRoutePermission` | VEHICLE:CHANGE_STATUS | yes | OK | — |
| `/api/vehicles/available` | GET | `requireRoutePermission` | VEHICLE:READ | yes | OK | — |
| `/api/vehicle-skills` | * | `requireRoutePermission` | VEHICLE_SKILL:* | yes | OK | — |
| `/api/fleets` | * | `requireRoutePermission` | FLEET:* | yes | OK | — |
| `/api/fleets/[id]` | * | `requireRoutePermission` | FLEET:* | yes | OK | — |
| `/api/fleets/[id]/vehicles` | * | `requireRoutePermission` | FLEET/VEHICLE:* | yes | OK | — |
| `/api/fleets/[id]/vehicle-counts` | GET | `requireRoutePermission` | FLEET:READ | yes | OK | — |
| `/api/users` | GET | `requireRoutePermission` | USER:READ | yes | OK | — |
| `/api/users` | POST | `requireRoutePermission` | USER:CREATE | yes | OK | — |
| `/api/users/[id]` | GET, PUT, DELETE | `requireRoutePermission` | USER:{READ,UPDATE,DELETE} | yes | OK | — |
| `/api/users/import` | POST | `requireRoutePermission` | USER:IMPORT | yes | OK | — |
| `/api/users/[id]/roles` | * | `setupAuthContext` + `checkPermissionOrError` | USER:{READ,UPDATE} | acceptable (could be ROLE:ASSIGN) | MEDIUM | consider dedicated role-assign permission |
| `/api/users/[id]/sessions` | * | `getAuthenticatedUser` + `authorize` | USER:{READ,INVALIDATE_SESSIONS} | yes | OK | — |
| `/api/user-skills` | * | `requireRoutePermission` | DRIVER_SKILL:* | yes | OK | — |
| `/api/companies` | GET, POST | `setupAuthContext` + `checkPermissionOrError` | COMPANY:{READ,CREATE} | yes | OK (pending #2) | — |
| `/api/companies/[id]` | * | `setupAuthContext` + perm + `canAccessCompany` | COMPANY:{READ,UPDATE,DELETE} | yes | OK (pending #2) | — |
| `/api/companies/[id]/workflow-*` | * | `setupAuthContext` + `canAccessCompany` | COMPANY:{READ,UPDATE} | yes | OK (pending #2) | — |
| `/api/companies/[id]/field-definitions*` | * | `setupAuthContext` + `canAccessCompany` | COMPANY:{READ,UPDATE} | yes | OK (pending #2) | — |
| `/api/company-profiles` | * | `requireRoutePermission` | COMPANY:{READ,UPDATE} | yes | OK | — |
| `/api/roles` | GET, POST | `setupAuthContext` + `checkPermissionOrError` | ROLE:{READ,CREATE} | yes | OK (pending #2) | — |
| `/api/roles/[id]` | * | `setupAuthContext` + perm | ROLE:{READ,UPDATE,DELETE} | yes | OK (pending #2) | — |
| `/api/roles/[id]/permissions` | * | `setupAuthContext` + perm | ROLE:{READ,UPDATE} | yes | OK (pending #2) | — |
| `/api/roles/batch/permissions` | GET | `setupAuthContext` + perm | ROLE:READ | yes | OK (pending #2) | — |
| `/api/permissions` | GET | `setupAuthContext` + perm | PERMISSION:READ | yes | OK (pending #2) | — |
| `/api/plans/[id]` | GET | `requireRoutePermission` | PLAN:READ | yes | OK | — |
| `/api/plans` | GET, POST | `requireRoutePermission` | PLAN:* | yes | OK | — |
| `/api/alerts` | GET, POST | `requireRoutePermission` | ALERT:{READ,CREATE} | yes | OK | — |
| `/api/alerts/[id]` | GET, PATCH, DELETE | `requireRoutePermission` | ALERT:* | yes | OK | — |
| `/api/alerts/[id]/acknowledge` | POST | `requireRoutePermission` | ALERT:ACKNOWLEDGE | yes | OK | — |
| `/api/alerts/[id]/dismiss` | POST | `requireRoutePermission` | ALERT:DISMISS | yes | OK | — |
| `/api/alerts/rules` | * | `requireRoutePermission` | ALERT_RULE:* | yes | OK | — |
| `/api/alerts/rules/[id]` | * | `requireRoutePermission` | ALERT_RULE:* | yes | OK | — |
| `/api/alerts/evaluate` | POST | `requireRoutePermission` | ALERT:CREATE | yes | OK | — |
| `/api/driver-assignment/manual` | POST | `requireRoutePermission` | ROUTE:ASSIGN | yes | OK | — |
| `/api/driver-assignment/suggestions` | POST | `requireRoutePermission` | ROUTE:ASSIGN | yes | OK | — |
| `/api/driver-assignment/validate` | POST | `requireRoutePermission` | ROUTE:VALIDATE | yes | OK | — |
| `/api/driver-assignment/history/[routeId]` | GET | `requireRoutePermission` | ROUTE:READ | yes | OK | — |
| `/api/driver-assignment/remove/[routeId]/[vehicleId]` | GET | **NONE** | — | — | **CRITICAL** | add ROUTE:READ |
| `/api/driver-assignment/remove/[routeId]/[vehicleId]` | DELETE | `requireRoutePermission` | ROUTE:ASSIGN | yes | OK | — |
| `/api/reassignment/execute` | POST | `requireRoutePermission` | REASSIGNMENT:EXECUTE | yes | OK | — |
| `/api/reassignment/history` | GET | `requireRoutePermission` | REASSIGNMENT:READ | yes | OK | — |
| `/api/reassignment/impact` | POST | `requireRoutePermission` | REASSIGNMENT:READ | yes | OK | — |
| `/api/reassignment/options` | POST | `requireRoutePermission` | REASSIGNMENT:READ | yes | OK | — |
| `/api/reassignment/output/[historyId]` | GET | `requireRoutePermission` | REASSIGNMENT:READ | yes | OK | — |
| `/api/reassignment/output/[historyId]` | POST | **NONE** | — | — | **CRITICAL** | add REASSIGNMENT:UPDATE |
| `/api/route-stops` | GET, POST | `requireRoutePermission` | ROUTE_STOP:{READ,UPDATE} | yes | OK | — |
| `/api/route-stops/[id]` | * | `requireRoutePermission` | ROUTE_STOP:* | yes | OK | — |
| `/api/route-stops/[id]/history` | GET | `requireRoutePermission` | ROUTE_STOP:READ | yes | OK | — |
| `/api/monitoring/drivers` | GET | `requireRoutePermission` | DRIVER:READ | yes | OK | — |
| `/api/monitoring/drivers/[id]` | GET | `requireRoutePermission` | DRIVER:READ | yes | OK | — |
| `/api/monitoring/events` | GET | `requireRoutePermission` | ROUTE:READ | yes | OK | — |
| `/api/monitoring/summary` | GET | `optionalRoutePermission` — **bypassable** | METRICS:READ | yes when auth'd | **CRITICAL** | promote to `requireRoutePermission` |
| `/api/monitoring/geojson` | GET | `optionalRoutePermission` — **bypassable** | ROUTE:READ | yes when auth'd | **CRITICAL** | promote to `requireRoutePermission` |
| `/api/optimization/jobs` | GET, POST | `requireRoutePermission` | OPTIMIZATION_JOB:* | yes | OK | — |
| `/api/optimization/jobs/[id]` | GET, DELETE | `requireRoutePermission` | OPTIMIZATION_JOB:{READ,DELETE} | yes | OK | — |
| `/api/optimization/jobs/[id]/confirm` | POST | `requireRoutePermission` | PLAN:CONFIRM | yes | OK | — |
| `/api/optimization/jobs/[id]/confirm` | GET | **NONE** | — | — | **HIGH** | add PLAN:READ |
| `/api/optimization/jobs/[id]/metrics` | GET | `requireRoutePermission` | METRICS:READ | yes | OK | — |
| `/api/optimization/jobs/[id]/reassign` | POST | `requireRoutePermission` | OPTIMIZATION_JOB:UPDATE | acceptable (could be REASSIGNMENT:EXECUTE) | LOW | — |
| `/api/optimization/jobs/[id]/swap-vehicles` | POST | `requireRoutePermission` | OPTIMIZATION_JOB:UPDATE | yes | OK | — |
| `/api/optimization/jobs/[id]/validate` | POST | `requireRoutePermission` | OPTIMIZATION_JOB:VALIDATE | yes | OK | — |
| `/api/optimization/configure` | * | `requireRoutePermission` | OPTIMIZATION_CONFIG:* | yes | OK | — |
| `/api/optimization/configure/[id]` | * | `requireRoutePermission` | OPTIMIZATION_CONFIG:* | yes | OK | — |
| `/api/optimization/engines` | GET | `requireRoutePermission` | OPTIMIZATION_CONFIG:READ | yes | OK | — |
| `/api/optimization-presets` | * | `requireRoutePermission` | OPTIMIZATION_PRESET:* | yes | OK | — |
| `/api/time-window-presets` | * | `requireRoutePermission` | TIME_WINDOW_PRESET:* | yes | OK | — |
| `/api/csv-column-mapping-templates` | * | `requireRoutePermission` | ORDER:READ / ORDER:IMPORT | acceptable | OK | — |
| `/api/output` | GET | `requireRoutePermission` | OUTPUT:READ | yes | OK | — |
| `/api/output/[outputId]` | GET | `requireRoutePermission` | OUTPUT:READ | yes | OK | — |
| `/api/output/[outputId]` | POST | **NONE** | — | — | **CRITICAL** | add OUTPUT:UPDATE |
| `/api/output/[outputId]` | DELETE | **NONE** | — | — | **CRITICAL** | add OUTPUT:DELETE |
| `/api/metrics/history` | GET | `requireRoutePermission` | METRICS:READ | yes | OK | — |
| `/api/zones` | * | `requireRoutePermission` | ROUTE:* | acceptable (zone maps to ROUTE entity in normalization) | OK | — |
| `/api/zones/[id]` | * | `requireRoutePermission` | ROUTE:* | acceptable | OK | — |
| `/api/zones/[id]/vehicles` | * | `requireRoutePermission` | ROUTE:* | acceptable | OK | — |
| `/api/tracking/generate` | POST | `requireRoutePermission` | ORDER:UPDATE | yes | OK | — |
| `/api/tracking/settings` | GET, PUT | `requireRoutePermission` | COMPANY:{READ,UPDATE} | yes | OK | — |
| `/api/mobile/driver/my-orders` | GET | `requireRoutePermission` + role gate | ORDER:READ | yes | OK | — |
| `/api/mobile/driver/my-route` | GET | `requireRoutePermission` + role gate | ROUTE:READ | yes | OK | — |
| `/api/mobile/driver/location` | POST, GET | `requireRoutePermission` + role gate | ROUTE_STOP:UPDATE | POST yes; GET could be ROUTE_STOP:READ | LOW | tighten GET permission |
| `/api/mobile/driver/field-definitions` | GET | `requireRoutePermission` | ORDER:READ | yes | OK | — |
| `/api/mobile/driver/workflow-states` | GET | `requireRoutePermission` | ROUTE_STOP:READ | yes | OK | — |
| `/api/admin/cache` | GET, DELETE, POST | `withAuthAndAudit` + `isAdmin()` on DELETE only | CACHE:{READ,DELETE_ALL,WARMUP} | yes | MEDIUM | add `isAdmin()` on POST |
| `/api/onboarding/setup` | POST | JWT + explicit role check + company-count guard | custom | yes | OK | — |
| `/api/auth/login` | POST | public | — | yes | OK | — |
| `/api/auth/logout` | POST | session-based | — | yes | OK | — |
| `/api/auth/me` | GET | JWT | — | yes | OK | — |
| `/api/auth/refresh` | POST | refresh token | — | yes | OK | — |
| `/api/auth/sessions` | GET | JWT | — | yes | OK | — |
| `/api/auth/sessions/[id]` | GET, DELETE | JWT + ownership + `authorize` | SESSION:* | yes | OK | — |
| `/api/auth/sessions/invalidate-all` | POST | JWT + `authorize(SESSION, INVALIDATE_ALL)` | SESSION:INVALIDATE_ALL | yes (ADMIN_SISTEMA only) | OK | — |
| `/api/public/tracking/[token]` | GET | public by design | — | yes | OK | — |
| `/api/health` | GET | public | — | acceptable | LOW | — |
| `/api/upload/presigned-url` | GET | JWT only | — | no permission gate | MEDIUM | add OUTPUT/ORDER:UPDATE |

**Authz finding totals:** 5 CRITICAL (handlers with NO permission check), 1 HIGH (GET confirm without perm), 4 MEDIUM, 2 LOW, 99 OK.

---

## Remediation Plan (Prioritized)

### Immediately (pre-deploy blockers)

1. **Patch `extractTenantContext` / `setupAuthContext`** (`src/lib/routing/route-helpers.ts`) to cross-validate header companyId against JWT companyId for non-admin users. Ship with the helper `extractTenantContextAuthed` shown in Finding #1 and retrofit the 5 highest-traffic routes first (`/api/orders`, `/api/vehicles`, `/api/optimization/jobs`, `/api/monitoring/*`, `/api/users`). Grep for `extractTenantContext(request)` to find all 90+ call sites. Closes **all** `header-trust` CRITICAL findings at once.
2. **Delete header-based auth short-circuit in `extractUserContext`** (lines 49–59). Force `setupAuthContext` to go through JWT. Closes the ADMIN_SISTEMA-role-forgery path on `/api/companies/*`, `/api/roles/*`, `/api/users/[id]/roles`, `/api/permissions`.
3. **Add `requireRoutePermission` to the 5 unprotected handlers:**
   - `src/app/api/output/[outputId]/route.ts` — POST and DELETE (`OUTPUT:UPDATE`, `OUTPUT:DELETE`).
   - `src/app/api/driver-assignment/remove/[routeId]/[vehicleId]/route.ts` — GET (`ROUTE:READ`).
   - `src/app/api/reassignment/output/[historyId]/route.ts` — POST (`REASSIGNMENT:UPDATE`).
   - `src/app/api/optimization/jobs/[id]/confirm/route.ts` — GET (`PLAN:READ`).
4. **Promote `optionalRoutePermission` to `requireRoutePermission`** in `/api/monitoring/summary` and `/api/monitoring/geojson`. If anonymous embedded dashboards are genuinely needed, move to a `/api/public/monitoring/[signedToken]/...` pattern mirroring the existing tracking-token design.

### Short-term (within 1 sprint)

5. **Invert auth/tenant ordering** across all routes: `requireRoutePermission` first, `extractTenantContextAuthed` second, `setTenantContext` third. Prevents info leak through 401/400 ordering and ensures the authenticated user drives tenant derivation. Can be done in the same PR as the helper change via codemod.
6. **Add `isAdmin()` re-check to `/api/admin/cache` POST** (warmup) to prevent body-supplied companyId abuse if the permission is ever granted to non-SISTEMA roles.
7. **Introduce a smoke test at app boot** that asserts `getUserPermissionsFromDB(seededPlanificador)` does not include `order:delete`, `user:create`, or other destructive permissions — protects against misconfigured custom roles.
8. **Add a unit test for `extractTenantContextAuthed`** covering: admin with header, admin without header, non-admin matching header, non-admin mismatching header, non-admin no header → each should return the expected 200/400/403.

### Medium-term

9. **Row-level security (RLS) at the database layer** — enable Postgres RLS on every tenant-scoped table keyed by a session variable set from `setTenantContext`. Serves as defense-in-depth: even if application-layer filtering is missed, the DB refuses cross-tenant reads/writes. Drizzle supports this via raw SQL policies.
10. **Audit log enrichment** — once header-only userId is gone, `getAuditLogContext()` values become trustworthy. Add a `log_source = 'jwt' | 'header-legacy'` column temporarily during the migration to detect any remaining header paths.
11. **Per-route rate limits** on `/api/orders/batch/delete`, `/api/optimization/jobs`, `/api/reassignment/execute`, `/api/users/import` — expensive mutations that are currently only rate-limited at `/api/auth/login` and `/api/public/tracking/[token]`.
12. **Add a dedicated `ROLE:ASSIGN` permission** for `/api/users/[id]/roles` instead of the current `USER:UPDATE` proxy. Role assignment is the escalation primitive in any RBAC system and deserves its own gate.

### Hardening / defense-in-depth

13. **CSP, HSTS, X-Frame-Options** headers via `next.config.ts` or middleware — not in scope but worth noting for pre-deploy.
14. **Postgres connection per-request with tenant as session var** — enables RLS cleanly.
15. **Remove `x-user-id` / `x-user-email` / `x-user-role` headers entirely** once JWT becomes the sole source of truth. Strip them at the edge (middleware.ts) so downstream code cannot accidentally re-introduce trust in them.

---

## Summary

The RBAC permission system is well-designed and consistently applied at the route layer — 99 of 111 routes enforce an appropriate `EntityType:Action` check before DB access. The weakness is not authorization but **tenant derivation**: the single helper that determines which tenant's data a request operates on accepts an untrusted client header and never checks it against the authenticated user's JWT. This turns every correctly-gated route into a horizontal-privilege-escalation vector for any authenticated non-admin user.

The fix is localized to two files (`route-helpers.ts` and `api-middleware.ts`) plus a mechanical retrofit of the ~90 call sites. After the helper change, most of the CRITICAL rows above collapse to OK without further per-route work. The remaining discrete fixes are the 5 unprotected handlers and the 2 `optionalRoutePermission` promotions.

**Do not deploy until findings #1, #2, #4, and #5 (all CRITICAL) are resolved.**
