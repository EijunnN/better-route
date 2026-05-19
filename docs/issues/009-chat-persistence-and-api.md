# 009 — Chat persistence + API

Type: AFK

## What to build

The backend foundation of dispatcher↔driver chat: schema, endpoints,
RBAC. No UI in this slice — verifiable via API.

- New schema `src/db/schema/chat.ts`: `chat_conversations` (one row per
  driver — `lastMessageAt`, `lastMessagePreview`, `unreadForDispatch`)
  and `chat_messages` (`direction`, `kind`, `body`, `templateCode`,
  `readAt`). Drizzle migration generated. Indexes per ADR-0007.
- New `EntityType.CHAT` in `permissions/types.ts`. Permissions
  `chat:read`, `chat:create`. Broadcast fenced separately
  (high-privilege roles only — the `cancel` endpoint pattern).
- `GET /api/chat/conversations` — dispatcher inbox: the tenant's
  conversations ordered by `lastMessageAt`, with preview + unread count.
- `GET /api/chat/conversations/{driverId}/messages?after={cursor}&limit=50`
  — thread history; without `after`, the last 50; with `after`,
  everything newer (the reconnect cursor).
- `POST /api/chat/conversations/{driverId}/messages` — send a message.
  In one transaction: INSERT `chat_messages`, UPSERT
  `chat_conversations`. Post-commit:
  `centrifugoPublish("chat:{companyId}:driver:{driverId}", msg)`.
  (OneSignal push is added in issue 011.)
- `POST /api/chat/conversations/{driverId}/read` — mark inbound messages
  read, reset `unreadForDispatch`.
- `POST /api/chat/broadcast` — fan-out: one `chat_messages` row per
  active driver (`kind = BROADCAST`), publish to
  `chat:{companyId}:broadcast`. Fenced to high-privilege roles.
- Driver-side uses the same routes; a CONDUCTOR may only read/post in
  their own `driverId` conversation (tenant + self check).
- `CHAT_QUICK_REPLIES` constant — the hardcoded MVP template set.

## Acceptance criteria

- [ ] Migration creates both tables with the ADR-0007 indexes
      (`chat_conv_company_driver_uq`, `chat_conv_inbox_idx`,
      `chat_msg_thread_idx`).
- [ ] Sending a message: row inserted, conversation upserted,
      `lastMessageAt` / preview updated, `unreadForDispatch` incremented
      when `direction = TO_DISPATCH`.
- [ ] Centrifugo receives the published message on the right channel.
- [ ] Cursor pagination: `?after={createdAt}` returns only newer
      messages.
- [ ] Tenant isolation: a dispatcher cannot read/post in another
      company's conversation (403).
- [ ] A CONDUCTOR posting to a `driverId` other than their own → 403.
- [ ] Broadcast: N rows created (one per active driver), all published;
      a non-privileged role → 403.
- [ ] RBAC coherence test updated for the new `chat:*` permissions and
      any new routes.
- [ ] Integration tests: send, paginate, read, broadcast, tenant
      isolation, self-only.
- [ ] `bun run tsc --noEmit` and `bun run lint` clean.

## Blocked by

- 007-centrifugo-infrastructure
