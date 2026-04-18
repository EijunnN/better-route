# Routing Quality Report

Generated: 2026-04-18T04:56:05.035Z

Scenarios: 12 × 2 solvers = 24 runs

Passed: **22** / 24

## Summary table

| Scenario | VROOM | PyVRP |
|---|---|---|
| 01-basic-10-orders | ✅ 0un 72ms | ✅ 0un 15097ms |
| 02-tight-time-windows | ✅ 0un 109ms | ✅ 0un 30087ms |
| 03-skills-scarce | ✅ 0un 80ms | ❌ 0H 0S 4un |
| 04-capacity-at-limit | ✅ 0un 64ms | ✅ 0un 15079ms |
| 05-urgent-priority | ✅ 5un 77ms | ✅ 5un 30097ms |
| 06-vehicle-workday | ✅ 6un 107ms | ✅ 6un 30094ms |
| 07-multi-dimensional-capacity | ✅ 0un 102ms | ✅ 0un 30144ms |
| 08-max-orders-per-vehicle | ✅ 0un 110ms | ✅ 0un 30114ms |
| 09-break-time | ✅ 0un 80ms | ✅ 0un 30104ms |
| 10-infeasible-skill | ✅ 5un 58ms | ✅ 5un 15093ms |
| 11-mixed-priorities | ✅ 0un 97ms | ✅ 0un 30088ms |
| 12-stress-50-orders | ✅ 0un 108ms | ⚠️ error |

## Per-scenario detail

### 01-basic-10-orders

10 orders, 2 vehicles, no constraints — smoke test

**VROOM** — PASS in 72ms

- routes=1, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 15097ms

- routes=1, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 02-tight-time-windows

16 orders split into strict morning and afternoon windows

**VROOM** — PASS in 109ms

- routes=1, assigned=16, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 30087ms

- routes=1, assigned=16, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 03-skills-scarce

Skill-gated orders with limited capable vehicles

**VROOM** — PASS in 80ms

- routes=1, assigned=12, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — FAIL in 30085ms

- routes=1, assigned=8, unassigned=4
- violations: HARD=0, SOFT=0, INFO=4
- breakdown:
  - `UNASSIGNED_ORDER`: 4
- expectation failures:
  - unassigned 4 > allowed 0

### 04-capacity-at-limit

10 orders × 100kg, 2 vehicles × 500kg — exactly at limit

**VROOM** — PASS in 64ms

- routes=2, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 15079ms

- routes=2, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 05-urgent-priority

Capacity-constrained: URGENT orders must prevail

**VROOM** — PASS in 77ms

- routes=1, assigned=10, unassigned=5
- violations: HARD=0, SOFT=0, INFO=5
- breakdown:
  - `UNASSIGNED_ORDER`: 5

**PYVRP** — PASS in 30097ms

- routes=1, assigned=10, unassigned=5
- violations: HARD=0, SOFT=0, INFO=5
- breakdown:
  - `UNASSIGNED_ORDER`: 5

### 06-vehicle-workday

Narrow vehicle workday — stops must not spill past window

**VROOM** — PASS in 107ms

- routes=1, assigned=14, unassigned=6
- violations: HARD=0, SOFT=0, INFO=6
- breakdown:
  - `UNASSIGNED_ORDER`: 6

**PYVRP** — PASS in 30094ms

- routes=1, assigned=14, unassigned=6
- violations: HARD=0, SOFT=0, INFO=6
- breakdown:
  - `UNASSIGNED_ORDER`: 6

### 07-multi-dimensional-capacity

Mixed weight/volume demands — both dimensions matter

**VROOM** — PASS in 102ms

- routes=2, assigned=20, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 30144ms

- routes=2, assigned=20, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 08-max-orders-per-vehicle

maxOrders limit forces distribution across vehicles

**VROOM** — PASS in 110ms

- routes=3, assigned=20, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 30114ms

- routes=3, assigned=20, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 09-break-time

Mandatory lunch break 12:00-13:00 inside 08:00-18:00 workday

**VROOM** — PASS in 80ms

- routes=1, assigned=15, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 30104ms

- routes=1, assigned=15, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 10-infeasible-skill

Orders require skill no vehicle provides — must unassign

**VROOM** — PASS in 58ms

- routes=1, assigned=5, unassigned=5
- violations: HARD=0, SOFT=0, INFO=5
- breakdown:
  - `UNASSIGNED_ORDER`: 5

**PYVRP** — PASS in 15093ms

- routes=1, assigned=5, unassigned=5
- violations: HARD=0, SOFT=0, INFO=5
- breakdown:
  - `UNASSIGNED_ORDER`: 5

### 11-mixed-priorities

Mixed orderTypes — all must be assigned when capacity suffices

**VROOM** — PASS in 97ms

- routes=1, assigned=16, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 30088ms

- routes=1, assigned=16, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 12-stress-50-orders

Scale test — 50 orders, 5 vehicles

**VROOM** — PASS in 108ms

- routes=1, assigned=50, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — FAIL in 60019ms

Error: `The operation timed out.`
