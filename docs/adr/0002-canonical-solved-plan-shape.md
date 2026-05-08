# 0002. Canonical SolvedPlan shape with type-driven pipeline [Accepted]

Date: 2026-05-07
Status: Accepted

## Context

The optimization module had **seven different types** representing "a
solved route" scattered across vroom-optimizer, optimizer-interface,
optimization-runner/types, balance-utils, route-map/types, and the
dashboard context — each with subtle naming differences (`vehiclePlate`
vs `vehicleIdentifier`, `latitude: string` vs `latitude: number`,
`totalWeight/totalVolume` flat vs nothing, `waitingTimeMinutes` vs
`waitingTimeSeconds`).

Symptoms:
- Adding a new field required updating 7 files; the type system didn't
  catch missed updates.
- Layer-to-layer mappers existed in 4+ places, each with its own bugs.
- The verifier ran on a *different* shape than the one persisted, so a
  bug in either side could go undetected for layers.
- `verification` was an optional field on the result. The invariant
  "every plan is verified" lived in the runner's prose, not the type.

## Decision

A single canonical shape lives in `src/lib/optimization/solved-plan/`,
modelled as a **type-driven pipeline**:

```
RawSolvedRoute  ──assignDriver──>  AssignedSolvedRoute     (per-route)
AggregatedPlan  ──verify────────>  VerifiedPlan            (per-plan)
```

Each stage is its own type. `AssignedSolvedRoute` *cannot* exist without
a driver (the field is required, not optional). `VerifiedPlan` *cannot*
exist without a verification report. The compiler enforces the lifecycle.

Coordinates are `number` everywhere inside the canonical shape;
conversion to/from strings happens only at the DB persistence boundary.
Capacity is a `Partial<Record<CapacityDimension, number>>` map (not flat
`totalWeight/totalVolume` fields), so adding a new dimension is additive
instead of touching every layer.

Zod schemas validate at three boundaries:
1. solver output → `RawSolvedRoute`
2. `VerifiedPlan` → DB persist (`optimization_jobs.result` JSONB)
3. DB JSONB → `VerifiedPlan` (read)

Inside the pipeline, the types alone are the contract.

## Consequences

- **One source of truth.** A field rename happens in one file; the
  compiler catches every missed call site.
- **Type-enforced invariants.** "Routes that hit persistence have a
  driver" and "every plan was verified" are now compiler-checked, not
  prose-checked.
- **Net code reduction.** ~640 LoC removed (deletion of legacy types and
  shape mappers).
- **Boundaries are explicit.** When VROOM changes its output, the Zod
  schema at boundary 1 fails loudly instead of producing wrong data
  downstream.
- **Costs.** Renaming `vehiclePlate` → `vehicleIdentifier` was invasive
  in the dashboard (12+ call sites). Worth it; never doing it again.
