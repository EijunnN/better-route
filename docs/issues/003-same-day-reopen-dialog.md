# 003 — Same-day reopen: reopen Stop FAILED → PENDING with editable fields

Type: AFK

## What to build

The operator can reopen a `FAILED` Stop **the same day** so the driver
can attempt it again on the route already in progress. The trigger is
a "Reabrir Stop" button visible in the monitoring view and in the Stop
section of the Order detail page (only when the Stop is in FAILED).

The button opens a unified dialog **"Programar próxima entrega"** with
the Stop's current values pre-filled in editable fields: address,
latitude, longitude, time window (start/end), promised date, notes.
The dialog requires a free-text **reason** for the reopen. The
operator may edit any field they need (the customer might have called
to give a new address or window) and confirms.

On confirm:
- The Stop transitions FAILED → PENDING.
- Any field the operator edited overwrites the Stop's value; un-edited
  fields stay the same.
- `evidenceUrls`, `failureReason`, and `notes` on the Stop are
  **cleared** to NULL — the previous attempt's data is already
  preserved in the prior Visit (see issue #001), so the Stop is reset
  for the next attempt without losing any history.
- The driver, on the next mobile poll, sees the Stop active again with
  no leftover evidence. They can attempt the delivery; when they mark
  it COMPLETED or FAILED, a new Visit row is created (issue #001
  handles this automatically).

There is no re-optimization. The driver's route order does not change.

## Acceptance criteria

- [ ] Endpoint `POST /api/route-stops/[id]/reopen` with body:
      ```
      {
        reason: string (required, non-empty),
        addressOverride?: string,
        latitudeOverride?: string,
        longitudeOverride?: string,
        timeWindowStartOverride?: string,  // "HH:MM"
        timeWindowEndOverride?: string,
        promisedDateOverride?: string,     // ISO
        notesOverride?: string
      }
      ```
- [ ] The endpoint validates the Stop is currently in `FAILED` state;
      otherwise responds 409.
- [ ] Tenant isolation enforced; gated by `order:update` (or equivalent
      stop-level permission).
- [ ] On success: Stop is updated with overrides applied (or kept as
      original if not provided); `evidenceUrls`/`failureReason`/`notes`
      set to NULL; status set to PENDING.
- [ ] The prior Visit row in `delivery_visits` is **not modified** by
      this operation (verified by integration test).
- [ ] Audit log entry records the transition, the operator, the
      reason, and which fields were overridden.
- [ ] Reusable component `ProgramarProximaEntregaDialog` is created. It
      accepts a `mode` prop: `"same-day"` or `"cross-day"` (the
      cross-day variant is used in issue #004). Same-day mode targets
      a RouteStop; cross-day mode targets an Order.
- [ ] Button "Reabrir Stop" appears in the monitoring stop list and on
      the Order detail page when the Stop is in FAILED.
- [ ] Mobile polling correctly returns the reopened Stop with
      `evidenceUrls = null`, `failureReason = null`, `notes` reflecting
      the override (or null if not overridden).
- [ ] Integration test: reopen flow end-to-end. Verify the prior Visit
      is unchanged, the Stop has the new fields, mobile sees the
      reopened state.
- [ ] Integration test: reopen with no overrides — Stop returns to
      PENDING with original address/window/notes preserved (only
      status, evidenceUrls, failureReason changed).

## Blocked by

- 001-visit-foundation
