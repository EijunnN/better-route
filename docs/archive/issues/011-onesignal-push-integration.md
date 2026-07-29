# 011 — OneSignal push integration (backend)

Type: AFK

## What to build

Wire OneSignal so a chat message reaches a driver whose app is closed or
whose chat socket is disconnected.

- `src/lib/notifications/onesignal.ts` —
  `sendChatPush({ driverId, title, body, data })` POSTs to the OneSignal
  REST API, addressing the device by External ID = `driverId`
  (`include_aliases.external_id`). The `data` payload carries
  `{ type: "chat", driverId, messageId }` for deep-linking.
- New env vars in `.env.example`: `ONESIGNAL_APP_ID`,
  `ONESIGNAL_REST_API_KEY`.
- Hook into the chat send path (issue 009): after the post-commit
  Centrifugo publish, always fire `sendChatPush` — the "always-push"
  decision; the mobile app suppresses the banner when the chat is
  foregrounded.
- Broadcast: a push per targeted driver (or a OneSignal segment if
  cleaner) — every targeted driver gets one.
- Push failures are logged, never block the message write or the API
  response (Centrifugo + Postgres already succeeded).

## Acceptance criteria

- [ ] Sending a chat message triggers a OneSignal push addressed by
      `external_id`.
- [ ] The push `data` payload carries `type`, `driverId`, `messageId`.
- [ ] A OneSignal API failure is logged and does not fail the message
      endpoint.
- [ ] Broadcast fans push out to every targeted driver.
- [ ] Secrets read from env; nothing hardcoded.
- [ ] Unit test: payload shape; failure is swallowed.
- [ ] `bun run tsc --noEmit` and `bun run lint` clean.

## Blocked by

- 009-chat-persistence-and-api
