# 002 — Visit history visible: read API + Order detail timeline + "Intento #N" badge

Type: AFK

## What to build

Operators and supervisors can answer "what happened with the delivery
of customer X?" without writing a single SQL query. From the Order
detail page, a chronological **VisitTimeline** shows every physical
attempt: driver, date/time, outcome, failure reason (if it failed),
evidence photos, the address attempted (intended).

Anywhere the UI lists Stops (monitoring view, Order detail), Stops
whose `attempt_number > 1` show a small "Intento #N" badge so the
operator immediately spots revisitas without drilling into history.

This slice surfaces the data persisted by issue #001. No write paths
involved.

## Acceptance criteria

- [ ] Endpoint `GET /api/orders/[id]/visits` returns a JSON array of
      Visits ordered by `attempted_at` ascending. Includes all
      auditable fields including intended address and both coordinate
      pairs (intended + GPS).
- [ ] The endpoint enforces tenant isolation (`x-company-id` /
      `extractTenantContextAuthed`) and is gated by permission
      `order:read`.
- [ ] Order detail page (`/orders/[id]`) renders a `VisitTimeline`
      component below the main fields. Each entry shows: timestamp,
      driver name, outcome (icon + label), failure reason (if any),
      thumbnail of evidence photos (clickable to open lightbox), and
      "Intento #N".
- [ ] `attempt_number > 1` shows an "Intento #N" badge in:
      - The monitoring view's stop list.
      - The Order detail page header.
- [ ] Empty state (Order with no Visits yet) renders cleanly: "Sin
      intentos registrados".
- [ ] Integration test: GET endpoint returns the correct shape and
      ordering for Orders with 0, 1, and 3 Visits.
- [ ] UI test (or smoke test): timeline renders with the expected
      badges for an Order with two Visits.

## Blocked by

- 001-visit-foundation
