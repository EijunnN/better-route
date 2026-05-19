# 0007. Realtime via Centrifugo, push via OneSignal [Accepted]

Date: 2026-05-10
Status: Accepted

## Context

The monitoring dashboard (`/monitoring`) shows dispatchers the live
position and stop progress of their drivers. Realtime delivery today is
a process-local `EventEmitter` (`src/lib/realtime/event-bus.ts`, the
`InMemoryBus`) fanned out to browsers over a Server-Sent Events endpoint
(`/api/monitoring/stream`). Mobile drivers upload GPS over plain HTTP
POST; the backend persists, publishes a hint onto the bus, and SWR on
the client revalidates.

Three forces made this insufficient:

1. **True realtime.** "Eventually realtime" via the 10s SWR safety poll
   is acceptable for a marker on a map; it is not an acceptable
   foundation for a feature dispatchers depend on operationally.
2. **Driver↔dispatcher chat.** A planned feature. SSE is one-directional
   (server→client) and cannot carry a chat. Bolting a second mechanism
   onto SSE for the return path would mean two transports to reason
   about.
3. **Scale.** 200+ concurrent drivers with multiple dispatchers per
   tenant. The `InMemoryBus` is explicitly single-process — if the app
   is ever run as more than one instance, a mobile POST landing on
   instance A never reaches a dispatcher's SSE stream on instance B.

Deploy reality: a single Hetzner VPS (16 GB, lightly loaded), Docker
Compose already in use (OSRM, VROOM), Postgres on Neon, cache on Upstash
REST (no pub/sub). The team accepts the single-VPS single-point-of-
failure as a conscious pre-deploy tradeoff.

Options weighed: keep SSE + add a Redis Pub/Sub backplane (still
one-way, chat awkward); hand-roll a Bun WebSocket server (full control,
but rebuilds reconnect / history / presence / fallback / SDKs); a
managed service such as Ably or Pusher (recurring cost, vendor);
Centrifugo (open-source self-hosted realtime server).

## Decision

We will replace the `InMemoryBus` + SSE with **Centrifugo** as the
realtime server, and use **OneSignal** for mobile push notifications.

**Transport.**
- Centrifugo v6 runs as a Docker Compose service alongside the app,
  memory engine — no Redis, since this is a single instance and Postgres
  is the source of truth for anything durable.
- The app publishes events to Centrifugo over its HTTP API. Clients
  (dispatcher web, driver mobile) subscribe over WebSocket, with
  Centrifugo's automatic fallback to SSE / HTTP-stream for hostile
  networks.
- nginx/caddy proxies `/connection/*` to Centrifugo on the same origin —
  no subdomain, no CORS, no extra certificate.

**Channels.**
- `monitoring:{companyId}` — driver location, stop transitions, alerts.
- `chat:{companyId}:driver:{driverId}` — the 1:1 dispatcher↔driver
  thread.
- `chat:{companyId}:broadcast` — dispatcher emergency broadcast to all
  the tenant's drivers.

**Auth.** A dedicated endpoint (`GET /api/realtime/token`) reads the
session cookie and issues a short-lived (15 min) Centrifugo JWT,
separate from the app session JWT. The token carries the channels the
user may subscribe to, derived from role. The client SDK refreshes it
transparently before expiry — the user never sees a reconnect.

**Driver telemetry stays HTTP.** The driver mobile keeps uploading GPS
over `POST /api/mobile/driver/location`. Location is a command with a
side effect (a DB write), not a pub/sub message. The backend, after
persisting, publishes the hint to `monitoring:{companyId}`.
`tracking_service.dart` does not change.

**Mobile WebSocket is ephemeral.** The driver app connects to Centrifugo
only while the chat screen is active and disconnects shortly after it
closes. A permanently-open socket keeps the cellular radio out of deep
sleep all shift; reconnections on hostile mobile networks cost more
battery than they save. OneSignal push wakes the app when a message
arrives while disconnected.

**Push.** OneSignal addresses devices by External ID = our `userId`
(`OneSignal.login(userId)`); the backend never stores device tokens.
After persisting a chat message the backend always fires a OneSignal
push; the mobile app suppresses the banner client-side when the chat is
already foregrounded. Android (FCM) only for now; iOS is an APNs-key
addition in OneSignal when an iOS build exists.

**Chat persistence.** Postgres is the source of truth. Two new tables:
`chat_messages` (one row per message; broadcasts fan out to one row per
driver; nullable `read_at` feeds the dispatcher's unread count) and
`chat_conversations` (one row per driver — the dispatcher inbox index:
last message, preview, unread count). Centrifugo's in-memory history is
a fast cache only; on reconnect the client reconciles against Postgres
via a cursor (`?after={createdAt}`).

## Consequences

- **Sub-second realtime, both directions.** One transport carries
  monitoring events and chat. The 10s SWR poll relaxes to 30s as a
  safety net; the map's independent 15s `setInterval` poll is removed
  entirely.
- **Chat is no longer a retrofit.** The return path exists the day the
  transport lands. The monitoring migration ships value with no chat
  code; chat builds on the same foundation afterward.
- **Horizontal scale is one config line away.** Centrifugo with the
  memory engine is single-instance. Moving to multiple app instances
  later means pointing Centrifugo at a Redis engine — the app and client
  code do not change. The decision is deferred, not foreclosed.
- **`src/lib/realtime/` is deleted.** `event-bus.ts`, `events.ts`, its
  `index.ts`, `/api/monitoring/stream/route.ts`, and
  `use-monitoring-stream.ts` go away. `publishStopEvent` /
  `publishDriverLocationEvent` become thin wrappers over an HTTP call to
  Centrifugo. This is a big-bang cut — no parallel run — consistent with
  the pre-deploy "no compat shims" stance.
- **Two new operational surfaces.** A Centrifugo container (config,
  version upgrades, the `CENTRIFUGO_*` secrets) and a OneSignal account
  (App ID, REST key, the FCM service account already uploaded). Both
  follow patterns already in the repo (Docker Compose services;
  third-party env-keyed integrations like R2).
- **Centrifugo presence is not a driver-online signal.** Because the
  mobile socket is ephemeral, presence on a chat channel means "the chat
  screen is open right now", not "the driver is on shift".
  Driver-online stays derived from `driver_locations` GPS recency.
  Future-us must not wire an "online" badge to Centrifugo presence.
- **The single VPS is still a single point of failure.** This ADR does
  not change that. If `/monitoring` becomes mission-critical enough that
  downtime is unacceptable, the follow-up is multi-instance (Redis
  engine + load balancer), not a change to this design.

## Out of scope

- The chat UX (inbox layout, thread rendering, quick-reply chrome) is a
  product decision.
- Chat features beyond the MVP: dispatcher↔dispatcher and driver↔driver
  threads, read receipts / typing indicators visible to users, photo and
  voice attachments, in-message search. Each is an additive follow-up.
- Message retention / archival policy. `chat_messages` grows unbounded
  for now; revisited when volume warrants, following the existing
  `cleanup-driver-locations.ts` precedent.
- Per-company configurable quick-reply templates. The MVP ships a
  hardcoded set.
