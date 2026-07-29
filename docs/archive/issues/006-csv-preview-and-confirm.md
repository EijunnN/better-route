# 006 — CSV import: preview-and-confirm with trackingId collision categorization

Type: AFK

## What to build

CSV import becomes a two-phase flow so the operator can see what's
about to happen before any DB write.

**Phase 1 — Preview.** The operator uploads the CSV. The server
processes it without writing and returns a categorized breakdown:

- **Nuevas**: trackingId not present in the system. Will be inserted.
- **Reactivables**: trackingId matches an existing Order in `FAILED`.
  Will be reactivated (status → PENDING) on confirm. The CSV row's
  fields override the existing Order's fields.
- **Saltadas (activas)**: trackingId matches an Order in
  `PENDING|ASSIGNED|IN_PROGRESS|COMPLETED`. Skipped — already active.
- **Saltadas (canceladas)**: trackingId matches an Order in
  `CANCELLED`. Skipped — terminal definitively (per ADR-0005). The UI
  suggests the operator edit the CSV row to use a new trackingId.

**Phase 2 — Confirm.** The operator reviews the preview and confirms
(optionally deselecting specific reactivables they don't want to
apply). Recién entonces se ejecutan las inserciones y reactivaciones.

## Acceptance criteria

- [ ] Backend refactor of csv-import to support a dry-run mode that
      computes the breakdown without writes.
- [ ] Endpoint `POST /api/orders/csv-import?preview=true` accepts the
      CSV upload and returns:
      ```
      {
        previewId: string,
        new: Array<{ row, parsed }>,
        reactivable: Array<{ row, existingOrderId, parsed }>,
        skippedActive: Array<{ row, existingOrderId, currentStatus }>,
        skippedCancelled: Array<{ row, existingOrderId }>
      }
      ```
- [ ] Endpoint `POST /api/orders/csv-import/confirm` with body
      `{ previewId, reactivableSelections: orderIds[] }` executes the
      batch.
- [ ] The preview's `previewId` is stored server-side with a TTL (e.g.
      30 min) so the confirm step can reference the parsed rows
      without re-uploading.
- [ ] On confirm, the system applies inserts (Nuevas) and
      reactivations (Reactivables that the operator selected). Skipped
      buckets are not touched.
- [ ] **Race condition handling**: if an Order's status changed
      between preview and confirm (e.g., a Reactivable was cancelled
      by another operator), the confirm step recomputes and silently
      skips with a warning in the response (no partial corruption).
- [ ] Each reactivation generates an audit log entry.
- [ ] UI: post-upload preview screen with counters, tabs/filters per
      category, sample rows visible. Operator can deselect specific
      Reactivables. Confirm button disabled until at least one bucket
      has rows that will be applied.
- [ ] All categories show clear copy explaining the reason
      (especially "skippedCancelled" should explain CANCELLED is
      terminal and the operator must use a new trackingId).
- [ ] Integration test: mixed-input scenario (10 new + 5 reactivable
      FAILED + 2 active + 1 cancelled) produces a correct preview and
      a confirm that yields exactly 15 status transitions.
- [ ] Integration test: race condition (Order moved to CANCELLED
      between preview and confirm) is caught and reported as a
      warning, not as data corruption.
- [ ] Integration test: tenant isolation — preview and confirm only
      see Orders from the same company.

## Blocked by

- 004-cross-day-reactivate (the reactivation logic introduced there is
  reused here, just in batch form)
