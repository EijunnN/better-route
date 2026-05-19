# Issues backlog

Vertical-slice issues generated from the grilling on driver re-delivery /
Visits / Revisitas. Source decisions:

- `docs/CONTEXT.md` — Order Management + Route Execution rules
- `docs/adr/0005-visits-as-first-class-entity.md`
- `docs/adr/0006-csv-import-preview-and-confirm.md`

## Order

Each issue is a tracer-bullet vertical slice (DB → backend → API → UI →
tests). They're meant to be implemented in dependency order.

```
001-visit-foundation              ← starts everything
  └─ 002-visit-history-ui
  └─ 003-same-day-reopen-dialog
       └─ 004-cross-day-reactivate
            └─ 005-cancel-definitively
            └─ 006-csv-preview-and-confirm
```

All slices are AFK (no architectural decisions left to make — the ADRs
already locked them down).

## Realtime + chat batch

Vertical-slice issues from the grilling on realtime architecture. Source
decision: `docs/adr/0007-realtime-via-centrifugo.md`.

```
007-centrifugo-infrastructure          ← foundation
  └─ 008-migrate-monitoring-to-centrifugo
  └─ 009-chat-persistence-and-api
       └─ 010-chat-dispatcher-web-ui      (also needs 008)
       └─ 011-onesignal-push-integration
            └─ 012-mobile-chat-client     (also needs 010)
```

Phase 1 (007 + 008) delivers "monitoring truly realtime and scalable"
with no chat code — it is shippable on its own. Chat builds on top.
