# 0008. Multi-tenant code, single-tenant-per-VPS deployment, and tenant derivation [Accepted]

Date: 2026-07-01
Status: Accepted

## Context

Two long-standing ambiguities kept confusing both humans and agents:

1. **"Is BetterRoute multi-tenant or single-tenant?"** The schema is
   multi-tenant (every principal table carries `companyId`, RBAC and
   custom roles are per-company, `docs/CONTEXT.md` opened with
   "SaaS multi-tenant"), yet `README.md` sells "Single-tenant por
   instalación: una empresa, su propio despliegue, su propia base de
   datos". Both are true — at different levels — but no document said
   which level each claim applied to, so derived docs drifted in both
   directions.

2. **"Where does the tenant come from?"** A security audit (2026-04-17)
   found routes trusting the client-supplied `x-company-id` header. The
   fix — validating the header against the JWT — was implemented and
   described in `CLAUDE.md` prose, but the decision itself was never
   recorded; the deleted unauthed helper keeps trying to come back in
   agent-generated code.

Related operational fact: the cache moved from Upstash REST to a local
`ioredis` against the docker-compose Redis, which only makes sense under
a specific deployment model.

## Decision

**1. The code is and stays fully multi-tenant.** Every query against a
principal table filters by `companyId`; RBAC, custom roles, policies,
presets and field definitions are per-company. No code path may assume
"there is only one company in this database".

**2. The deployment model is single-tenant-per-VPS.** Each client
company gets its own installation: one VPS running the app plus its
whole stack (Postgres, Redis, Centrifugo, VROOM, OSRM) via Docker
Compose. There is no shared public SaaS instance. Consequences of this
model — colocated Redis (ioredis, replacing Upstash), the single-VPS
SPOF tradeoff acknowledged in ADR-0007 — are deliberate.

**3. Tenant derivation contract** (crystallized from the 2026-04-17
audit):

- The client sends `x-company-id` as a **hint**, never as an authority.
- Every authenticated route derives the tenant with
  `extractTenantContextAuthed(request, user)`
  (`src/lib/routing/route-helpers.ts`) **after** the RBAC check.
- Non-admin: the JWT `companyId` is authoritative; a mismatching header
  is `403 TENANT_MISMATCH`.
- `ADMIN_SISTEMA` is the only cross-tenant role and must pass the header
  explicitly to select a workspace (`400 COMPANY_REQUIRED` otherwise).
- Routes with `companyId` in the path (e.g.
  `/api/companies/[id]/...`) must additionally compare the path
  `companyId` against the user (403 on mismatch; only `ADMIN_SISTEMA`
  bypasses) — reference pattern: `canAccessCompany` in
  `src/app/api/companies/[id]/route.ts`.
- The pre-audit unauthed helper (`extractTenantContext`) is deleted and
  must not be reintroduced.

## Consequences

- **Why keep multi-tenant code under single-tenant deploys?** Defense in
  depth (a tenancy bug cannot leak data even if a second company is ever
  added to an install), uniform RBAC machinery, multi-company test
  fixtures, and a future consolidation path that costs nothing today.
  The overhead is one `WHERE companyId = $tenant` per query.
- Docs must qualify the level: "multi-tenant" describes the **code**,
  "single-tenant" describes the **deployment**. `CONTEXT.md` states both
  under "Producto en una frase".
- Known sharp edge to check in review (see `docs/REVIEW-RUBRIC.md` §1):
  `withTenantFilter` (`src/db/tenant-aware.ts`) silently returns
  conditions **without** a tenant filter for tables lacking a
  `companyId` column, and `AsyncLocalStorage`-based context is marked
  unreliable in the App Router — pass the tenant explicitly.
- Three endpoints intentionally skip parts of this contract
  (self-only `GET /api/mobile/driver/location`, `GET /api/realtime/token`,
  `GET /api/upload/presigned-url`); they are enumerated in
  `docs/API-CONTRACT-MOBILE.md` and are the allowlist for any
  tenancy-enforcement tooling.

## Out of scope

- Multi-instance / horizontal scale (revisit via ADR-0007's Redis-engine
  path if it ever matters).
- Cross-install federation or a shared control plane.
