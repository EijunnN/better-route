# Routing Quality Report

Generated: 2026-04-18T04:17:40.893Z

Scenarios: 12 × 2 solvers = 24 runs

Passed: **20** / 24

## Summary table

| Scenario | VROOM | PyVRP |
|---|---|---|
| 01-basic-10-orders | ✅ 0un 213ms | ✅ 0un 15264ms |
| 02-tight-time-windows | ❌ 1H 0S 0un | ❌ 3H 0S 0un |
| 03-skills-scarce | ✅ 0un 93ms | ❌ 0H 0S 4un |
| 04-capacity-at-limit | ✅ 0un 97ms | ✅ 0un 15080ms |
| 05-urgent-priority | ✅ 5un 103ms | ✅ 5un 30114ms |
| 06-vehicle-workday | ✅ 6un 132ms | ✅ 6un 30132ms |
| 07-multi-dimensional-capacity | ✅ 0un 174ms | ✅ 0un 30121ms |
| 08-max-orders-per-vehicle | ✅ 0un 124ms | ✅ 0un 30115ms |
| 09-break-time | ✅ 0un 85ms | ✅ 0un 30155ms |
| 10-infeasible-skill | ✅ 5un 84ms | ✅ 5un 15115ms |
| 11-mixed-priorities | ✅ 0un 109ms | ✅ 0un 30124ms |
| 12-stress-50-orders | ✅ 0un 151ms | ⚠️ error |

## Per-scenario detail

### 01-basic-10-orders

10 orders, 2 vehicles, no constraints — smoke test

**VROOM** — PASS in 213ms

- routes=1, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 15264ms

- routes=1, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 02-tight-time-windows

16 orders split into strict morning and afternoon windows

**VROOM** — FAIL in 201ms

- routes=1, assigned=16, unassigned=0
- violations: HARD=1, SOFT=0, INFO=0
- breakdown:
  - `TIME_WINDOW_VIOLATED`: 1
- expectation failures:
  - HARD violations 1 > allowed 0
- sample hard violations:
  - [TIME_WINDOW_VIOLATED] (order TRK-00012) expected=>= 14:00 actual=11:11

**PYVRP** — FAIL in 30112ms

- routes=1, assigned=16, unassigned=0
- violations: HARD=3, SOFT=0, INFO=0
- breakdown:
  - `TIME_WINDOW_VIOLATED`: 2
  - `VEHICLE_WORKDAY_EXCEEDED`: 1
- expectation failures:
  - HARD violations 3 > allowed 0
- sample hard violations:
  - [TIME_WINDOW_VIOLATED] (order TRK-00000) expected=>= 08:00 actual=00:04
  - [VEHICLE_WORKDAY_EXCEEDED] (order TRK-00000) expected=>= 08:00 actual=00:04
  - [TIME_WINDOW_VIOLATED] (order TRK-00012) expected=>= 14:00 actual=09:33

### 03-skills-scarce

Skill-gated orders with limited capable vehicles

**VROOM** — PASS in 93ms

- routes=1, assigned=12, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — FAIL in 30106ms

- routes=1, assigned=8, unassigned=4
- violations: HARD=0, SOFT=0, INFO=4
- breakdown:
  - `UNASSIGNED_ORDER`: 4
- expectation failures:
  - unassigned 4 > allowed 0

### 04-capacity-at-limit

10 orders × 100kg, 2 vehicles × 500kg — exactly at limit

**VROOM** — PASS in 97ms

- routes=2, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 15080ms

- routes=2, assigned=10, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 05-urgent-priority

Capacity-constrained: URGENT orders must prevail

**VROOM** — PASS in 103ms

- routes=1, assigned=10, unassigned=5
- violations: HARD=0, SOFT=0, INFO=5
- breakdown:
  - `UNASSIGNED_ORDER`: 5

**PYVRP** — PASS in 30114ms

- routes=1, assigned=10, unassigned=5
- violations: HARD=0, SOFT=0, INFO=5
- breakdown:
  - `UNASSIGNED_ORDER`: 5

### 06-vehicle-workday

Narrow vehicle workday — stops must not spill past window

**VROOM** — PASS in 132ms

- routes=1, assigned=14, unassigned=6
- violations: HARD=0, SOFT=0, INFO=6
- breakdown:
  - `UNASSIGNED_ORDER`: 6

**PYVRP** — PASS in 30132ms

- routes=1, assigned=14, unassigned=6
- violations: HARD=0, SOFT=0, INFO=6
- breakdown:
  - `UNASSIGNED_ORDER`: 6

### 07-multi-dimensional-capacity

Mixed weight/volume demands — both dimensions matter

**VROOM** — PASS in 174ms

- routes=2, assigned=20, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 30121ms

- routes=2, assigned=20, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 08-max-orders-per-vehicle

maxOrders limit forces distribution across vehicles

**VROOM** — PASS in 124ms

- routes=3, assigned=20, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 30115ms

- routes=3, assigned=20, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 09-break-time

Mandatory lunch break 12:00-13:00 inside 08:00-18:00 workday

**VROOM** — PASS in 85ms

- routes=1, assigned=15, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 30155ms

- routes=1, assigned=15, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 10-infeasible-skill

Orders require skill no vehicle provides — must unassign

**VROOM** — PASS in 84ms

- routes=1, assigned=5, unassigned=5
- violations: HARD=0, SOFT=0, INFO=5
- breakdown:
  - `UNASSIGNED_ORDER`: 5

**PYVRP** — PASS in 15115ms

- routes=1, assigned=5, unassigned=5
- violations: HARD=0, SOFT=0, INFO=5
- breakdown:
  - `UNASSIGNED_ORDER`: 5

### 11-mixed-priorities

Mixed orderTypes — all must be assigned when capacity suffices

**VROOM** — PASS in 109ms

- routes=1, assigned=16, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — PASS in 30124ms

- routes=1, assigned=16, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

### 12-stress-50-orders

Scale test — 50 orders, 5 vehicles

**VROOM** — PASS in 151ms

- routes=1, assigned=50, unassigned=0
- violations: HARD=0, SOFT=0, INFO=0

**PYVRP** — FAIL in 60012ms

Error: `The operation timed out.`
