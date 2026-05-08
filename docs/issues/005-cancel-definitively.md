# 005 — Cancel definitively: terminal state with mandatory categorized reason

Type: AFK

## What to build

Operators with role `PLANIFICADOR` or `ADMIN_FLOTA` can cancel an Order
**definitively** from its detail page. CANCELLED is terminal — the Order
cannot be reactivated through any flow (CSV import, manual button,
nothing). If the customer reorders, that's a brand-new Order with a new
trackingId.

The button "Cancelar definitivamente" is destructive (red) and only
renders for authorized roles via `<Can perm="...">` / `useCan`. Drivers
and monitors don't see it at all.

Click opens a modal with:
- **Categoría** (required select):
  `customer_request | unable_to_deliver | product_not_available | address_invalid | other`
- **Nota** (required textarea, non-empty)
- "Confirmar cancelación" (destructive button)

On confirm: `Order.status` → `CANCELLED`, the categoría and nota are
persisted, audit log entry is written.

## Acceptance criteria

- [ ] DB migration adds `orders.cancellation_reason_category` (varchar
      / enum) and `orders.cancellation_reason_note` (text) — both
      nullable, only set when status transitions to CANCELLED.
- [ ] Endpoint `POST /api/orders/[id]/cancel` with body:
      ```
      {
        reasonCategory: 'customer_request' | 'unable_to_deliver'
                       | 'product_not_available' | 'address_invalid'
                       | 'other',
        reasonNote: string (non-empty)
      }
      ```
- [ ] The endpoint enforces RBAC: only PLANIFICADOR or ADMIN_FLOTA
      pass. Other roles get 403.
- [ ] The endpoint validates the Order is in a non-terminal state
      (cannot cancel an already-CANCELLED or COMPLETED Order — return
      409 with a clear message).
- [ ] Order persists `cancellationReasonCategory`,
      `cancellationReasonNote`, and `status = 'CANCELLED'`.
- [ ] Audit log entry records the transition with both reason fields.
- [ ] Order detail page renders the destructive "Cancelar
      definitivamente" button only for authorized roles.
- [ ] The modal validates `reasonNote` is non-empty before enabling the
      confirm button.
- [ ] Integration test: PLANIFICADOR can cancel; CONDUCTOR cannot
      (RBAC enforcement, exact 403 status).
- [ ] Integration test: cancel persists the reason fields and audit
      entry; second cancel attempt on the same Order returns 409.
- [ ] Integration test: a CANCELLED Order does not appear as
      reactivable in the CSV preview (issue #006) — it appears in the
      "skipped" bucket with the CANCELLED-specific reason.

## Blocked by

- 004-cross-day-reactivate (Order detail page already wired with
  contextual actions per status; this slice adds another action to the
  same shape)
