# 007 — Centrifugo infrastructure + realtime auth token

Type: AFK

## What to build

Stand up Centrifugo as a Docker Compose service and the server-side
plumbing the app needs to talk to it. No monitoring or chat behaviour
changes in this slice — it is pure foundation, verifiable in isolation.

- Add a `centrifugo` service to `docker-compose.yml`: image
  `centrifugo/centrifugo:v6`, memory engine, port 8000,
  `restart: unless-stopped`. Config via `CENTRIFUGO_*` env vars: HMAC
  token secret, API key, allowed origins, history size 50 / TTL 60s,
  namespaces for `monitoring` and `chat`.
- Add the new env vars to `.env.example`:
  `CENTRIFUGO_TOKEN_HMAC_SECRET_KEY`, `CENTRIFUGO_API_KEY`,
  `CENTRIFUGO_URL` (internal, e.g. `http://centrifugo:8000`).
- `GET /api/realtime/token` — reads the session cookie, returns a
  short-lived (15 min) Centrifugo JWT signed with the HMAC secret. The
  token carries `sub` (userId), `exp`, `info` (role, companyId), and
  `channels[]` — the channels the user may subscribe to, derived from
  role by a `computeAllowedChannels(user)` helper.
- `centrifugoPublish(channel, data)` helper in the new `src/lib/realtime/`
  module (which replaces the deleted bus) — POSTs to the Centrifugo HTTP
  API with the API key.
- Document, in `docs/DEPLOYMENT-ROUTING.md` or a new deployment note,
  the reverse-proxy rule routing `/connection/*` to `centrifugo:8000`.

## Acceptance criteria

- [ ] `docker compose up` brings Centrifugo healthy alongside the app;
      `/connection/websocket` reachable through the reverse proxy.
- [ ] `computeAllowedChannels` returns the stable server-side
      subscription channels per role: CONDUCTOR →
      `[chat:{companyId}:driver:{ownId}, chat:{companyId}:broadcast]`;
      PLANIFICADOR / ADMIN_FLOTA / ADMIN_SISTEMA →
      `[monitoring:{companyId}, chat:{companyId}:broadcast]`; MONITOR →
      `[monitoring:{companyId}]`; other roles → `[]`. A dispatcher's
      per-driver chat channel is **not** in the connection token (a
      wildcard cannot be a server-side subscription) — it is opened
      ad-hoc with a subscription token in issue 010.
- [ ] `GET /api/realtime/token` returns 401 without a valid session;
      with a valid session returns `{ token }` decodable by Centrifugo
      (HMAC verified).
- [ ] The token `channels[]` matches `computeAllowedChannels` for the
      caller's role; expiry is 15 min.
- [ ] ADMIN_SISTEMA path: token reflects the effective company per the
      existing tenant rules.
- [ ] `centrifugoPublish` successfully publishes to a channel (verified
      by a connected test client receiving the message).
- [ ] Unit test for `computeAllowedChannels` across all roles.
- [ ] Unit test: token issuance shape + expiry.
- [ ] `bun run tsc --noEmit` and `bun run lint` clean.

## Blocked by

- Nothing — this is the foundation.
