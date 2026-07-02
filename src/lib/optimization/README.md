# src/lib/optimization — pipeline VROOM

> Orientación del módulo. Canónicos: **`docs/optimization/SEMANTICS.md`**
> (semántica solver ↔ verifier, unidades, checks) y los ADRs
> **0001** (VROOM único solver), **0002** (shapes canónicos SolvedPlan),
> **0003** (runner como pipeline de stages), **0004** (lifecycle del job).
> El detalle por-directorio también está en `docs/CONTEXT.md` §Plan
> Optimization.

## Flujo

```
API route → optimization-job/ (lifecycle: PENDING→RUNNING→terminal)
              └─ optimization-runner/run.ts
                   1. stages/load-inputs.ts     — DB I/O (orders, vehicles, presets)
                   2. createZoneBatches         — src/lib/geo/zone-utils.ts
                   3. stages/solve-batches.ts   — VROOM por batch de zona
                   4. stages/assign-drivers.ts  — Raw → Assigned (usa
                                                  src/lib/routing/driver-assignment.ts)
                   5. stages/aggregate-plan.ts  — métricas → AggregatedPlan
                   6. verifier/verifyPlan       — AggregatedPlan → VerifiedPlan
              └─ persiste VerifiedPlan en optimization_jobs.result (JSONB, Zod)
```

## Piezas

- **`solved-plan/`** — shapes canónicos (`RawSolvedRoute` →
  `AssignedSolvedRoute` → `AggregatedPlan` → `VerifiedPlan`) + schemas Zod.
  La invariante "todo plan es verificado" la cumple el **tipo**
  (`verification` obligatorio), no una convención (ADR-0002). Zod solo en
  3 boundaries: output del solver, persist y read del JSONB.
- **`optimization-job/`** — state machine del job (`lifecycle.ts`), guard
  de no-reoptimización de configs CONFIRMED (`createAndExecuteJob`),
  `input-hash.ts` para caching. Concurrencia/abort en
  `src/lib/infra/job-queue.ts` (primitives genéricas, ADR-0004).
- **`optimization-runner/`** — orquestador thin + stages explícitas
  (ADR-0003); `partial-results.ts` para snapshots de cancelación
  (`isPartial: true`, nunca confirmables).
- **`vroom-optimizer.ts` / `vroom-client.ts` / `osrm-client.ts`** —
  adapter de dominio a VROOM, HTTP client y red vial OSRM. Sin fallback:
  si VROOM falla, el job FALLA (SEMANTICS §0).
- **`verifier/`** — checker independiente del solver: consume
  `AggregatedPlan`, emite `VerificationReport` (violations
  `HARD | SOFT | INFO`). Catálogo de checks: SEMANTICS §3.
- **`constants.ts` / `time-window-policy.ts` / `time-window-strictness.ts`**
  — semántica **compartida** solver↔verifier (tolerancias flex, parsing de
  ventanas). Tocar un lado exige releer SEMANTICS.
- **`plan-validation.ts`** — gate de confirmación:
  `validatePlanForConfirmation` bloquea confirmar planes con violaciones
  HARD (SEMANTICS §0; spec en `docs/specs/confirm-plan.md`).
- **`plan-metrics.ts` / `balance-utils.ts` / `preset-config.ts`** —
  métricas persistidas, fair-share de `balanceVisits`, resolución de presets.

## Testing

Harness golden: `bun run src/tests/routing-quality/run.ts` (28 escenarios);
variante con DB: `integration-runner.ts`. Ver `CLAUDE.md` §Capas de testing.
