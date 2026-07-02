# 0010. Typed RBAC contract shared by server and client [Accepted]

Date: 2026-07-02
Status: Accepted

## Context

Server and client both answer "can this user do X?" — the server to
protect API routes, the client to decide which buttons and pages to
render. With permissions expressed as ad-hoc strings at call sites, the
two sides drift: a typo (`"order:edit"` vs `"order:update"`) silently
denies or — worse — a check exists only on the client and the server
accepts the mutation anyway. The 2026-04-18 security refactor replaced
that with a single typed contract. This ADR records the decision
(documented until now in `CLAUDE.md` and
`src/lib/auth/permissions/README.md`).

## Decision

- **`src/lib/auth/permissions/` is the single source of truth.** The
  module is browser-safe and exports `EntityType`, `Action`, and
  `Permission` — a template literal type
  (`` `${EntityType}:${Action}` ``) plus the `"*"` wildcard (granted
  only to `ADMIN_SISTEMA`) — that TypeScript validates at compile time.
  Invalid permission strings are build errors, not runtime surprises.
- **Server enforces, always.** Every mutating API route calls
  `requireRoutePermission(request, EntityType.X, Action.Y)` before its
  handler. Client-side checks are UX, never security.
- **Client renders by permission.** `<Can perm="x:y">` wraps mutating
  controls, `useCan("x:y")` derives booleans, and `<ProtectedPage>` is
  **fail-closed**: without `requiredPermission` /`requiredPermissions` /
  `authenticatedOnly` it denies access — except to wildcard holders,
  who pass any gate.
- **Role → permission mapping stays server-only.** The 5 legacy roles
  (`ADMIN_SISTEMA`, `ADMIN_FLOTA`, `PLANIFICADOR`, `MONITOR`,
  `CONDUCTOR`) are hardcoded in `authorization.ts → ROLE_PERMISSIONS`;
  per-company custom roles live in the DB (created via `/roles`).
  `getUserPermissionsFromDB()` merges both.
- Naming is part of the contract: entity singular (`order`, not
  `orders`), action lowercase with underscores (`change_status`),
  joined by `:` with no spaces.

## Consequences

- Typos in permission strings are impossible to ship; adding an entity
  to `EntityType` expands `Permission` automatically and the IDE
  autocompletes valid values.
- Adding a feature has a fixed checklist (entity → server guard →
  `<Can>` → `<ProtectedPage>` → sidebar item), which reviews can verify
  mechanically — see `permissions/README.md` for the full pattern and
  anti-patterns.
- Fail-closed `<ProtectedPage>` means forgetting a prop breaks the page
  visibly instead of exposing it silently — but only for non-wildcard
  roles, so verify gating as a non-admin, never as `ADMIN_SISTEMA`.
- The `CONDUCTOR` role is constrained externally: it must keep the
  capability set of `docs/API-CONTRACT-MOBILE.md` §8 — the mobile app
  assumes it.
- Custom roles put permission grants in the DB, so the permissions
  catalog must be seeded (ADR-0009) before role management works on a
  fresh install.
