# 0001. VROOM as the sole VRP solver [Accepted]

Date: 2026-05-07 (recorded retroactively; decision pre-dates this ADR)
Status: Accepted

## Context

The codebase originally supported two solvers behind an `IOptimizer`
contract: PyVRP (Python) and VROOM (C++). Both implemented the same
interface; an `optimizer-factory` selected one at runtime.

PyVRP timed out on real-world inputs (1000+ orders per plan) and the
team removed the implementation. VROOM remained the only adapter.

## Decision

VROOM is the only supported VRP solver. PyVRP and any future alternative
solvers are out of scope. Code paths that previously assumed solver
plurality (`IOptimizer`, `VroomAdapter`, `optimizer-factory`) were removed
as a hypothetical seam — see ADR-0003.

## Consequences

- **Simpler architecture.** The "solver" is `vroom-optimizer.ts`, called
  directly. No adapter, factory, or capabilities probing.
- **Solver-specific concerns leak by design.** Capacity vectors, skill
  ids, time-window strictness flags are VROOM-specific in the runner.
  This is intentional — pretending the solver is interchangeable when it
  isn't is more cost than benefit at our scale.
- **If we ever add a second solver**, this ADR is superseded and we
  re-introduce the seam from a position of "two real implementations,"
  not "one hypothetical."
