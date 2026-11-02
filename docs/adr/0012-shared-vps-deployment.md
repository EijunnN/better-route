# 0012. One shared VPS for every company [Accepted]

Date: 2026-11-02
Status: Accepted — supersedes decision §2 of ADR-0008

## Context

ADR-0008 §2 set the deployment model as single-tenant-per-VPS: one
install per client company, each with its own Postgres and Redis. In
August 2026 the beta went out on a different model that no ADR recorded:
Vercel for the app, Railway for Centrifugo and the solver, Neon for
Postgres. That month's work went into fighting serverless rather than
into the product: the solve had to run inline inside the request, a TLS
bridge reached OSRM, Centrifugo was moved out because of billed CPU, and
OSRM had to listen on IPv6. The workload (solves of up to 300 s, a
WebSocket server that is always up, an OSRM dataset of several GB) is a
poor fit for serverless.

The beta also serves several independent companies at once, so one
install per company would mean N VPSes to operate for a free beta.

## Decision

**BetterRoute runs on a single VPS that serves every company**, with the
whole stack in `docker-compose.prod.yml`: Caddy (TLS, the only service
with published ports), the app, Postgres, Redis, Centrifugo, VROOM, OSRM,
a one-shot migration service and a daily `pg_dump`. Procedure:
`docs/deployment-vps.md`.

ADR-0008 §1 (multi-tenant code) and §3 (tenant derivation) stay in force
unchanged. Only §2 changes.

Vercel, Railway and Neon are dropped. Their config, the bridges and the
inline-solve mode were deleted.

## Consequences

- **Tenant isolation stops being defense in depth and becomes the only
  barrier between real customers.** Under ADR-0008 a tenancy bug leaked
  inside a single customer's install. Now it leaks across customers.
  Any diff that touches `src/app/api/**`, Drizzle queries on principal
  tables or `ROLE_PERMISSIONS` goes through `docs/REVIEW-RUBRIC.md` §1
  (and the `tenancy-invariant-auditor` agent) before merge.
- **`ADMIN_SISTEMA` belongs to the operator of the VPS only.** It sees
  every company on the install. The 3PL scenario from ADR-0008 (a
  customer's ADMIN_SISTEMA managing its sub-clients) no longer fits.
  Giving that role to a customer gives them access to everyone's data.
  If a 3PL customer shows up, that needs its own ADR: a per-company
  admin role, or a dedicated install for that customer.
- The app process outlives the HTTP response, so the job is handed off
  to the process and the POST returns immediately (`lifecycle.ts`). Going
  back to serverless would require a real job queue, not the inline mode
  that was removed.
- One single point of failure (already accepted in ADR-0007) for every
  company at once. A VPS reboot takes everyone down, and `pg_dump` is the
  recovery plan. Only the copy to R2 (`R2_BACKUP_*`) survives losing the
  VPS.
- One shared OSRM: by default it covers all of Peru (`OSRM_BBOX` empty) so
  that a company outside Lima still gets routes.
- Free-text per-company config stays in DB rows (unchanged).
  Per-install config remains in code or env.
