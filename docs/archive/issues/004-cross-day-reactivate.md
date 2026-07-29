# 004 — Cross-day reactivate Order from detail page

Type: AFK

## What to build

The operator can manually reactivate a `FAILED` Order from its detail
page so it joins the next planning batch. A button **"Programar próxima
entrega"** (visible only when `Order.status === 'FAILED'`) opens the
same dialog from issue #003, this time in `cross-day` mode with the
"Próximo plan disponible" option pre-selected.

The operator may edit address, time window, promised date, notes, and
provides a reason. On confirm:
- The Order transitions `FAILED → PENDING`.
- Any field the operator edited overwrites the Order's column; un-edited
  fields stay the same.
- The reason is stored in audit log and (optionally) in
  `Order.notes`.
- No RouteStop is created here — the next planning run produces it
  with `attempt_number = current_visits_count + 1` (logic from issue
  #001).

## Acceptance criteria

- [ ] Endpoint `POST /api/orders/[id]/reactivate` with body:
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
- [ ] The endpoint validates the Order is currently in `FAILED`;
      otherwise responds 409. Tenant + RBAC enforcement.
- [ ] On success: Order overrides applied; status set to `PENDING`.
- [ ] Audit log entry records transition, operator, reason, and
      changed fields.
- [ ] Order detail page renders the "Programar próxima entrega" button
      only when status is FAILED.
- [ ] The dialog from issue #003 (`ProgramarProximaEntregaDialog`,
      `mode: "cross-day"`) is reused — no new dialog UI introduced.
- [ ] Integration test: reactivate a FAILED Order, run optimization,
      confirm the resulting RouteStop has `attempt_number = 2` (one
      prior Visit on this Order).
- [ ] Integration test: reactivating with overrides applies them
      correctly to the Order row.

## Blocked by

- 003-same-day-reopen-dialog (reuses the dialog component)
