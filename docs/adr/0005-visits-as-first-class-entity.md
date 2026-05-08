# 0005. Visit as a first-class entity for delivery attempt history [Accepted]

Date: 2026-05-07
Status: Accepted

## Context

A real-world delivery often takes more than one physical attempt. Today
the model collapses each Order into a single `route_stop` whose fields
(`evidenceUrls`, `failureReason`, `notes`, `completedAt`, `userId`) hold
the data of the last attempt. There is no entity that represents an
attempt itself.

This breaks two operational scenarios the team needs to support:

1. **Same-day retry.** A driver fails to deliver (customer absent), the
   customer calls in, the driver returns. If we revert the Stop's status
   from `FAILED` back to `PENDING`, the next attempt's data overwrites
   the first one. The first attempt — its photo, its failure reason, its
   timestamp — is lost.
2. **Cross-day revisita.** Tomorrow's CSV import (or a manual
   reactivation) puts a previously-failed Order back into a new Plan.
   That Plan generates a new `route_stop`. The trail across attempts
   needs to be reconstructable end-to-end.

Audit was the load-bearing concern: in last-mile delivery, "did we
attempt this Order, and what happened?" must be answerable for any Order
at any time. `route_stop_history` records status transitions but not
attempt evidence (no `evidenceUrls`, no `failureReason`, no GPS).

We considered three models:

- **Reuse `route_stops` as the implicit history**, querying by
  `order_id` ordered by `created_at`. Works for cross-day (each Plan
  generates a new RouteStop) but fails for same-day retry, where the
  same `route_stop` is reused and the previous attempt's data is
  overwritten.
- **Add a parallel `route_stop_attempts` table** scoped only to
  same-day retries. Mixed concerns — half the attempt history would
  live in `route_stops`, half in the new table.
- **Promote `Visit` to a first-class entity** spanning every physical
  attempt regardless of same-day or cross-day. Single source of truth
  for delivery history.

## Decision

Introduce `delivery_visits` as a first-class, immutable entity:

```
delivery_visits (
  id, company_id, order_id, route_stop_id (FK),
  driver_id, plan_id (job_id),
  attempted_at, completed_at,
  outcome ENUM('SUCCESS', 'FAILURE'),
  failure_reason, notes,
  evidence_urls (jsonb),
  gps_latitude, gps_longitude
)
```

Rules:
- Every time a driver marks a Stop as COMPLETED or FAILED, a Visit row
  is inserted. The row is **immutable** — no UPDATE or DELETE.
- `route_stops.evidenceUrls` / `failureReason` / `notes` describe the
  **last attempt in progress**. When the operator reverts a Stop from
  FAILED to PENDING (same-day retry), those fields are cleared on the
  RouteStop; the Visit row stays untouched.
- A new column `route_stops.attempt_number` (int, default 1) is set at
  creation time as `COUNT(visits WHERE order_id = ...) + 1`. Lets the UI
  show "Intento #N" without a JOIN.
- A "Revisita" is, by definition, any Visit beyond the first for that
  Order. Same-day or cross-day — the model treats them uniformly.
- Trazability of an Order = ordered list of its Visits.

## Consequences

- **Audit-grade traceability.** The full history of physical attempts
  for any Order is recoverable from `delivery_visits` alone. Photos,
  GPS, reasons, drivers, timestamps — all preserved across same-day
  retries and cross-day revisitas.
- **Operator UX gains.** The detail page of a failed Order can render
  a timeline of attempts ("Intento #1: 14:23, Pérez (driver), Cliente
  ausente, [foto]; Intento #2: 18:05, Pérez, ..."), which is what TMS
  competitors (OnFleet, Bringg, Amazon DSP) ship.
- **Mobile API simpler.** Drivers post once per attempt — a single
  endpoint, no special-casing of "first attempt vs retry".
- **Schema cost.** A new table + a column on `route_stops`. One
  migration. The `delivery_visits` rows scale with attempts, not Orders
  — most Orders will have one Visit, some two, very few three+.
- **Same-day retry needs explicit cleanup.** When reverting a Stop
  from FAILED to PENDING, the runtime must clear evidence/reason/notes
  on the RouteStop or the next attempt's data ends up co-mingled with
  the previous one. This is enforced in code, not by the schema (the
  Stop fields stay nullable).
- **Hard to reverse.** Once we ship and Visits start accumulating,
  walking it back means data migration with judgement calls about how
  to collapse multi-Visit Orders. Worth committing now.

## Out of scope (for follow-up ADRs)

- Whether a Visit can exist without a RouteStop ("ad-hoc Visit"). Today
  every Visit is tied to a Plan via `route_stop_id` + `plan_id`. If we
  later allow drivers to record an attempt without a Plan (off-route
  delivery), this ADR is superseded.
- The CSV deduplication policy when an imported Order matches an
  existing one. To be decided in a separate ADR.
- Notification fan-out (customer tracking link, original/replacement
  driver) on revisita events.
