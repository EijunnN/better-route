# 001 — Visit foundation: persist a delivery attempt on every driver transition

Type: AFK

## What to build

Every time a driver marks a Stop as `COMPLETED` or `FAILED` from the
mobile app, the system persists an **immutable record of that physical
attempt** as a row in a new `delivery_visits` table. The row stores: the
driver, the plan, the timestamp, the outcome (SUCCESS or FAILURE), the
failure reason if it failed, the evidence URLs (photos uploaded to R2),
the driver's real GPS position when they confirmed the outcome, and the
intended address (the address the RouteStop had at the moment of the
attempt).

`route_stops` gains an `attempt_number` column. When a new RouteStop is
created for a given Order, `attempt_number = COUNT(delivery_visits WHERE
order_id = X) + 1`. The first attempt is 1; revisitas are 2+.

There is no new UI in this slice — the data accumulates silently,
ready to be consumed by issue #002 onward. This is the foundation that
the entire Visit / Revisita feature set rests on (see ADR-0005).

## Acceptance criteria

- [ ] DB migration adds the `delivery_visits` table with the columns
      defined in ADR-0005 (id, company_id, order_id, route_stop_id NOT
      NULL, driver_id, plan_id, attempted_at, completed_at, outcome,
      failure_reason, notes, evidence_urls jsonb, intended_address,
      intended_latitude, intended_longitude, gps_latitude,
      gps_longitude, created_at).
- [ ] DB migration adds `route_stops.attempt_number` (int, NOT NULL,
      default 1).
- [ ] When a driver marks a Stop as COMPLETED via the mobile API, a
      `delivery_visits` row is inserted with `outcome = 'SUCCESS'`,
      evidence and notes copied from the Stop, and the GPS reported by
      the driver.
- [ ] When a driver marks a Stop as FAILED, a row is inserted with
      `outcome = 'FAILURE'`, the failure reason, evidence, notes, and
      GPS.
- [ ] `attempt_number` is populated correctly when new RouteStops are
      created in the optimization runner (Order with no prior visits ⇒
      1; Order with N prior visits ⇒ N+1).
- [ ] Application code never UPDATEs or DELETEs from
      `delivery_visits`. The only allowed write is INSERT.
- [ ] Each Visit insert generates an audit log entry.
- [ ] Multi-tenancy preserved: `delivery_visits.company_id` matches the
      Stop's tenant; queries filter by it.
- [ ] Integration test: completing a Stop creates a SUCCESS Visit;
      failing a Stop creates a FAILURE Visit with all attempt metadata.
- [ ] Integration test: an Order whose previous RouteStop failed gets a
      new RouteStop (in a later plan) with `attempt_number = 2`.
- [ ] All existing integration tests (786) keep passing.

## Blocked by

None — can start immediately.
