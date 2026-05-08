# 0003. Runner as a thin pipeline over explicit stages [Accepted]

Date: 2026-05-07
Status: Accepted

## Context

`optimization-runner/run.ts` was a 1310-line god function that:
- queried the DB for config, orders, vehicles, drivers, zones, presets;
- prepared derived state (zone batching, vehicle skills, depot config);
- called VROOM per zone batch (with a duplicated no-zones path);
- matched drivers to routes;
- aggregated metrics, drivers/vehicles without routes;
- ran the verifier.

Symptoms:
- Reading "how does zone-aware optimization work?" required tracing
  through ~500 interleaved lines mixing DB I/O, pure logic, and VROOM
  calls.
- The zone-aware and no-zones paths inlined the same stop/route building
  logic twice, with subtle drift.
- Stages were not testable in isolation. Anything that wanted to verify
  zone batching had to mock the entire DB and VROOM client.
- A change to driver assignment risked silently affecting how stops were
  built, because the same function did both.

## Decision

The runner is now a thin orchestrator (~510 LoC) over five explicit stages
under `optimization-runner/stages/`:

| Stage | File | Concerns | Side effects |
|---|---|---|---|
| 1. Load | `load-inputs.ts` | DB queries (config, orders, vehicles, drivers, zones, preset) | DB read |
| 2. Prepare | (in-orchestrator helpers) | derive vroomConfig, vehicleSkillsMap, orderDetailsMap | none |
| 3. Solve | `solve-batches.ts` | zone-aware (or single) VROOM orchestration | VROOM call |
| 4. Assign | `assign-drivers.ts` | promote `RawSolvedRoute → AssignedSolvedRoute` | scoring DB call |
| 5. Aggregate | `aggregate-plan.ts` | metrics, drivers/vehicles without routes | one DB call for assignment metrics |
| 6. Verify | (verifier module) | constraint checking | none |

The orchestrator owns abort signal handling and partial-snapshot
construction for cancellation; stages receive a `checkAbort` callback and
(where relevant) an `onRouteAdded` hook so the orchestrator can keep
`partialRawRoutes` in sync.

## Consequences

- **Each stage is independently testable.** `aggregatePlan` takes
  routes/metrics and returns an AggregatedPlan with no DB or VROOM
  dependency; `assignDrivers`' only side-effect is scoring; `solveBatches`
  only depends on VROOM.
- **One place per concern.** Adding a new metric ⇒ edit
  `aggregate-plan.ts`. Changing zone-batch behavior ⇒ edit
  `solve-batches.ts`. The runner stays thin.
- **The duplicated zone-aware + no-zones paths are unified.** Internal
  helpers (`toVroomOrder`, `toVroomVehicle`, `buildSolvedStops`,
  `buildRawSolvedRoute`) are shared.
- **Cost.** Total LoC across stages slightly higher than the god function
  (each stage has its own typed interface and JSDoc). Worth it — every
  responsibility lives in exactly one place.
