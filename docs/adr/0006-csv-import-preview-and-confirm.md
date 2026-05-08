# 0006. CSV import uses preview-and-confirm for trackingId collisions [Accepted]

Date: 2026-05-07
Status: Accepted

## Context

CSV import is how planners feed Orders into the system. The unique index
`orders_tracking_id_active_unique` enforces that an Order's trackingId
is unique per company while it's active.

In real operations, the source system (the customer's ERP / OMS / WMS)
often exports a daily CSV that includes Orders that already exist in
BetterRoute — typically Orders that failed to deliver yesterday and need
to go out today. Without explicit handling, the import fails with a DB
unique-constraint error and the operator has to manually clean the CSV.

Three competing models came up:

- **B. Auto-reactivate.** When the CSV trackingId matches an existing
  Order in a terminal state (`FAILED`/`CANCELLED`), silently flip it
  back to `PENDING`. Skip active matches with a warning.
- **C. Preview-and-confirm.** Importing produces a preview report (X
  new, Y reactivable, Z skipped) and the operator confirms before the
  batch is applied.
- **D. Configurable per company.** Each Company has a setting choosing
  between auto-reactivate and preview-and-confirm.

## Decision

CSV import is **always preview-and-confirm**. There is no silent
auto-reactivation.

Behaviour:
- A trackingId match against an Order in `FAILED` appears in the
  preview as **reactivable**. If the operator confirms, the existing
  Order's status flips to `PENDING`, ready for the next Plan. Its
  `delivery_visits` history is preserved (see ADR-0005); the Order's
  identity does not change.
- A trackingId match against an Order in `CANCELLED` appears in the
  preview as **skipped (cancelled)**. CANCELLED is terminal definitive
  per the Order Management bounded-context rules — it is **never**
  reactivated, by any path. If the customer reorders, that's a brand-new
  Order with a new trackingId. The preview surfaces this with a clear
  message so the operator knows to edit the CSV row.
- A trackingId match against an active-state Order
  (`PENDING|ASSIGNED|IN_PROGRESS|COMPLETED`) appears in the preview as
  **skipped (active)** with a warning explaining why. The active Order
  is left untouched.
- A trackingId not present in the system is a **new** Order, ready to
  insert.
- The operator sees the breakdown before any DB write. Until the
  operator confirms, the import is a dry-run.

## Consequences

- **No silent reactivations.** The operator knows exactly which Orders
  are coming back to life. A Visit history reappearing on a re-imported
  Order is intentional and traceable, not a surprise.
- **Better failure mode for source-system mismatches.** Today the
  import errors with a Postgres unique-constraint message. With
  preview-and-confirm, the operator sees a structured report and can
  decide.
- **One UX path, not two.** Configurable-per-company (D) was rejected
  to avoid the support burden of "the import behaves differently for
  Acme than for Beta Corp." If a customer demands fully-automated
  imports later (CSV nightly with no human in the loop), the right move
  is a separate dedicated endpoint
  (`POST /api/orders/csv-import?autoReactivate=true`) — not a global
  per-company toggle.
- **Cost.** Preview screen needs UI work — list with filters by
  category (new/reactivable/skipped), summary counters, confirm
  button. The dry-run on the server side has to compute the breakdown
  without writing.

## Out of scope

- The exact UX of the preview screen (table layout, filters, error
  surfacing) is a product/UX decision, not architecture.
- Bulk-edit during preview ("yes, reactivate but with this updated
  address") is a follow-up. For v1, the operator either confirms
  reactivation as-is or skips and edits the CSV externally.
