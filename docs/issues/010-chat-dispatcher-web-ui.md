# 010 — Chat dispatcher web UI

Type: AFK

## What to build

The dispatcher's chat surface inside `/monitoring`: an inbox of
conversations and a thread view, realtime over Centrifugo.

- Inbox: list of conversations (driver name, last-message preview,
  relative time, unread badge), ordered by recency. Lives in the
  monitoring side panel alongside Alerts / Recent Events.
- Thread view: message history (cursor-paginated, scroll-back),
  composer, send. Inbound vs outbound styling derived from `direction`.
- Realtime: subscribe to `chat:{companyId}:driver:{driverId}` for the
  open thread; subscribe to a per-tenant signal so inbox unread badges
  update live without opening each thread.
- A per-driver chat channel is not in the connection token (see issue
  007). Add a subscription-token endpoint —
  `GET /api/realtime/subscription-token?channel=...` — that validates
  the dispatcher may chat with that driver (tenant + role) and returns a
  Centrifugo subscription JWT. The client requests it on opening a
  thread.
- Opening a thread calls the `read` endpoint and clears the unread
  badge.
- Wire it to the alert-panel click-through where it makes sense (a STOP
  alert → that driver's conversation), consistent with the
  alert→driver-detail wiring already shipped.
- Spanish UI, project conventions: compound component pattern if it
  grows, `<Can perm="chat:read">`, `useCompanyContext`.

## Acceptance criteria

- [ ] Inbox renders conversations ordered by `lastMessageAt` with
      correct unread badges.
- [ ] A message sent from a second browser appears in the open thread
      within ~1s.
- [ ] An inbound message to a non-open thread bumps the inbox unread
      badge live.
- [ ] Opening a thread marks it read; badge clears; persists across
      reload.
- [ ] Scroll-back pages older messages via the cursor.
- [ ] Composer disabled without `chat:create`; panel hidden without
      `chat:read`.
- [ ] Reconnect after a dropped connection reconciles missed messages
      from Postgres via the cursor.
- [ ] `bun run tsc --noEmit` and `bun run lint` clean.

## Blocked by

- 008-migrate-monitoring-to-centrifugo
- 009-chat-persistence-and-api
