# 0011. FailureReason is a per-company free-text list, not an enum [Accepted]

Date: 2026-07-01
Status: Accepted

## Context

The original design categorized delivery failures with a fixed enum
(`CUSTOMER_ABSENT | CUSTOMER_REFUSED | ADDRESS_NOT_FOUND |
PACKAGE_DAMAGED | RESCHEDULE_REQUESTED | UNSAFE_AREA | OTHER`), and
`docs/CONTEXT.md` documented it as such. In practice the reasons a
dispatcher wants drivers to choose from are operator vocabulary — they
vary per company, in Spanish, and change as operations learn. Every
company was going to configure labels anyway, and **no system logic
branches on a specific reason value**: reasons are recorded, shown and
reported, never interpreted.

This is a deliberate inversion of the project's usual "crystallize over
configure" preference — justified because the value is presentation-
and-audit data, not behavior.

## Decision

- The canonical taxonomy is **`companyDeliveryPolicy.failureReasons`**:
  an ordered list of free-text Spanish strings per company.
- The mobile app fetches it via `GET /api/mobile/driver/delivery-policy`
  and shows it as the picker when a driver marks `FAILED`. The chosen
  string travels and is stored **verbatim** in
  `route_stops.failureReason` and `delivery_visits.failure_reason`.
  The mobile app must never introduce an enum or code for it
  (divergencia deliberada #1 in `aea/docs/DOMAIN-MOBILE.md`).
- The server requires a reason on `FAILED` **while the company's list is
  non-empty** (companies without a policy row get
  `DEFAULT_FAILURE_REASONS`, so in practice: always).
- The server treats the value as an **opaque string**: membership in the
  list is deliberately NOT validated, so a device holding a stale cached
  policy can still close a failure instead of getting a permanent 400
  (which the offline outbox would drop — losing the failure).
- The old enum is **legacy**: remaining references in code or docs are
  cleanup targets, not patterns to follow.

## Consequences

- Reporting groups by raw string. Acceptable pre-deploy; if analytics
  ever need stable categories, add a per-company mapping table on the
  web side — do **not** reintroduce an enum on the wire.
- The wire-level validation details (trim semantics, the empty-string
  edge, offline interplay) are specified in
  `docs/API-CONTRACT-MOBILE.md` — including the required fix: reject
  blank-after-trim reasons, since `"  "` currently passes.
- `docs/CONTEXT.md` (Ubiquitous Language → FailureReason) was updated to
  match this ADR.
