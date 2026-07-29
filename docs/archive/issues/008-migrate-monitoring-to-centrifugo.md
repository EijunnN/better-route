# 008 — Migrate monitoring realtime to Centrifugo, remove SSE

Type: AFK

## What to build

Move the monitoring dashboard's realtime from the in-process
`InMemoryBus` + SSE to Centrifugo. After this slice the SSE stack is
deleted. Behaviour for the dispatcher is unchanged or better — markers
and stop transitions still land in realtime; the transport underneath is
now Centrifugo.

- `publishStopEvent` and `publishDriverLocationEvent` now call
  `centrifugoPublish("monitoring:{companyId}", ...)` instead of
  `monitoringBus.publish`. Same event shapes (`kind`, payload).
- Web client: replace `use-monitoring-stream.ts` (the `EventSource`
  hook) with a Centrifugo subscription using `centrifuge` (npm). The
  client fetches a token from `/api/realtime/token`, connects,
  subscribes to `monitoring:{companyId}`, and on each event calls the
  same `handleStreamEvent` hint → SWR `mutate`. The event-as-hint model
  is unchanged.
- The SDK's `getToken` callback wired to `/api/realtime/token` for
  transparent refresh.
- Relax the SWR safety poll from 10s to 30s (`POLLING_INTERVAL` in
  `monitoring-context.tsx`).
- Remove the map's independent 15s `setInterval` poll in
  `monitoring-map.tsx` — Centrifugo events now drive map refresh.
- Delete: `src/lib/realtime/event-bus.ts`, `events.ts`, the old bus
  exports in `index.ts`, `/api/monitoring/stream/route.ts`,
  `use-monitoring-stream.ts`.

## Acceptance criteria

- [ ] Add `centrifuge` to dependencies.
- [ ] A driver location POST moves the dispatcher's map marker within
      ~1s, via Centrifugo (no SSE).
- [ ] A stop transition (COMPLETED / FAILED) lands on the dashboard
      within ~1s.
- [ ] Token refresh works — a session open longer than 15 min keeps
      receiving events without a visible reconnect.
- [ ] Tab hidden → connection paused; resumed on focus, equivalent to
      the old behaviour.
- [ ] `/api/monitoring/stream` no longer exists;
      `src/lib/realtime/event-bus.ts` and `events.ts` are deleted;
      `use-monitoring-stream.ts` is deleted.
- [ ] No references to `monitoringBus`, `EventSource`, or the 15s map
      `setInterval` remain.
- [ ] SWR poll is 30s.
- [ ] `bun run tsc --noEmit` and `bun run lint` clean; existing
      monitoring tests updated and green.

## Blocked by

- 007-centrifugo-infrastructure
