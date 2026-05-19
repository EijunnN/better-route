# 012 — Mobile chat client (Flutter)

Type: AFK

## What to build

The driver's side of chat in the Flutter app (`test-mobile/aea`):
Centrifuge connection, chat UI, quick replies, OneSignal, the
ephemeral-socket lifecycle.

- `centrifuge-dart`: connect using a token from `/api/realtime/token`;
  subscribe to `chat:{companyId}:driver:{ownId}` and
  `chat:{companyId}:broadcast`.
- Ephemeral lifecycle: connect on entering the chat screen, disconnect a
  short time after leaving it or backgrounding the app. The socket is
  not held open all shift.
- Chat screen: thread history (fetched from `GET .../messages`),
  composer, inbound/outbound styling. On open and on reconnect,
  reconcile from Postgres via the cursor.
- Quick replies: the `CHAT_QUICK_REPLIES` set as tappable chips that
  post a `TEMPLATE` message — thumb-free for a driver.
- OneSignal Flutter SDK: `OneSignal.login(userId)` on auth,
  `logout()` on sign-out. The foreground handler suppresses the banner
  when the chat screen is already open. Tapping a push deep-links into
  the conversation.
- `tracking_service.dart` is not touched — location stays on HTTP POST.

## Acceptance criteria

- [ ] Driver opens chat → socket connects → history loads → live
      messages arrive.
- [ ] Driver leaves chat → socket disconnects within the chosen idle
      window.
- [ ] App closed → dispatcher message → OneSignal push arrives → tap
      deep-links to the conversation.
- [ ] Chat foregrounded → push banner suppressed; the message is still
      shown live.
- [ ] A quick-reply chip posts a `TEMPLATE` message visible to the
      dispatcher.
- [ ] Reconnect after signal loss reconciles missed messages via the
      cursor.
- [ ] `OneSignal.login` maps the device to the driver's userId; verified
      by an addressed push landing.
- [ ] A broadcast message arrives on-thread.
- [ ] `tracking_service.dart` is unchanged.

## Blocked by

- 010-chat-dispatcher-web-ui
- 011-onesignal-push-integration
